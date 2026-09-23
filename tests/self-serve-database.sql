-- Run on the disposable local database after access-api-fixture.sql.
begin;
create or replace function pg_temp.denied(query text, expected text) returns void language plpgsql as $$
begin
  execute query;
  raise exception 'Expected request to be denied: %',query;
exception when others then
  if sqlerrm like 'Expected request to be denied:%' then raise; end if;
  if position(expected in sqlerrm)=0 then raise; end if;
end $$;

select public.create_join_link('bbbbbbbb-0000-4000-8000-000000000001','access-api','access-api-a','parent',repeat('a',43));
select pg_temp.denied($q$select public.create_join_link('bbbbbbbb-0000-4000-8000-000000000004','access-api','access-api-a','parent',repeat('x',43))$q$,'Team coach required');
select public.request_join('bbbbbbbb-0000-4000-8000-000000000004',repeat('a',43),'Linked Child');
select pg_temp.denied($q$select public.request_join('bbbbbbbb-0000-4000-8000-000000000004',repeat('a',43),'Linked Child')$q$,'duplicate key');
select pg_temp.denied($q$select public.review_join_request('bbbbbbbb-0000-4000-8000-000000000003',
  (select id from public.join_requests where link_token=repeat('a',43)),true,'access-api-child')$q$,'Team coach required');
select public.review_join_request('bbbbbbbb-0000-4000-8000-000000000001',
  (select id from public.join_requests where link_token=repeat('a',43)),true,'access-api-child');
do $$ begin
  if not exists(select 1 from public.parent_players where org_id='access-api'
    and user_id='bbbbbbbb-0000-4000-8000-000000000004' and player_id='access-api-child') then
    raise exception 'Approved parent is not linked to child'; end if;
end $$;
insert into public.players(id,org_id,team_id,display_name,active)
  values('access-api-child2','access-api','access-api-a','Second Child',true);
select public.request_join('bbbbbbbb-0000-4000-8000-000000000004',repeat('a',43),'Second Child');
select pg_temp.denied($q$select public.review_join_request('bbbbbbbb-0000-4000-8000-000000000001',
  (select id from public.join_requests where child_name='Second Child'),true,'access-api-private')$q$,'Choose this team');
select public.review_join_request('bbbbbbbb-0000-4000-8000-000000000001',
  (select id from public.join_requests where child_name='Second Child'),true,'access-api-child2');
do $$ begin
  if (select count(*) from public.parent_players where org_id='access-api'
    and user_id='bbbbbbbb-0000-4000-8000-000000000004')<>2 then
    raise exception 'One parent could not link two children'; end if;
end $$;

select public.create_join_link('bbbbbbbb-0000-4000-8000-000000000001','access-api',null,'coach',repeat('b',43));
select public.request_join('bbbbbbbb-0000-4000-8000-000000000003',repeat('b',43),null,'Assistant coach');
select pg_temp.denied($q$select public.review_join_request('bbbbbbbb-0000-4000-8000-000000000002',
  (select id from public.join_requests where link_token=repeat('b',43)),true,null,'access-api-b','assistant_coach')$q$,'Organization manager required');
select public.review_join_request('bbbbbbbb-0000-4000-8000-000000000001',
  (select id from public.join_requests where link_token=repeat('b',43)),true,null,'access-api-b','assistant_coach');
do $$ begin
  if not exists(select 1 from public.team_members where org_id='access-api' and team_id='access-api-b'
    and user_id='bbbbbbbb-0000-4000-8000-000000000003' and role='assistant_coach') then
    raise exception 'Approved coach does not have assigned team'; end if;
end $$;

select public.revoke_join_link('bbbbbbbb-0000-4000-8000-000000000001',repeat('a',43));
select pg_temp.denied($q$select public.request_join('bbbbbbbb-0000-4000-8000-000000000004',repeat('a',43),'Another Child')$q$,'Join link expired or unavailable');

insert into auth.users(id,email,email_confirmed_at) values
  ('cccccccc-0000-4000-8000-000000000001','new-coach@access.example.test',now()) on conflict(id) do nothing;
create temporary table new_org as select public.bootstrap_organization(
  'cccccccc-0000-4000-8000-000000000001','New Test Club','First Team') as id;
do $$ begin
  if not exists(select 1 from public.org_members where org_id=(select id from new_org)
    and user_id='cccccccc-0000-4000-8000-000000000001' and role='owner') then
    raise exception 'Creator is not organization owner'; end if;
  if not exists(select 1 from public.team_members where org_id=(select id from new_org)
    and user_id='cccccccc-0000-4000-8000-000000000001' and role='head_coach') then
    raise exception 'Creator is not first team head coach'; end if;
  if not exists(select 1 from public.org_billing where org_id=(select id from new_org)
    and owner_user_id='cccccccc-0000-4000-8000-000000000001' and seats=1
    and subscription_status='none') then
    raise exception 'Organization billing row missing'; end if;
end $$;
rollback;
