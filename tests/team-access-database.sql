-- Run only against the disposable local test database. All rows roll back.
\set ON_ERROR_STOP on
begin;
insert into organizations(id,name,active) values('access-test','Access test',true),('access-other','Other',true);
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-0000-4000-8000-000000000001','owner@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000002','head@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000003','assistant@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000004','parent@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000005','stranger@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000006','manager@example.test',now());
insert into org_members values('access-test','aaaaaaaa-0000-4000-8000-000000000001','owner',now());
insert into teams(id,org_id,name,kind) values('access-a','access-test','A','own'),('access-b','access-test','B','own');
insert into players(id,org_id,team_id,display_name,active) values('access-child','access-test','access-a','Child',true);
create function pg_temp.deny(q text) returns void language plpgsql as $$
declare denied boolean:=false; begin
  begin execute q; exception when others then denied:=true; end;
  if not denied then raise exception 'Expected permission denial: %',q; end if;
end $$;
set local role service_role;
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000005','enable')$q$);
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','enable');
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','invite',jsonb_build_object('teamId','access-a','email','head@example.test','role','head_coach','tokenHash',repeat('a',64)));
select pg_temp.deny($q$select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000005',repeat('a',64))$q$);
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000002',repeat('a',64));
select pg_temp.deny($q$select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000002',repeat('a',64))$q$);
select pg_temp.deny($q$select manage_team_access('access-other','aaaaaaaa-0000-4000-8000-000000000002','create_team','{"name":"Bad"}')$q$);
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000002','invite',jsonb_build_object('teamId','access-b','email','stranger@example.test','role','assistant_coach','tokenHash',repeat('b',64)))$q$);
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000002','invite',jsonb_build_object('email','stranger@example.test','role','manager','tokenHash',repeat('b',64)))$q$);
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000002','invite',jsonb_build_object('teamId','access-a','email','assistant@example.test','role','assistant_coach','tokenHash',repeat('b',64)));
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000003',repeat('b',64));
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000003','invite',jsonb_build_object('teamId','access-a','email','parent@example.test','role','parent','playerId','access-child','tokenHash',repeat('c',64)));
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000004',repeat('c',64));
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000004','invite',jsonb_build_object('teamId','access-a','email','stranger@example.test','role','parent','playerId','access-child','tokenHash',repeat('d',64)))$q$);
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000004','transfer_team','{"teamId":"access-a","userId":"aaaaaaaa-0000-4000-8000-000000000004"}')$q$);
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000003','remove_member','{"teamId":"access-a","userId":"aaaaaaaa-0000-4000-8000-000000000002"}')$q$);
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','transfer_org','{"userId":"aaaaaaaa-0000-4000-8000-000000000005"}')$q$);
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','remove_member','{"userId":"aaaaaaaa-0000-4000-8000-000000000001"}')$q$);
-- Coach invites another parent, then leaves. That pending invitation must be invalidated.
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000002','invite',jsonb_build_object('teamId','access-a','email','stranger@example.test','role','parent','playerId','access-child','tokenHash',repeat('d',64)));
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000002','transfer_team','{"teamId":"access-a","userId":"aaaaaaaa-0000-4000-8000-000000000003"}');
select pg_temp.deny($q$select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000005',repeat('d',64))$q$);
select pg_temp.deny($q$select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000002','invite',jsonb_build_object('teamId','access-a','email','stranger@example.test','role','parent','playerId','access-child','tokenHash',repeat('e',64)))$q$);
do $$ begin
 if exists(select 1 from team_members where team_id='access-a' and user_id='aaaaaaaa-0000-4000-8000-000000000002') then raise exception 'Departed head still has access'; end if;
 if not exists(select 1 from team_members where team_id='access-a' and user_id='aaaaaaaa-0000-4000-8000-000000000003' and role='head_coach') then raise exception 'Handoff missing'; end if;
 if (select count(*) from parent_players where player_id='access-child')<>1 then raise exception 'Parent link missing'; end if;
 if has_table_privilege('authenticated','team_members','select') or has_table_privilege('authenticated','players','select') then raise exception 'Browser API bypass'; end if;
 if has_function_privilege('authenticated','manage_team_access(text,uuid,text,jsonb)','execute') then raise exception 'RPC bypass'; end if;
end $$;
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','invite',jsonb_build_object('email','manager@example.test','role','manager','tokenHash',repeat('f',64)));
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000006',repeat('f',64));
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','transfer_org','{"userId":"aaaaaaaa-0000-4000-8000-000000000006"}');
do $$ begin
 if (select count(*) from org_members where org_id='access-test' and role='owner')<>1 then raise exception 'Organization needs one owner'; end if;
 if not exists(select 1 from org_members where org_id='access-test' and user_id='aaaaaaaa-0000-4000-8000-000000000006' and role='owner') then raise exception 'Wrong owner'; end if;
end $$;
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000006','remove_member','{"teamId":"access-a","userId":"aaaaaaaa-0000-4000-8000-000000000004"}');
do $$ begin if exists(select 1 from parent_players where player_id='access-child') then raise exception 'Removed parent retains player links'; end if; end $$;
rollback;
