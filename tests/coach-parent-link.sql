-- Run against the disposable access-api fixture. All mutations roll back.
begin;

select public.manage_team_access(
  'access-api',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'set_role',
  '{"teamId":"access-api-a","userId":"bbbbbbbb-0000-4000-8000-000000000003","role":"assistant_coach"}'
);

do $$
begin
  if not exists (
    select 1 from public.team_members
    where org_id = 'access-api' and team_id = 'access-api-a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000003'
      and role = 'assistant_coach'
  ) then raise exception 'Parent promotion did not grant assistant coach'; end if;
  if not exists (
    select 1 from public.parent_players
    where org_id = 'access-api' and team_id = 'access-api-a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000003'
      and player_id = 'access-api-child'
  ) then raise exception 'Parent promotion removed the child link'; end if;
end $$;

select public.manage_team_access(
  'access-api',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'transfer_team',
  '{"teamId":"access-api-a","userId":"bbbbbbbb-0000-4000-8000-000000000003"}'
);

do $$
begin
  if not exists (
    select 1 from public.team_members
    where org_id = 'access-api' and team_id = 'access-api-a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000003'
      and role = 'head_coach'
  ) then raise exception 'Team handoff did not make parent head coach'; end if;
  if not exists (
    select 1 from public.parent_players
    where org_id = 'access-api' and team_id = 'access-api-a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000003'
      and player_id = 'access-api-child'
  ) then raise exception 'Team handoff removed the child link'; end if;
end $$;

select public.manage_team_access(
  'access-api',
  'bbbbbbbb-0000-4000-8000-000000000001',
  'remove_member',
  '{"teamId":"access-api-a","userId":"bbbbbbbb-0000-4000-8000-000000000003"}'
);

do $$
begin
  if exists (
    select 1 from public.parent_players
    where org_id = 'access-api' and team_id = 'access-api-a'
      and user_id = 'bbbbbbbb-0000-4000-8000-000000000003'
  ) then raise exception 'Removed team member retained the child link'; end if;
end $$;

rollback;
