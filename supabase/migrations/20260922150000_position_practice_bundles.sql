begin;
-- Position practice bundles (Decision 1, docs/PRACTICE-ASSIGNMENT-AND-DRILLS.md).
-- Bundle *definitions* (which scenarios, labels, skill focus) live in code at
-- src/lib/practice/bundles.ts — this table only records that a bundle was
-- assigned to a player, mirroring how training_assignments already works.
-- Additive only: existing single-scenario training_assignments rows are
-- untouched and keep working (bundle_assignment_id/bundle_position are null
-- for them).

create table public.training_practice_bundles (
  org_id text not null references public.organizations(id),
  id text not null,
  player_id text not null,
  game_id text,
  bundle_id text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key(org_id,id),
  foreign key(org_id,player_id) references public.players(org_id,id),
  foreign key(org_id,game_id) references public.live_games(org_id,id)
);
create index training_practice_bundles_player
  on public.training_practice_bundles(org_id,player_id,created_at desc);

alter table public.training_assignments
  add column bundle_assignment_id text,
  add column bundle_position integer;
alter table public.training_assignments
  add constraint training_assignments_bundle_fk
  foreign key(org_id,bundle_assignment_id)
  references public.training_practice_bundles(org_id,id) on delete cascade;
create index training_assignments_bundle
  on public.training_assignments(org_id,bundle_assignment_id,bundle_position)
  where bundle_assignment_id is not null;

alter table public.training_practice_bundles enable row level security;
revoke all on public.training_practice_bundles from public,anon,authenticated;
grant select,insert on public.training_practice_bundles to service_role;

-- training_progress must gain the two new columns without reordering the
-- existing output columns (CREATE OR REPLACE VIEW forbids that) — append them
-- after the existing attempts/correct columns instead of relying on a.*.
create or replace view public.training_progress with (security_invoker=true) as
select
  a.org_id,
  a.id,
  a.player_id,
  a.game_id,
  a.scenario_id,
  a.note,
  a.created_at,
  count(t.id)::integer as attempts,
  count(t.id) filter (where t.correct)::integer as correct,
  a.bundle_assignment_id,
  a.bundle_position
from public.training_assignments a
left join public.training_attempts t
  on t.org_id = a.org_id and t.assignment_id = a.id
group by
  a.org_id,a.id,a.player_id,a.game_id,a.scenario_id,a.note,a.created_at,
  a.bundle_assignment_id,a.bundle_position;

-- Per-bundle rollup: scenario count, how many have at least one correct
-- attempt, and total attempts/correct across the bundle's scenarios.
create view public.training_bundle_progress with (security_invoker=true) as
select
  b.org_id,
  b.id,
  b.player_id,
  b.game_id,
  b.bundle_id,
  b.note,
  b.created_at,
  count(p.id)::integer as scenario_count,
  count(p.id) filter (where p.correct > 0)::integer as scenarios_completed,
  coalesce(sum(p.attempts),0)::integer as total_attempts,
  coalesce(sum(p.correct),0)::integer as total_correct
from public.training_practice_bundles b
left join public.training_progress p
  on p.org_id = b.org_id and p.bundle_assignment_id = b.id
group by b.org_id,b.id,b.player_id,b.game_id,b.bundle_id,b.note,b.created_at;

revoke all on public.training_bundle_progress from public,anon,authenticated;
grant select on public.training_bundle_progress to service_role;
notify pgrst, 'reload schema';
commit;
