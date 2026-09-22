-- Only the disposable local test database.
insert into organizations(id,name,active,account_access_enabled) values('access-api','Access Test Club',true,true),('access-api-other','Other Test Club',true,true) on conflict(id) do update set account_access_enabled=true;
insert into auth.users(id,email,email_confirmed_at) values
 ('bbbbbbbb-0000-4000-8000-000000000001','owner@access.example.test',now()),
 ('bbbbbbbb-0000-4000-8000-000000000002','coach@access.example.test',now()),
 ('bbbbbbbb-0000-4000-8000-000000000003','parent@access.example.test',now()),
 ('bbbbbbbb-0000-4000-8000-000000000004','other@access.example.test',now()) on conflict(id) do nothing;
insert into org_members(org_id,user_id,role) values
 ('access-api','bbbbbbbb-0000-4000-8000-000000000001','owner'),
 ('access-api','bbbbbbbb-0000-4000-8000-000000000002','member'),
 ('access-api','bbbbbbbb-0000-4000-8000-000000000003','member'),
 ('access-api-other','bbbbbbbb-0000-4000-8000-000000000004','owner') on conflict do nothing;
insert into teams(id,org_id,name,kind) values('access-api-a','access-api','Team A','own'),('access-api-b','access-api','Team B','own') on conflict do nothing;
insert into team_members(org_id,team_id,user_id,role) values
 ('access-api','access-api-a','bbbbbbbb-0000-4000-8000-000000000002','head_coach'),
 ('access-api','access-api-a','bbbbbbbb-0000-4000-8000-000000000003','parent') on conflict do nothing;
insert into players(id,org_id,team_id,display_name,active) values('access-api-child','access-api','access-api-a','Linked Child',true),('access-api-private','access-api','access-api-b','Private Child',true) on conflict do nothing;
insert into parent_players values('access-api','access-api-a','bbbbbbbb-0000-4000-8000-000000000003','access-api-child') on conflict do nothing;
notify pgrst,'reload schema';
