-- Run only against the disposable local test database. All rows roll back.
\set ON_ERROR_STOP on
begin;
insert into organizations(id,slug,name,active) values('access-test','access-test','Access test',true),('access-other','access-other','Other',true);
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-0000-4000-8000-000000000001','owner@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000002','head@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000003','assistant@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000004','parent@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000005','stranger@example.test',now()),
 ('aaaaaaaa-0000-4000-8000-000000000006','manager@example.test',now());
insert into org_members values('access-test','aaaaaaaa-0000-4000-8000-000000000001','owner',now());
insert into teams(id,org_id,name,normalized_name,kind) values('access-a','access-test','A','a','own'),('access-b','access-test','B','b','own');
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

-- ---------------------------------------------------------------------------
-- Decision 5 (PRACTICE-ASSIGNMENT-AND-DRILLS.md): a parent with more than one
-- linked player, same team, different team, and a different organization.
-- ---------------------------------------------------------------------------
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-0000-4000-8000-000000000007','multikid@example.test',now());
insert into teams(id,org_id,name,normalized_name,kind) values('access-c','access-test','C','c','own');
insert into players(id,org_id,team_id,display_name,active) values
 ('access-kid1','access-test','access-c','Kid One',true),
 ('access-kid2','access-test','access-c','Kid Two',true),
 ('access-kid3','access-test','access-b','Kid Three',true);
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','invite',jsonb_build_object('teamId','access-c','email','multikid@example.test','role','head_coach','tokenHash',repeat('1',64)));
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000007',repeat('1',64));
-- The head coach of C now invites themselves as... no: invite two SIBLING
-- parent invitations for the same team from the org owner, both pending.
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','invite',jsonb_build_object('teamId','access-c','email','parent@example.test','role','parent','playerId','access-kid1','tokenHash',repeat('2',64)));
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000001','invite',jsonb_build_object('teamId','access-c','email','parent@example.test','role','parent','playerId','access-kid2','tokenHash',repeat('3',64)));
do $$ begin
 -- REGRESSION: before the player_id-scoped revoke, issuing the second child's
 -- invitation silently revoked the first child's still-pending invitation.
 if exists(select 1 from access_invitations where token_hash=repeat('2',64) and revoked_at is not null) then
   raise exception 'Second child invitation revoked the first child''s pending invitation';
 end if;
 if exists(select 1 from access_invitations where token_hash=repeat('3',64) and revoked_at is not null) then
   raise exception 'Sibling invitation was unexpectedly revoked';
 end if;
end $$;
-- Same parent, different team, same org (access-b) — a third, independent invite.
select manage_team_access('access-test','aaaaaaaa-0000-4000-8000-000000000006','invite',jsonb_build_object('teamId','access-b','email','parent@example.test','role','parent','playerId','access-kid3','tokenHash',repeat('4',64)));
-- Accept all three as the same verified parent account. Order matters: kid 2
-- accepted before kid 1 must not disturb kid 1's still-pending invitation,
-- and kid 3 (a different team) must not touch either.
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000004',repeat('3',64));
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000004',repeat('2',64));
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000004',repeat('4',64));
do $$ begin
 -- One team_members row per (org,team,user) even with two players on the same team.
 if (select count(*) from team_members where org_id='access-test' and team_id='access-c' and user_id='aaaaaaaa-0000-4000-8000-000000000004')<>1 then
   raise exception 'Expected exactly one team_members row for the same team';
 end if;
 if (select count(*) from parent_players where org_id='access-test' and team_id='access-c' and user_id='aaaaaaaa-0000-4000-8000-000000000004')<>2 then
   raise exception 'Expected both same-team siblings linked';
 end if;
 -- A second team_members row for the cross-team sibling, same org, same user.
 if not exists(select 1 from team_members where org_id='access-test' and team_id='access-b' and user_id='aaaaaaaa-0000-4000-8000-000000000004' and role='parent') then
   raise exception 'Cross-team sibling link missing';
 end if;
 if (select count(distinct team_id) from team_members where org_id='access-test' and user_id='aaaaaaaa-0000-4000-8000-000000000004')<>2 then
   raise exception 'Parent should be linked on exactly two teams in this org';
 end if;
 -- All three player links, across two teams, one org, one verified account.
 if (select count(*) from parent_players where org_id='access-test' and user_id='aaaaaaaa-0000-4000-8000-000000000004')<>3 then
   raise exception 'Expected three total player links for the multi-kid parent';
 end if;
end $$;
-- Cross-organization isolation: the same verified email, unrelated org, must
-- not be reachable or visible through access-test's rows.
insert into org_members values('access-other','aaaaaaaa-0000-4000-8000-000000000001','owner',now());
update organizations set account_access_enabled=true where id='access-other';
insert into teams(id,org_id,name,normalized_name,kind) values('access-d','access-other','D','d','own');
insert into players(id,org_id,team_id,display_name,active) values('access-kid4','access-other','access-d','Kid Four',true);
select manage_team_access('access-other','aaaaaaaa-0000-4000-8000-000000000001','invite',jsonb_build_object('teamId','access-d','email','parent@example.test','role','parent','playerId','access-kid4','tokenHash',repeat('5',64)));
select accept_team_invitation('aaaaaaaa-0000-4000-8000-000000000004',repeat('5',64));
do $$ begin
 if not exists(select 1 from org_members where org_id='access-other' and user_id='aaaaaaaa-0000-4000-8000-000000000004') then
   raise exception 'Cross-org membership missing';
 end if;
 -- Session resolution is per-org (accountSession takes one orgId); this
 -- asserts the row-level scoping that isolation depends on: an org-scoped
 -- query for access-test never returns access-other's player link.
 if exists(select 1 from parent_players where org_id='access-test' and player_id='access-kid4') then
   raise exception 'Cross-org player link leaked into the other organization''s rows';
 end if;
 if (select count(*) from parent_players where org_id='access-other' and user_id='aaaaaaaa-0000-4000-8000-000000000004')<>1 then
   raise exception 'Expected exactly one player link in the other organization';
 end if;
 -- The parent's access-test links are unaffected by the access-other accept.
 if (select count(*) from parent_players where org_id='access-test' and user_id='aaaaaaaa-0000-4000-8000-000000000004')<>3 then
   raise exception 'Cross-org accept disturbed the original organization''s links';
 end if;
end $$;
rollback;
