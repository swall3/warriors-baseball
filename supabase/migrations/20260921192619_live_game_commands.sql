-- Live game aggregates are separate from legacy whole-snapshot imports.
-- Server routes authenticate, authorize a lane, validate commands and supply
-- org_id from the signed session. No client can call these tables/RPC directly.
-- This follows MT-3's existing server-only service-role architecture; it does
-- not claim that service-role queries are protected by per-user RLS.
begin;

create table public.live_games (
  org_id text not null references public.organizations(id),
  id text not null,
  team_id text not null,
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (org_id,id),
  foreign key (org_id,team_id) references public.teams(org_id,id)
);
create index live_games_recent on public.live_games(org_id,updated_at desc);

create table public.live_game_commands (
  org_id text not null,
  game_id text not null,
  id text not null,
  revision integer not null,
  command jsonb not null,
  actor_lane text not null check (actor_lane in ('coach','pitch','play','all')),
  actor_id text not null,
  created_at timestamptz not null default now(),
  primary key (org_id,game_id,id),
  unique (org_id,game_id,revision),
  foreign key (org_id,game_id) references public.live_games(org_id,id) on delete cascade
);

create table public.live_game_grants (
  org_id text not null,
  game_id text not null,
  id text not null,
  token_hash text not null,
  lane text not null check (lane in ('pitch','play','all','display')),
  label text not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  primary key (org_id,game_id,id),
  unique (token_hash),
  foreign key (org_id,game_id) references public.live_games(org_id,id) on delete cascade
);

alter table public.live_games enable row level security;
alter table public.live_game_commands enable row level security;
alter table public.live_game_grants enable row level security;
revoke all on public.live_games, public.live_game_commands, public.live_game_grants from public,anon,authenticated;
grant select,insert,update,delete on public.live_games,public.live_game_commands,public.live_game_grants to service_role;

-- Receipt lookup occurs under the same game-row lock as the revision check.
-- Retried commands succeed without applying their pitch again; a reused ID
-- with a different payload is an error. Conflicting new commands return 409
-- at the API, never overwrite a newer game and are not silently rebased.
create function public.commit_live_game_command(
  p_org text, p_game text, p_id text, p_expected integer,
  p_command jsonb, p_state jsonb, p_lane text, p_actor text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  current_game public.live_games%rowtype;
  receipt public.live_game_commands%rowtype;
begin
  select * into current_game from public.live_games
    where org_id=p_org and id=p_game for update;
  if not found then return jsonb_build_object('error','not_found'); end if;
  select * into receipt from public.live_game_commands
    where org_id=p_org and game_id=p_game and id=p_id;
  if found then
    if receipt.command <> p_command or receipt.actor_id <> p_actor or receipt.actor_lane <> p_lane then
      return jsonb_build_object('error','id_reused');
    end if;
    return jsonb_build_object('state',current_game.state,'duplicate',true);
  end if;
  if current_game.revision <> p_expected then
    return jsonb_build_object('error','conflict','state',current_game.state);
  end if;
  if (p_state->>'revision')::integer <> p_expected+1 or p_state->>'id' <> p_game
    or p_state->'config'->>'teamId' <> current_game.team_id then
    raise exception 'Invalid aggregate identity/revision';
  end if;
  insert into public.live_game_commands(org_id,game_id,id,revision,command,actor_lane,actor_id)
    values(p_org,p_game,p_id,p_expected+1,p_command,p_lane,p_actor);
  update public.live_games set state=p_state, revision=p_expected+1, updated_at=now()
    where org_id=p_org and id=p_game;
  return jsonb_build_object('state',p_state,'duplicate',false);
end $$;
revoke all on function public.commit_live_game_command(text,text,text,integer,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.commit_live_game_command(text,text,text,integer,jsonb,jsonb,text,text) to service_role;
commit;
