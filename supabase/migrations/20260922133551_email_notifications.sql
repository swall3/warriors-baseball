begin;
create table public.notification_preferences (
 org_id text not null, team_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
 games boolean not null default false, training boolean not null default false, billing boolean not null default false,
 updated_at timestamptz not null default now(), primary key(org_id,team_id,user_id),
 foreign key(org_id,team_id) references public.teams(org_id,id)
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), org_id text not null, team_id text not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null, category text not null check(category in ('games','training','billing','test')),
 kind text not null, details jsonb not null default '{}',
 status text not null default 'pending' check(status in ('pending','sending','accepted','skipped','review')),
 created_at timestamptz not null default now(), first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(), lock_token uuid, lock_until timestamptz,
 attempts integer not null default 0, payload jsonb, provider_id text, last_error text,
 unique(org_id,team_id,user_id,event_key), foreign key(org_id,team_id) references public.teams(org_id,id)
);
create index notification_due on public.notification_outbox(org_id,status,next_attempt_at);
create index notification_user on public.notification_outbox(user_id);
create index notification_preferences_user on public.notification_preferences(user_id);
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
revoke all on public.notification_preferences,public.notification_outbox from public,anon,authenticated;
grant select,insert,update on public.notification_preferences,public.notification_outbox to service_role;

-- Queue in the same transaction as the business event. No emails or player details here.
create function public.queue_team_notification(p_org text,p_team text,p_key text,p_category text,p_kind text,p_details jsonb)
returns void language sql security invoker set search_path='' as $$
 insert into public.notification_outbox(org_id,team_id,user_id,event_key,category,kind,details)
 select b.org_id,b.team_id,b.owner_user_id,p_key,p_category,p_kind,p_details
 from public.team_billing b join public.notification_preferences p
 on p.org_id=b.org_id and p.team_id=b.team_id and p.user_id=b.owner_user_id
 join public.organizations o on o.id=b.org_id and o.active
 where b.org_id=p_org and b.team_id=p_team and
 case p_category when 'games' then p.games when 'training' then p.training when 'billing' then p.billing else false end
 on conflict(org_id,team_id,user_id,event_key) do nothing;
$$;
create function public.notify_game_change() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text; d jsonb;
begin
 if TG_OP='INSERT' then k:='game_prepared';
 elsif new.state->>'status'='final' and old.state->>'status' is distinct from 'final' then k:='game_final';
 elsif new.state->>'status'='ready' and (new.state#>'{config,date}' is distinct from old.state#>'{config,date}' or new.state#>'{config,opponent}' is distinct from old.state#>'{config,opponent}') then k:='game_changed';
 else return new; end if;
 d:=jsonb_build_object('gameId',new.id,'teamName',new.state#>>'{config,teamName}','opponent',new.state#>>'{config,opponent}','date',new.state#>>'{config,date}','score',new.state->'score');
 perform public.queue_team_notification(new.org_id,new.team_id,'game:'||new.id||':'||new.revision,'games',k,d);
 return new;
end $$;
create trigger queue_game_email after insert or update on public.live_games for each row execute function public.notify_game_change();
create function public.notify_training_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
declare t text;
begin
 select team_id into t from public.players where org_id=new.org_id and id=new.player_id;
 perform public.queue_team_notification(new.org_id,t,'training:'||new.id,'training','training_assigned','{}');
 return new;
end $$;
create trigger queue_training_email after insert on public.training_assignments for each row execute function public.notify_training_assignment();
create function public.notify_billing_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.subscription_status is distinct from old.subscription_status or new.cancel_at_period_end is distinct from old.cancel_at_period_end then
 perform public.queue_team_notification(new.org_id,new.team_id,'billing:'||gen_random_uuid()::text,'billing','billing_changed',jsonb_build_object('status',new.subscription_status,'cancelAtPeriodEnd',new.cancel_at_period_end));
 end if;
 return new;
end $$;
create trigger queue_billing_email after update on public.team_billing for each row execute function public.notify_billing_change();

create function public.claim_notification(p_org text,p_team text,p_token uuid)
returns setof public.notification_outbox language plpgsql security invoker set search_path='' as $$
begin
 -- Provider idempotency lasts 24h. Ambiguous old sends require review, never blind resends.
 update public.notification_outbox set status='review',last_error='Delivery window expired; inspect Resend before resending.'
 where org_id=p_org and (p_team is null or team_id=p_team) and status in ('pending','sending')
 and (lock_until is null or lock_until<now()) and (first_attempt_at<now()-interval '23 hours' or attempts>=5);
 return query with candidate as (
 select id from public.notification_outbox where org_id=p_org and (p_team is null or team_id=p_team)
 and status in ('pending','sending') and next_attempt_at<=now() and (lock_until is null or lock_until<now())
 order by created_at for update skip locked limit 1
 ) update public.notification_outbox n set status='sending',lock_token=p_token,lock_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
 from candidate c where n.id=c.id returning n.*;
end $$;
revoke all on function public.queue_team_notification(text,text,text,text,text,jsonb),public.notify_game_change(),public.notify_training_assignment(),public.notify_billing_change(),public.claim_notification(text,text,uuid) from public,anon,authenticated;
grant execute on function public.queue_team_notification(text,text,text,text,text,jsonb),public.notify_game_change(),public.notify_training_assignment(),public.notify_billing_change(),public.claim_notification(text,text,uuid) to service_role;
commit;
