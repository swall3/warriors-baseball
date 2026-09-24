-- Server-mediated membership control. No browser role can call these RPCs.
alter table public.organizations add column account_access_enabled boolean not null default false;
alter table public.org_members drop constraint org_members_role_check;
update public.org_members set role='member' where role in ('coach','viewer');
alter table public.org_members add constraint org_members_role_check check(role in ('owner','manager','member'));
alter table public.org_members alter column role set default 'member';

create table public.team_members (
  org_id text not null,
  team_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('head_coach','assistant_coach','parent')),
  created_at timestamptz not null default now(),
  primary key(org_id,team_id,user_id),
  foreign key(org_id,team_id) references public.teams(org_id,id) on delete cascade,
  foreign key(org_id,user_id) references public.org_members(org_id,user_id) on delete cascade
);
create unique index one_head_coach on public.team_members(org_id,team_id) where role='head_coach';
create index team_members_user on public.team_members(user_id);
create table public.parent_players (
  org_id text not null, team_id text not null, user_id uuid not null, player_id text not null,
  primary key(org_id,team_id,user_id,player_id),
  foreign key(org_id,team_id,user_id) references public.team_members(org_id,team_id,user_id) on delete cascade,
  foreign key(org_id,player_id) references public.players(org_id,id) on delete cascade
);
create table public.access_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations(id), team_id text,
  email text not null check(email=lower(email) and length(email)<=254),
  role text not null check(role in ('manager','head_coach','assistant_coach','parent')),
  player_id text,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz, revoked_at timestamptz,
  foreign key(org_id,team_id) references public.teams(org_id,id),
  foreign key(org_id,player_id) references public.players(org_id,id),
  check((role='manager' and team_id is null) or (role<>'manager' and team_id is not null)),
  check(role='parent' or player_id is null)
);
create table public.access_audit (
  id bigint generated always as identity primary key,
  org_id text not null references public.organizations(id), team_id text,
  actor_id uuid not null, action text not null, target_id text,
  created_at timestamptz not null default now()
);

-- Existing billing ownership identifies the verified bootstrap owner, not a passcode holder.
insert into public.org_members(org_id,user_id,role)
select org_id,min(owner_user_id::text)::uuid,'owner' from public.team_billing
where owner_user_id is not null group by org_id having count(distinct owner_user_id)=1
on conflict(org_id,user_id) do nothing;

