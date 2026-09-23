-- Shared links create reviewable requests, never immediate family or staff access.
create table public.join_links (
  token text primary key check (token ~ '^[A-Za-z0-9_-]{43}$'),
  org_id text not null references public.organizations(id) on delete cascade,
  team_id text,
  kind text not null check (kind in ('parent','coach')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz,
  foreign key (org_id,team_id) references public.teams(org_id,id),
  check ((kind='parent' and team_id is not null) or (kind='coach' and team_id is null))
);
create unique index join_links_one_active on public.join_links(org_id,coalesce(team_id,''),kind)
  where revoked_at is null;
create index join_links_org on public.join_links(org_id,team_id);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  link_token text references public.join_links(token) on delete set null,
  org_id text not null references public.organizations(id) on delete cascade,
  team_id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('parent','coach')),
  child_name text,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  player_id text,
  approved_team_id text,
  approved_role text check (approved_role in ('head_coach','assistant_coach')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (org_id,team_id) references public.teams(org_id,id),
  foreign key (org_id,player_id) references public.players(org_id,id),
  foreign key (org_id,approved_team_id) references public.teams(org_id,id),
  check ((kind='parent' and team_id is not null and length(trim(child_name)) between 2 and 80)
    or (kind='coach' and team_id is null and child_name is null))
);
create index join_requests_queue on public.join_requests(org_id,status,created_at desc);
create index join_requests_user on public.join_requests(user_id,created_at desc);
create unique index join_requests_pending_parent on public.join_requests(org_id,team_id,user_id,lower(trim(child_name)))
  where status='pending' and kind='parent';
create unique index join_requests_pending_coach on public.join_requests(org_id,user_id)
  where status='pending' and kind='coach';

alter table public.join_links enable row level security;
alter table public.join_requests enable row level security;
revoke all on public.join_links,public.join_requests from public,anon,authenticated;
grant select,insert,update on public.join_links,public.join_requests to service_role;
grant insert on public.organizations to service_role;

create function public.bootstrap_organization(p_actor uuid,p_name text,p_team_name text)
returns text language plpgsql security invoker set search_path='' as $$
declare org text:='org-'||gen_random_uuid()::text; team text:='team-'||gen_random_uuid()::text; existing text;
begin
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null
    and coalesce(is_anonymous,false)=false and (banned_until is null or banned_until<now())) then
    raise exception 'Verified account required';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 80
    or length(trim(coalesce(p_team_name,''))) not between 2 and 80 then
    raise exception 'Enter an organization and team name';
  end if;
  -- A verified account may create a small number of organizations. Billing stays disabled until checkout.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select o.id into existing from public.organizations o join public.org_members m on m.org_id=o.id
    where m.user_id=p_actor and m.role='owner' and lower(o.name)=lower(trim(p_name)) limit 1;
  if existing is not null then return existing; end if;
  if (select count(*) from public.org_members where user_id=p_actor and role='owner')>=3 then
    raise exception 'Contact support to create another organization';
  end if;
  insert into public.organizations(id,slug,name,short_name,account_access_enabled)
    values(org,org,trim(p_name),left(trim(p_name),20),true);
  insert into public.org_members(org_id,user_id,role) values(org,p_actor,'owner');
  insert into public.teams(id,org_id,name,normalized_name,kind)
    values(team,org,trim(p_team_name),lower(trim(p_team_name)),'own');
  insert into public.team_members(org_id,team_id,user_id,role)
    values(org,team,p_actor,'head_coach');
  insert into public.org_billing(org_id,owner_user_id,seats) values(org,p_actor,1);
  insert into public.team_billing(org_id,team_id,owner_user_id) values(org,team,p_actor);
  return org;
end $$;

