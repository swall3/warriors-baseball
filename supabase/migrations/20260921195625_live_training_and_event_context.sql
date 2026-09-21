begin;
alter table public.live_game_commands add column before_state jsonb, add column after_state jsonb;

create table public.training_assignments (
  org_id text not null references public.organizations(id),
  id text not null,
  player_id text not null,
  game_id text,
  scenario_id text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key(org_id,id),
  foreign key(org_id,player_id) references public.players(org_id,id),
  foreign key(org_id,game_id) references public.live_games(org_id,id)
);
create index training_assignments_player on public.training_assignments(org_id,player_id,created_at desc);
create table public.training_attempts (
  org_id text not null,
  assignment_id text not null,
  id text not null,
  answer text not null,
  correct boolean not null,
  created_at timestamptz not null default now(),
  primary key(org_id,assignment_id,id),
  foreign key(org_id,assignment_id) references public.training_assignments(org_id,id) on delete cascade
);
alter table public.training_assignments enable row level security;
alter table public.training_attempts enable row level security;
revoke all on public.training_assignments,public.training_attempts from public,anon,authenticated;
grant select,insert on public.training_assignments,public.training_attempts to service_role;
-- The following function replacement captures the authoritative event context
-- in the same atomic transaction as the command. Old receipts remain readable
-- but are marked as missing context by the insights API; no history is invented.

create or replace function public.commit_live_game_command(
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
  insert into public.live_game_commands(org_id,game_id,id,revision,command,actor_lane,actor_id,before_state,after_state)
    values(p_org,p_game,p_id,p_expected+1,p_command,p_lane,p_actor,current_game.state,p_state);
  update public.live_games set state=p_state, revision=p_expected+1, updated_at=now()
    where org_id=p_org and id=p_game;
  return jsonb_build_object('state',p_state,'duplicate',false);
end $$;

create view public.training_progress with (security_invoker=true) as
select a.*,count(t.id)::integer as attempts,
  count(t.id) filter (where t.correct)::integer as correct
from public.training_assignments a
left join public.training_attempts t on t.org_id=a.org_id and t.assignment_id=a.id
group by a.org_id,a.id;
revoke all on public.training_progress from public,anon,authenticated;
grant select on public.training_progress to service_role;
notify pgrst, 'reload schema';
commit;
