begin;
-- Historical import replacement is one transaction, including metadata.
-- Only the server service role may call this; p_org comes from a verified session.
create or replace function public.sync_historical_game(p_org text,p_game jsonb,p_events jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_team text; v_game text; v_links jsonb; v_name text;
begin
 if coalesce(p_org,'')='' or coalesce(p_game->>'client_game_id','')='' or jsonb_typeof(p_events)<>'array' then
  raise exception 'Invalid historical game';
 end if;
 perform pg_advisory_xact_lock(hashtext(p_org),hashtext(p_game->>'client_game_id'));
 v_name := p_game->>'opponent_name';
 insert into public.teams(org_id,id,name,normalized_name,kind)
 values(p_org,'team-'||gen_random_uuid(),v_name,lower(v_name),'opponent')
 on conflict (org_id,normalized_name) do update
 set name=case when teams.kind='opponent' then excluded.name else teams.name end
 returning id into v_team;
 insert into public.games(org_id,id,client_game_id,label,played_at,opponent_team_id,us_score,opponent_score,source,schema_version,us_home,updated_at)
 values(p_org,'game-'||gen_random_uuid(),p_game->>'client_game_id',p_game->>'label',(p_game->>'played_at')::timestamptz,v_team,(p_game->>'us_score')::int,(p_game->>'opponent_score')::int,'local_storage',(p_game->>'schema_version')::int,(p_game->>'us_home')::boolean,now())
 on conflict(org_id,client_game_id) do update set label=excluded.label,played_at=excluded.played_at,opponent_team_id=excluded.opponent_team_id,us_score=excluded.us_score,opponent_score=excluded.opponent_score,schema_version=excluded.schema_version,us_home=excluded.us_home,updated_at=now()
 returning id into v_game;
 select coalesce(jsonb_object_agg(client_pin_id,batter_player_id) filter(where batter_player_id is not null),'{}') into v_links from public.play_events where org_id=p_org and game_id=v_game;
 delete from public.play_events where org_id=p_org and game_id=v_game;
 insert into public.play_events(org_id,id,game_id,event_index,client_pin_id,inning,batter,batting_team,result,zone,x,y,event_type,event_timestamp,description,outs_after,us_runs_after,opponent_runs_after,bases_after,batter_player_id)
 select p_org,'evt-'||gen_random_uuid(),v_game,(ordinality-1)::int,e->>'client_pin_id',(e->>'inning')::int,e->>'batter',e->>'batting_team',e->>'result',e->>'zone',(e->>'x')::double precision,(e->>'y')::double precision,e->>'event_type',(e->>'event_timestamp')::timestamptz,e->>'description',(e->>'outs_after')::int,(e->>'us_runs_after')::int,(e->>'opponent_runs_after')::int,e->'bases_after',v_links->>(e->>'client_pin_id')
 from jsonb_array_elements(p_events) with ordinality as events(e,ordinality);
 return jsonb_build_object('gameId',p_game->>'client_game_id','syncedEvents',jsonb_array_length(p_events));
end $$;
revoke all on function public.sync_historical_game(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_historical_game(text,jsonb,jsonb) to service_role;

-- The event trigger has no browser RPC use. current_org_ids intentionally
-- remains callable by authenticated policies, but anonymous callers don't need it.
do $$ begin
 if to_regprocedure('public.current_org_ids()') is not null then execute 'revoke execute on function public.current_org_ids() from anon'; end if;
 if to_regprocedure('public.rls_auto_enable()') is not null then execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated'; end if;
end $$;

-- Cover the historical report and sync predicates without deleting existing indexes.
create index if not exists idx_play_events_org_game on public.play_events(org_id,game_id,event_index);

notify pgrst, 'reload schema';
commit;