create function public.create_join_link(p_actor uuid,p_org text,p_team text,p_kind text,p_token text)
returns void language plpgsql security invoker set search_path='' as $$
declare org_role text; team_role text;
begin
  perform 1 from public.organizations where id=p_org and active and account_access_enabled for update;
  if not found then raise exception 'Organization unavailable'; end if;
  select role into org_role from public.org_members where org_id=p_org and user_id=p_actor;
  select role into team_role from public.team_members where org_id=p_org and team_id=p_team and user_id=p_actor;
  if p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid link token'; end if;
  if p_kind='coach' then
    if p_team is not null or org_role not in ('owner','manager') then raise exception 'Organization manager required'; end if;
  elsif p_kind='parent' then
    if p_team is null or not exists(select 1 from public.teams where org_id=p_org and id=p_team and kind='own')
      or not coalesce(org_role in ('owner','manager') or team_role in ('head_coach','assistant_coach'),false) then
      raise exception 'Team coach required';
    end if;
  else raise exception 'Invalid link type'; end if;
  if (select count(*) from public.join_links where created_by=p_actor and created_at>now()-interval '1 day')>=10 then
    raise exception 'Link creation limit reached';
  end if;
  update public.join_links set revoked_at=now() where org_id=p_org and team_id is not distinct from p_team
    and kind=p_kind and revoked_at is null;
  insert into public.join_links(token,org_id,team_id,kind,created_by) values(p_token,p_org,p_team,p_kind,p_actor);
  insert into public.access_audit(org_id,team_id,actor_id,action,target_id)
    values(p_org,p_team,p_actor,'create_join_link',p_kind);
end $$;

create function public.request_join(p_actor uuid,p_token text,p_child_name text default null,p_note text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare link public.join_links; request_id uuid;
begin
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null
    and coalesce(is_anonymous,false)=false and (banned_until is null or banned_until<now())) then
    raise exception 'Verified account required';
  end if;
  select * into link from public.join_links where token=p_token and revoked_at is null and expires_at>now();
  if not found then raise exception 'Join link expired or unavailable'; end if;
  if not exists(select 1 from public.organizations where id=link.org_id and active and account_access_enabled) then
    raise exception 'Organization unavailable';
  end if;
  if (select count(*) from public.join_requests where user_id=p_actor and created_at>now()-interval '1 day')>=8 then
    raise exception 'Request limit reached; try again tomorrow';
  end if;
  if link.kind='parent' then
    if length(trim(coalesce(p_child_name,''))) not between 2 and 80 then raise exception 'Enter your child''s roster name'; end if;
    insert into public.join_requests(link_token,org_id,team_id,user_id,kind,child_name)
      values(p_token,link.org_id,link.team_id,p_actor,'parent',trim(p_child_name)) returning id into request_id;
  else
    if exists(select 1 from public.org_members where org_id=link.org_id and user_id=p_actor and role in ('owner','manager')) then
      raise exception 'You already manage this organization';
    end if;
    if length(coalesce(p_note,''))>300 then raise exception 'Keep your note under 300 characters'; end if;
    insert into public.join_requests(link_token,org_id,user_id,kind,note)
      values(p_token,link.org_id,p_actor,'coach',nullif(trim(p_note),'')) returning id into request_id;
  end if;
  return request_id;
end $$;

create function public.revoke_join_link(p_actor uuid,p_token text)
returns void language plpgsql security invoker set search_path='' as $$
declare link public.join_links; org_role text; team_role text;
begin
  select * into link from public.join_links where token=p_token and revoked_at is null for update;
  if not found then raise exception 'Link unavailable'; end if;
  select role into org_role from public.org_members where org_id=link.org_id and user_id=p_actor;
  select role into team_role from public.team_members where org_id=link.org_id and team_id=link.team_id and user_id=p_actor;
  if not coalesce(org_role in ('owner','manager') or
    (link.kind='parent' and team_role in ('head_coach','assistant_coach')),false) then
    raise exception 'Coach or organization manager required';
  end if;
  update public.join_links set revoked_at=now() where token=p_token;
  insert into public.access_audit(org_id,team_id,actor_id,action,target_id)
    values(link.org_id,link.team_id,p_actor,'revoke_join_link',link.kind);
