begin;

create table public.custom_practice_drills (
  org_id text not null references public.organizations(id),
  id text not null,
  team_id text not null,
  name text not null,
  category text not null check (category in ('infield','outfield','hitting','throwing','baserunning','team-defense')),
  positions text[] not null default '{}',
  age_bands text[] not null default '{}',
  duration_minutes integer not null check (duration_minutes between 1 and 60),
  players text not null,
  space text not null,
  equipment text[] not null default '{}',
  setup text not null,
  instructions jsonb not null default '[]'::jsonb,
  coaching_cue text,
  scenario_category text check (scenario_category is null or scenario_category in ('cover','backup','relay','miss-recovery')),
  created_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id,id),
  foreign key (org_id,team_id) references public.teams(org_id,id) on delete cascade,
  check (cardinality(age_bands) > 0),
  check (cardinality(equipment) > 0),
  check (jsonb_typeof(instructions) = 'array' and jsonb_array_length(instructions) > 0)
);

create index custom_practice_drills_team
  on public.custom_practice_drills(org_id,team_id,updated_at desc);

alter table public.custom_practice_drills enable row level security;
revoke all on public.custom_practice_drills from public,anon,authenticated;
grant select,insert,update,delete on public.custom_practice_drills to service_role;

alter table public.practice_plans
  add column source_game_id text,
  add column recommendation_context jsonb;
alter table public.practice_plans
  add constraint practice_plans_source_game_fk
  foreign key (org_id,source_game_id)
  references public.live_games(org_id,id)
  on delete set null (source_game_id);
create index practice_plans_source_game
  on public.practice_plans(org_id,source_game_id)
  where source_game_id is not null;

notify pgrst, 'reload schema';
commit;
