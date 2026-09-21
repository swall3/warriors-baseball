\set ON_ERROR_STOP on
-- Only for the isolated local test database, never a production database.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.organizations(id text primary key);
create table public.teams(org_id text not null references organizations(id),id text not null,primary key(org_id,id));
insert into organizations values ('test-a'),('test-b');
insert into teams values ('test-a','team-a'),('test-b','team-b');
\ir ../supabase/migrations/20260921192619_live_game_commands.sql

insert into live_games(org_id,id,team_id,state) values
('test-a','same-id','team-a','{"id":"same-id","revision":0,"config":{"teamId":"team-a"},"pitchCount":0}'),
('test-b','same-id','team-b','{"id":"same-id","revision":0,"config":{"teamId":"team-b"},"pitchCount":0}');

set role service_role;
do $$
declare r jsonb;
begin
  r:=public.commit_live_game_command('test-a','same-id','command-1',0,'{"type":"pitch"}',
    '{"id":"same-id","revision":1,"config":{"teamId":"team-a"},"pitchCount":1}','pitch','grant-a');
  assert (r->'state'->>'pitchCount')::integer=1, 'first pitch';
  r:=public.commit_live_game_command('test-a','same-id','command-1',0,'{"type":"pitch"}',
    '{"id":"same-id","revision":1,"config":{"teamId":"team-a"},"pitchCount":1}','pitch','grant-a');
  assert (r->>'duplicate')::boolean, 'duplicate recognized';
  assert (select count(*)=1 from public.live_game_commands where org_id='test-a'), 'one command receipt';
  r:=public.commit_live_game_command('test-a','same-id','command-2',0,'{"type":"pitch"}',
    '{"id":"same-id","revision":1,"config":{"teamId":"team-a"},"pitchCount":1}','pitch','grant-a');
  assert r->>'error'='conflict', 'stale command rejected';
  r:=public.commit_live_game_command('test-a','same-id','command-1',0,'{"type":"finish"}',
    '{}','coach','coach-session');
  assert r->>'error'='id_reused', 'payload/actor mismatch rejected';
  assert (select revision=0 from public.live_games where org_id='test-b' and id='same-id'), 'other tenant unchanged';
  r:=public.commit_live_game_command('test-b','missing','command-1',0,'{}','{}','pitch','grant-a');
  assert r->>'error'='not_found', 'missing game rejected';
end $$;
reset role;
do $$
begin
  assert not has_table_privilege('anon','public.live_games','SELECT'), 'anon game read denied';
  assert not has_table_privilege('authenticated','public.live_game_grants','SELECT'), 'grant read denied';
  assert not has_function_privilege('anon','public.commit_live_game_command(text,text,text,integer,jsonb,jsonb,text,text)','EXECUTE'), 'anon rpc denied';
  assert not has_function_privilege('authenticated','public.commit_live_game_command(text,text,text,integer,jsonb,jsonb,text,text)','EXECUTE'), 'authenticated rpc denied';
  assert (select bool_and(relrowsecurity) from pg_class where oid in ('public.live_games'::regclass,'public.live_game_commands'::regclass,'public.live_game_grants'::regclass)), 'RLS enabled';
end $$;
select 'live database assertions passed' as result;
