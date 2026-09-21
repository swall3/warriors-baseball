-- 014_scope_lineup_plans_key.sql — MT-2 follow-up: close the last global
-- conflict target
--
-- Target: omwqwwflvnunuvgidvwx. Requires 007-013.
-- Plan: MULTI-TENANT-PLAN.md §2.4's principle, applied where §2.4's list did
-- not reach. Phase MT-2.
--
-- ⚠️ RENUMBERS THE PLAN. §6.1 reserves 014 for `org_passcodes`; that becomes
-- 015. This is forward-only numbering doing its job — 014 was not written yet,
-- and a fix that belongs to MT-2 should not be numbered after MT-3's work.
--
-- ⚠️ SERIAL WITH THE APPLICATION COMMIT that changes sbUpsert's onConflict for
-- `lineup_plans`. Same coupling, same reason as 011 §3.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
-- ---------------------------------------------------------------------------
-- Migration 011 §3 made this argument about games.client_game_id:
--
--   sbUpsert resolves the conflict IN POSTGRES, not in the application. Stage
--   A's org_id filter does not help, because a WHERE clause has no bearing on
--   which row ON CONFLICT chooses.
--
-- That argument is not about games. It is about every upsert whose conflict
-- target is unique globally rather than per tenant, and `lineup_plans` is the
-- one where it bites hardest:
--
--   src/app/api/coach/lineup/route.ts upserts on "id", against
--   lineup_plans_pkey PRIMARY KEY (id) — a GLOBAL unique. And `plan.id` is
--   not server-generated: it arrives in the POST body, validated only as a
--   non-empty string, because the client deliberately owns it so an offline
--   edit can be replayed without creating a duplicate row.
--
-- So org B POSTs a plan whose id matches one of org A's. ON CONFLICT (id)
-- fires, the UPDATE runs carrying Stage A's stamped org_id, and org A's plan
-- row is overwritten — with its org_id flipped to org B. Nothing else catches
-- it: 012's composite FKs see an internally consistent (org_id, team_id) pair
-- for org B and are satisfied, and 013's policies are inert on this path by
-- design. This is the only MT-2 path where a request body can reach across
-- tenants and take a row.
--
-- ---------------------------------------------------------------------------
-- THE FIX
-- ---------------------------------------------------------------------------
-- Rebuild the primary key as (org_id, id), so the id namespace is per tenant
-- and the conflict target the route names can be org-scoped.
--
-- lineup_plans gets its PK rebuilt rather than merely gaining a second unique
-- (the treatment teams/games/players got in 012 §1) for two reasons: nothing
-- in the schema has a foreign key pointing at lineup_plans, so no dependent
-- constraint has to be rebuilt; and the table holds 0 rows, so there is no
-- data to move. Scoping the key outright is strictly better than leaving a
-- global PK behind a scoped unique, which would turn a cross-tenant id
-- collision into a confusing primary-key violation instead of a normal insert.
--
-- teams is handled differently and deliberately — see section 2.
--
-- Idempotent and forward-only: guarded on the current key definition.

-- ---------------------------------------------------------------------------
-- 1. lineup_plans: primary key becomes (org_id, id)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.lineup_plans'::regclass
       and conname = 'lineup_plans_pkey'
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    alter table public.lineup_plans drop constraint lineup_plans_pkey;
    alter table public.lineup_plans add constraint lineup_plans_pkey primary key (org_id, id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. teams: no schema change needed, only the call site
-- ---------------------------------------------------------------------------
-- sync/game/route.ts also upserts `teams` on "id" against a global
-- teams_pkey. The exposure is far smaller and the remedy is cheaper:
--
--   * `teamId` is never request-controlled. It is makeId("team") —
--     `team-<epoch-ms>-<8 base36 chars>`, roughly 41 bits of randomness on top
--     of a millisecond timestamp. A coach cannot choose it, so this is a
--     collision risk, not an attack surface.
--   * 012 §1 already created `teams_org_id_key unique (org_id, id)`. Pointing
--     the upsert at that closes the cross-tenant conflict resolution with no
--     migration at all.
--   * Rebuilding teams_pkey would be a far larger change than lineup_plans':
--     3 live rows, and `teams.id` is the value every game, player and lineup
--     plan in the database references.
--
-- With the call site on (org_id, id), a genuine cross-tenant id collision
-- becomes a primary-key violation — an error, loudly, instead of one org
-- silently renaming another's scouting record. Fail-closed is the correct
-- resting state for a case this improbable; rebuilding teams_pkey belongs with
-- MT-3's work, not bolted onto MT-2's last commit.

-- ---------------------------------------------------------------------------
-- Verification:
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.lineup_plans'::regclass and contype='p';
--   -- expect: lineup_plans_pkey  PRIMARY KEY (org_id, id)
--
-- And end to end, via scripts/verify-mt2.mjs, which asserts that an org-test
-- upsert naming an org-outlaws plan id INSERTS a second row rather than
-- mutating the first — plus a static check that every sbUpsert call site in
-- src/ names an org-scoped conflict target.
-- ---------------------------------------------------------------------------
