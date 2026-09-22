-- ONLY for codex-ninety-feet-db-tests, the disposable local review database.
\set ON_ERROR_STOP on
alter table teams add column if not exists normalized_name text, add column if not exists created_at timestamptz default now();
create table if not exists games (id text primary key, org_id text not null, client_game_id text, label text, played_at text, opponent_team_id text, us_score int, opponent_score int, source text, schema_version int, us_home boolean, created_at text, updated_at text);
create table if not exists play_events (id text primary key,org_id text not null,game_id text,event_index int,client_pin_id text,inning int,batter text,batting_team text,result text,zone text,x numeric,y numeric,event_type text,event_timestamp text,description text,outs_after int,us_runs_after int,opponent_runs_after int,bases_after jsonb,created_at text);
insert into games values ('history-review','org-outlaws','history-review','Density review fixture','2026-09-22','team-review-warriors',0,0,'local_storage',2,true,'2026-09-22','2026-09-22') on conflict do nothing;
insert into play_events(id,org_id,game_id,event_index,client_pin_id,inning,batter,batting_team,result,zone,x,y,event_type,event_timestamp,description,created_at)
select 'density-'||i,'org-outlaws','history-review',i,'density-'||i,1,'Review player '||(i%9+1),case when i%3=0 then 'them' else 'us' end,case when i%4=0 then 'out' else 'single' end,case when i%5=0 then 'right_field' else 'left_field' end,case when i%5=0 then 66+(i%13)/2.0 else 24+(i%17)/2.0 end,28+(i%19)/2.0,'ball_in_play','2026-09-22','Synthetic density review','2026-09-22' from generate_series(1,1101) i on conflict do nothing;
insert into play_events(id,org_id,game_id,event_index,inning,batter,batting_team,result,zone,x,y,event_type) values('review-pitch','org-outlaws','history-review',1102,1,'Review pitcher','us','strikeout','pitcher_zone',50,70,'pitch') on conflict do nothing;
grant select on games,play_events to service_role;
notify pgrst,'reload schema';
