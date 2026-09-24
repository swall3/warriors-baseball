begin;
-- Custom team practice plans (Decision 2, docs/PRACTICE-ASSIGNMENT-AND-DRILLS.md).
--
-- Preloaded content (the drill catalog, suggested practice templates) stays
-- in code — src/lib/practice/drills.ts and src/lib/practice/templates.ts —
-- the same posture 20260922150000_position_practice_bundles.sql established
-- for position practice bundles. Only a coach-built (or template-cloned)
-- practice plan is a database row. Its `blocks` column stores the
-- station/drill/duration structure as jsonb rather than a normalized
-- block/drill join table: a plan's blocks are always read and written as one
-- unit by the plan builder, there is no cross-plan query that needs to join
-- into individual blocks, and jsonb keeps this migration additive and simple
-- (no drill-id foreign keys into a code-only catalog, which isn't possible
-- anyway). Drill ids inside `blocks` are validated against the code catalog
-- at the application layer (src/lib/practice/plans.ts validateBlocks) on
-- every write.
--
-- Additive only: no existing table or column is touched.
create table public.practice_plans (
  org_id text not null references public.organizations(id),
  id text not null,
  team_id text not null,
  name text not null,
  description text not null default '',
  source_template_id text,
  blocks jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(org_id,id),
  foreign key(org_id,team_id) references public.teams(org_id,id) on delete cascade
);
create index practice_plans_team
  on public.practice_plans(org_id,team_id,updated_at desc);

-- Same posture as training_practice_bundles: RLS enabled (so a future MT-3
-- Stage B JWT-scoped client is already covered) but access today is entirely
-- through the service-role client behind session-scoped queries in
-- src/lib/practice/plans.ts, matching every other /coach data path in this
-- codebase (013_rls_policies.sql's comment block explains why that is the
-- real isolation boundary right now, not these policies).
alter table public.practice_plans enable row level security;
revoke all on public.practice_plans from public,anon,authenticated;
grant select,insert,update,delete on public.practice_plans to service_role;
notify pgrst, 'reload schema';
commit;