-- Membership-aware accounts must not inherit the older organization-wide Data API policies.
-- The application uses service-role queries with explicit request authorization.
do $$ declare t text; begin
  foreach t in array array['org_members','team_members','parent_players','access_invitations','access_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
  foreach t in array array['teams','games','play_events','players','player_aliases','lineup_plans'] loop
    execute format('revoke all on public.%I from anon, authenticated',t);
  end loop;
end $$;
grant usage,select on sequence public.access_audit_id_seq to service_role;
grant select,update on public.organizations to service_role;
grant usage on schema auth to service_role;
-- Invoker RPCs need only these identity fields, never password hashes or tokens.
grant select(id,email,email_confirmed_at,is_anonymous,banned_until) on auth.users to service_role;

-- Every operation serializes on its organization, rechecking current authority under the lock.
create function public.manage_team_access(p_org text,p_actor uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  org_role text; team_role text; target_role text; target_org_role text;
  team text:=p_data->>'teamId'; target uuid; r text:=p_data->>'role';
  invite public.access_invitations; result jsonb:='{}'; target_email text; enabled boolean;
begin
  select account_access_enabled into enabled from public.organizations where id=p_org and active for update;
  if not found then raise exception 'Organization unavailable'; end if;
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and coalesce(is_anonymous,false)=false and (banned_until is null or banned_until<now())) then
    raise exception 'Verified account required';
  end if;
  select role into org_role from public.org_members where org_id=p_org and user_id=p_actor;
  select role into team_role from public.team_members where org_id=p_org and team_id=team and user_id=p_actor;
  if org_role is null then raise exception 'Membership required'; end if;
  if p_action='enable' then
    if org_role<>'owner' then raise exception 'Organization owner required'; end if;
    update public.organizations set account_access_enabled=true where id=p_org;
  elsif p_action='create_team' then
    if org_role not in ('owner','manager') then raise exception 'Organization manager required'; end if;
    if length(trim(coalesce(p_data->>'name',''))) not between 1 and 80 then raise exception 'Team name required'; end if;
    team:='team-'||gen_random_uuid()::text;
    insert into public.teams(id,org_id,name,normalized_name,kind) values(team,p_org,trim(p_data->>'name'),lower(trim(p_data->>'name')),'own');
    insert into public.team_billing(org_id,team_id,owner_user_id) select p_org,team,user_id from public.org_members where org_id=p_org and role='owner' order by created_at limit 1;
    result:=jsonb_build_object('teamId',team);
  elsif p_action='invite' then
    if not enabled then raise exception 'Enable account access before inviting'; end if;
    if (select count(*) from public.access_audit where actor_id=p_actor and action='invite' and created_at>now()-interval '1 hour')>=25 then raise exception 'Invitation limit reached; try again later'; end if;
    if r='manager' then
      if org_role<>'owner' or team is not null then raise exception 'Organization owner required'; end if;
    else
      if team is null or not exists(select 1 from public.teams where org_id=p_org and id=team and kind='own') then raise exception 'Team unavailable'; end if;
      if not coalesce((org_role in ('owner','manager') or (team_role='head_coach' and r in ('assistant_coach','parent')) or (team_role='assistant_coach' and r='parent')),false) then
        raise exception 'Not allowed to invite this role';
      end if;
      if r='head_coach' and exists(select 1 from public.team_members where org_id=p_org and team_id=team and role='head_coach') then raise exception 'Use the head coach handoff for an existing team'; end if;
    end if;
    if r='parent' and not exists(select 1 from public.players where org_id=p_org and id=p_data->>'playerId' and team_id=team) then raise exception 'Choose the parent''s player'; end if;
    target_email:=lower(trim(p_data->>'email'));
    if target_email is null or target_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email required'; end if;
    if length(coalesce(p_data->>'tokenHash',''))<>64 then raise exception 'Invitation token required'; end if;
    -- Replacing a pending invitation invalidates its old link.
    update public.access_invitations set revoked_at=now() where org_id=p_org and team_id is not distinct from team and email=target_email and accepted_at is null and revoked_at is null;
    insert into public.access_invitations(org_id,team_id,email,role,player_id,token_hash,created_by)
    values(p_org,team,target_email,r,case when r='parent' then p_data->>'playerId' end,p_data->>'tokenHash',p_actor) returning * into invite;
    result:=jsonb_build_object('invitationId',invite.id);
  elsif p_action='revoke_invite' then
    select * into invite from public.access_invitations where id=(p_data->>'invitationId')::uuid and org_id=p_org for update;
    if not found then raise exception 'Invitation unavailable'; end if;
    if org_role not in ('owner','manager') and invite.created_by<>p_actor then raise exception 'Invitation manager required'; end if;
    if invite.role='manager' and org_role<>'owner' then raise exception 'Organization owner required'; end if;
    update public.access_invitations set revoked_at=now() where id=invite.id and accepted_at is null;
  elsif p_action in ('remove_member','set_role','transfer_team','transfer_org') then
    target:=(p_data->>'userId')::uuid;
    if p_action in ('transfer_org','transfer_team') and not exists(select 1 from auth.users where id=target and email_confirmed_at is not null and (banned_until is null or banned_until<now())) then raise exception 'Choose an active verified account'; end if;
    select role into target_org_role from public.org_members where org_id=p_org and user_id=target;
    select role into target_role from public.team_members where org_id=p_org and team_id=team and user_id=target;
    if p_action='transfer_org' then
      if org_role<>'owner' or target_org_role is null or target_org_role not in ('owner','manager') or target=p_actor then raise exception 'Choose an existing organization manager'; end if;
      update public.org_members set role='owner' where org_id=p_org and user_id=target;
      update public.org_members set role='manager' where org_id=p_org and user_id=p_actor;
    elsif team is null then
      if org_role<>'owner' or target_org_role='owner' or target_org_role is null then raise exception 'Only an owner can manage other organization members'; end if;
      if p_action='remove_member' then
        delete from public.org_members where org_id=p_org and user_id=target;
      elsif p_action='set_role' and r in ('manager','member') then
        update public.org_members set role=r where org_id=p_org and user_id=target;
      else raise exception 'Invalid role'; end if;
    elsif p_action='transfer_team' then
      if not coalesce((org_role in ('owner','manager') or team_role='head_coach'),false) then raise exception 'Head coach or organization manager required'; end if;
      if target_role is null or target_role not in ('head_coach','assistant_coach') then raise exception 'Invite and accept the new coach first'; end if;
      if target_role='head_coach' then return jsonb_build_object('ok',true); end if;
      delete from public.team_members where org_id=p_org and team_id=team and role='head_coach';
      update public.team_members set role='head_coach' where org_id=p_org and team_id=team and user_id=target;
    else
      if target_role is null then raise exception 'Member unavailable'; end if;
      if not coalesce((org_role in ('owner','manager') or (team_role='head_coach' and target_role<>'head_coach') or (team_role='assistant_coach' and target_role='parent' and p_action='remove_member')),false) then raise exception 'Team manager required'; end if;
      if p_action='remove_member' then
        delete from public.team_members where org_id=p_org and team_id=team and user_id=target;
      elsif p_action='set_role' and r='assistant_coach' and target_role='parent' then
        update public.team_members set role=r where org_id=p_org and team_id=team and user_id=target;
        delete from public.parent_players where org_id=p_org and team_id=team and user_id=target;
      else raise exception 'Use a handoff to change head coach'; end if;
    end if;
    -- Any staff change invalidates outstanding recorder links for that team/org.
    update public.live_game_grants set revoked=true where org_id=p_org and not revoked
      and (team is null or game_id in(select id from public.live_games where org_id=p_org and team_id=team));
    -- A removed inviter cannot leave behind invitations that later restore access.
    if p_action='remove_member' or p_action='transfer_team' then
      update public.access_invitations set revoked_at=now() where org_id=p_org and accepted_at is null and revoked_at is null
        and (team is null or team_id=team);
    end if;
  else raise exception 'Unknown access action'; end if;
  insert into public.access_audit(org_id,team_id,actor_id,action,target_id) values(p_org,team,p_actor,p_action,coalesce(target::text,result->>'invitationId',p_data->>'invitationId'));
  return result||jsonb_build_object('ok',true);
end $$;

create function public.accept_team_invitation(p_actor uuid,p_hash text)
returns text language plpgsql security invoker set search_path='' as $$
declare i public.access_invitations; actor_email text; inviter_role text; inviter_team_role text; enabled boolean;
begin
  select org_id into i.org_id from public.access_invitations where token_hash=p_hash;
  if not found then raise exception 'Invitation unavailable'; end if;
  select account_access_enabled into enabled from public.organizations where id=i.org_id and active for update;
  if not coalesce(enabled,false) then raise exception 'Organization unavailable'; end if;
  select * into i from public.access_invitations where token_hash=p_hash for update;
  if i.revoked_at is not null or i.accepted_at is not null or i.expires_at<=now() then raise exception 'Invitation expired, revoked, or already accepted'; end if;
  select lower(email) into actor_email from auth.users where id=p_actor and email_confirmed_at is not null and coalesce(is_anonymous,false)=false and (banned_until is null or banned_until<now());
  if actor_email is null or actor_email<>i.email then raise exception 'Sign in with the invited email address'; end if;
  select role into inviter_role from public.org_members where org_id=i.org_id and user_id=i.created_by;
  select role into inviter_team_role from public.team_members where org_id=i.org_id and team_id=i.team_id and user_id=i.created_by;
  if not coalesce((i.role='manager' and inviter_role='owner') or (i.role<>'manager' and (inviter_role in ('owner','manager') or (inviter_team_role='head_coach' and i.role in ('assistant_coach','parent')) or (inviter_team_role='assistant_coach' and i.role='parent'))),false) then raise exception 'Inviter no longer has permission'; end if;
  insert into public.org_members(org_id,user_id,role) values(i.org_id,p_actor,case when i.role='manager' then 'manager' else 'member' end)
    on conflict(org_id,user_id) do nothing;
  if i.role='manager' then
    update public.org_members set role='manager' where org_id=i.org_id and user_id=p_actor and role<>'owner';
  else
    if exists(select 1 from public.team_members where org_id=i.org_id and team_id=i.team_id and user_id=p_actor and role<>i.role) then raise exception 'Already a team member; ask a manager to change your role'; end if;
    if i.role='head_coach' and exists(select 1 from public.team_members where org_id=i.org_id and team_id=i.team_id and role='head_coach' and user_id<>p_actor) then raise exception 'Team already has a head coach'; end if;
    insert into public.team_members(org_id,team_id,user_id,role) values(i.org_id,i.team_id,p_actor,i.role) on conflict do nothing;
    if i.role='parent' then
      if not exists(select 1 from public.players where org_id=i.org_id and team_id=i.team_id and id=i.player_id) then raise exception 'Player unavailable'; end if;
      insert into public.parent_players values(i.org_id,i.team_id,p_actor,i.player_id) on conflict do nothing;
    end if;
  end if;
  update public.access_invitations set accepted_at=now() where id=i.id;
  insert into public.access_audit(org_id,team_id,actor_id,action,target_id) values(i.org_id,i.team_id,p_actor,'accept_invitation',i.id::text);
  return i.org_id;
end $$;
revoke all on function public.manage_team_access(text,uuid,text,jsonb), public.accept_team_invitation(uuid,text) from public,anon,authenticated;
grant execute on function public.manage_team_access(text,uuid,text,jsonb), public.accept_team_invitation(uuid,text) to service_role;
notify pgrst,'reload schema';
