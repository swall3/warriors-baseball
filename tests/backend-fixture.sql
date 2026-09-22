-- Only the disposable codex-ninety-feet-db-tests database.
\set ON_ERROR_STOP on
alter table teams add column if not exists kind text default 'opponent';
update teams set kind='own' where id in ('team-review-warriors','team-review-talking');
update teams set normalized_name=lower(name) where normalized_name is null;
create unique index if not exists test_teams_normalized on teams(org_id,normalized_name);
create unique index if not exists test_game_client on games(org_id,client_game_id);
alter table play_events add column if not exists batter_player_id text;
create table if not exists lineup_plans(org_id text not null,id text not null,game_id text,team_id text not null,label text,format text,batting_order jsonb,groups jsonb,inning_map jsonb,updated_at timestamptz,primary key(org_id,id));
grant select,insert,update,delete on teams,games,play_events,lineup_plans to service_role;
notify pgrst,'reload schema';

create table if not exists tryout_signups(id uuid primary key default gen_random_uuid(),org_id text not null,player_name text,age integer,parent_name text,phone text,email text,position text,experience text,notes text,signed_up_at timestamptz);
alter table tryout_signups enable row level security;
grant insert on tryout_signups to anon;
grant select,insert on tryout_signups to service_role;
drop policy if exists test_signup_insert on tryout_signups;
create policy test_signup_insert on tryout_signups for insert to anon with check(org_id='org-outlaws');
notify pgrst,'reload schema';
