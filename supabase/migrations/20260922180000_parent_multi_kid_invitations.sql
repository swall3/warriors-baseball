-- Decision 5 (PRACTICE-ASSIGNMENT-AND-DRILLS.md): a parent may have more than
-- one linked player. The schema (parent_players PK (org_id,team_id,user_id,
-- player_id), team_members PK (org_id,team_id,user_id), org_members PK
-- (org_id,user_id)) was already many-to-many by design — see 007's comment on
-- org_members. accept_team_invitation already inserts team_members/
-- parent_players with `on conflict do nothing`, so accepting a second child's
-- invitation never disturbs the first child's link.
--
-- One real gap: manage_team_access's 'invite' branch revoked any pending
-- invitation matching (org, team, email), ignoring player_id. Inviting the
-- SAME parent for a SECOND child on the SAME team silently revoked the first
-- child's still-pending invitation. Cross-team siblings were unaffected
-- (different team_id), which is why this was easy to miss.
--
-- Fix: scope the auto-revoke of a superseded pending invitation to also match
-- player_id (nullable-safe via IS NOT DISTINCT FROM), so two pending parent
-- invitations for the same team can coexist when they name different
-- children. Non-parent invites (player_id always null) are unaffected.
create or replace function public.manage_team_access(p_org text,p_actor uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  org_role text; team_role text; target_role text; target_org_role text;
  team text:=p_data->>'teamId'; target uuid; r text:=p_data->>'role';
  invite public.access_invitations; result jsonb:='{}'; target_email text; enabled boolean;
  target_player text;
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
    target_player:=case when r='parent' then p_data->>'playerId' end;
    if r='parent' and not exists(select 1 from public.players where org_id=p_org and id=target_player and team_id=team) then raise exception 'Choose the parent''s player'; end if;
    target_email:=lower(trim(p_data->>'email'));
    if target_email is null or target_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email required'; end if;
    if length(coalesce(p_data->>'tokenHash',''))<>64 then raise exception 'Invitation token required'; end if;
    -- Replacing a pending invitation invalidates its old link. Scoped by
    -- player_id (not just org/team/email) so a second child's invitation on
    -- the same team does not revoke the first child's still-pending one.
    update public.access_invitations set revoked_at=now() where org_id=p_org and team_id is not distinct from team and email=target_email
      and player_id is not distinct from target_player and accepted_at is null and revoked_at is null;
    insert into public.access_invitations(org_id,team_id,email,role,player_id,token_hash,created_by)
    values(p_org,team,target_email,r,target_player,p_data->>'tokenHash',p_actor) returning * into invite;
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
revoke all on function public.manage_team_access(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_team_access(text,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