end $$;

create function public.review_join_request(p_actor uuid,p_request uuid,p_approve boolean,p_player text default null,
  p_team text default null,p_role text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare req public.join_requests; org_role text; team_role text; existing_role text;
begin
  select * into req from public.join_requests where id=p_request and status='pending' for update;
  if not found then raise exception 'Request unavailable'; end if;
  perform 1 from public.organizations where id=req.org_id and active for update;
  if not found then raise exception 'Organization unavailable'; end if;
  select role into org_role from public.org_members where org_id=req.org_id and user_id=p_actor;
  select role into team_role from public.team_members where org_id=req.org_id and team_id=req.team_id and user_id=p_actor;
  if req.kind='coach' and not coalesce(org_role in ('owner','manager'),false) then
    raise exception 'Organization manager required';
  end if;
  if req.kind='parent' and not coalesce(org_role in ('owner','manager') or team_role in ('head_coach','assistant_coach'),false) then
    raise exception 'Team coach required';
  end if;
  if p_approve then
    if req.kind='parent' then
      if not exists(select 1 from public.players where org_id=req.org_id and team_id=req.team_id and id=p_player and active) then
        raise exception 'Choose this team''s player';
      end if;
      insert into public.org_members(org_id,user_id,role) values(req.org_id,req.user_id,'member') on conflict do nothing;
      insert into public.team_members(org_id,team_id,user_id,role) values(req.org_id,req.team_id,req.user_id,'parent')
        on conflict do nothing;
      insert into public.parent_players(org_id,team_id,user_id,player_id)
        values(req.org_id,req.team_id,req.user_id,p_player) on conflict do nothing;
      update public.join_requests set status='approved',player_id=p_player,reviewed_by=p_actor,reviewed_at=now() where id=p_request;
    else
      if p_role not in ('head_coach','assistant_coach') or not exists(select 1 from public.teams
        where org_id=req.org_id and id=p_team and kind='own') then raise exception 'Choose a team and coach role'; end if;
      if p_role='head_coach' and exists(select 1 from public.team_members where org_id=req.org_id and team_id=p_team and role='head_coach') then
        raise exception 'Use the head coach handoff for an existing team';
      end if;
      select role into existing_role from public.team_members where org_id=req.org_id and team_id=p_team and user_id=req.user_id;
      if existing_role not in ('parent') then
        if existing_role is not null then raise exception 'Coach already belongs to this team'; end if;
      end if;
      insert into public.org_members(org_id,user_id,role) values(req.org_id,req.user_id,'member') on conflict do nothing;
      insert into public.team_members(org_id,team_id,user_id,role) values(req.org_id,p_team,req.user_id,p_role)
        on conflict(org_id,team_id,user_id) do update set role=excluded.role;
      update public.join_requests set status='approved',approved_team_id=p_team,approved_role=p_role,
        reviewed_by=p_actor,reviewed_at=now() where id=p_request;
    end if;
  else
    update public.join_requests set status='rejected',reviewed_by=p_actor,reviewed_at=now() where id=p_request;
  end if;
  insert into public.access_audit(org_id,team_id,actor_id,action,target_id)
    values(req.org_id,coalesce(req.team_id,p_team),p_actor,case when p_approve then 'approve_join' else 'reject_join' end,req.user_id::text);
end $$;

revoke all on function public.bootstrap_organization(uuid,text,text),
  public.create_join_link(uuid,text,text,text,text),
  public.revoke_join_link(uuid,text),
  public.request_join(uuid,text,text,text),
  public.review_join_request(uuid,uuid,boolean,text,text,text)
  from public,anon,authenticated;
grant execute on function public.bootstrap_organization(uuid,text,text),
  public.create_join_link(uuid,text,text,text,text),
  public.revoke_join_link(uuid,text),
  public.request_join(uuid,text,text,text),
  public.review_join_request(uuid,uuid,boolean,text,text,text)
  to service_role;
notify pgrst,'reload schema';
