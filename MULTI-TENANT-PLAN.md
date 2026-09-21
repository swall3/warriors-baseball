# Multi-Tenant Conversion — Technical Architecture & Migration Plan

**Status:** plan of record for the multi-tenant pivot
**Date:** 2026-09-21
**Base repo:** `warriors-baseball`, branch `merge-outlaws-coach`
**Worktree:** `/home/swall/.openclaw/workspace/warriors-baseball-merge`
**Supersedes:** nothing. `MERGE-PLAN.md` remains the plan of record for Phases 0–3 (done) and
Phases 4–5 (not started). This document adds a parallel MT-track and, where the two collide,
says so explicitly (§7.6).

---

## 0. Findings — read before planning work

### 0.1 Where the branch actually is

Phases 1–3 of `MERGE-PLAN.md` are committed and live. Verified against the worktree, not
assumed:

| Area | State |
|---|---|
| `/coach` pages | 7 shipped: `page.tsx` (1764 ln), `dashboard`, `intel`, `stats`, `import`, `lineup`, `game/[gameId]`, `login` |
| `/api/coach` routes | 6 shipped: `login`, `games`, `game/[gameId]`, `play-events`, `sync/game`, `lineup` |
| Auth | `src/middleware.ts` + `src/lib/coach/auth.ts` — single shared `APP_PASSCODE` |
| Migrations | `001`–`005` in `supabase/migrations/`, all applied to `omwqwwflvnunuvgidvwx` |
| Identity | `players` (11) + `player_aliases` (14) seeded, 119 events backfilled |
| Lineup | `lineup_plans` live, `/coach/lineup` grid shipped |

**Three things MERGE-PLAN.md called for that were never done**, and all three matter here:

1. **`/admin` was never deleted.** `src/app/admin/page.tsx` (213 lines) and
   `src/app/api/signups/route.ts:8` are still live, still gated by a bare
   `password !== process.env.ADMIN_PASSWORD` compare. MERGE-PLAN §4 ("Fold `/admin` into the
   gate") is unexecuted. See **T3** — this is the single worst defect in the codebase for a
   multi-tenant product.
2. **`src/app/coach/layout.tsx` does not exist.** Consequence: `src/app/coach/coach.css` is
   imported by nothing (`grep -rn "coach.css" src/` returns only the file itself), the
   `.coach-theme` class is applied nowhere, and `public/coach/manifest.webmanifest` is
   referenced nowhere — only `src/app/layout.tsx:18` links a manifest. The coach PWA from
   MERGE-PLAN §5 was never wired up. This is *good news* for §4 of this plan: the branding
   injection point is a file that doesn't exist yet, so creating it costs nothing in churn.
3. **`middleware.ts:15`'s `OPEN` set omits assets.** The matcher is `/coach/:path*`
   (`middleware.ts:41`) but `OPEN` holds only `/coach/login` and `/api/coach/login`. Exactly
   the trap MERGE-PLAN §4 warned about — moot today only because nothing links the manifest.

**And one thing landed while this document was being written:** `src/lib/brand-config.ts`
(uncommitted, from a parallel session) centralizes the brand strings and colours into one
module. It is build-time/single-tenant and therefore not sufficient for §4 — but it does the
tedious half, and it independently reaches this plan's §0.2 conclusion about `"outlaws"` being
data rather than branding. See §4.1 for how it folds into MT-4.

### 0.2 The organizing finding: `outlaws` is in the schema, not just in strings

This is the fact the whole plan turns on. `outlaws` is not a branding string that got sprayed
around — it is a **column name, a check-constraint enum value, and a TypeScript union member**:

```sql
-- outlaws-field-app/supabase/schema.sql
games.outlaws_score          -- :18
games.outlaws_home           -- :22
play_events.batting_team text not null check (batting_team in ('outlaws','opponent'))  -- :34
play_events.outlaws_runs_after  -- :43
```

surfaced as `export type TeamAtBat = "outlaws" | "opponent";`
(`src/lib/coach/game-types.ts:13`) and threaded through 1764 lines of
`src/app/coach/page.tsx`.

**The decoupling that keeps this plan from ballooning: `batting_team` is a *perspective* flag
("us vs. them"), not a tenant key.** Renaming `outlaws` → `us` across the schema, types, and
code carries zero tenancy semantics and can ship completely independently of any org work. If
you conflate the two you will conclude that `batting_team` should hold an `org_id`, which is
wrong, expensive, and breaks every aggregation in `analytics.ts`.

Rename first, add tenancy second. They are two workstreams, not one.

### 0.3 Tenant-isolation defects, as-built

New `T`-series to avoid colliding with MERGE-PLAN's `B`-series.

| # | Severity | File | Defect |
|---|---|---|---|
| **T1** | 🔴 High | `outlaws-field-app/supabase/schema.sql:8` | `teams.normalized_name text not null unique` is a **global** unique, and `src/app/api/coach/sync/game/route.ts:59-61` resolves opponents with `normalized_name=eq.<name>`. Org B scoring a game against "NYO Bucks" doesn't collide — it **silently FKs org B's game onto org A's team row**, and both orgs' spray charts for that opponent merge. Fix: `unique (org_id, normalized_name)`. |
| **T2** | 🔴 High | `src/lib/supabase.ts:19-31` | One module-level client, cached, built from `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS project-wide. Every one of the ~14 call sites (`local-db.ts:107-109`, `lineup/route.ts:39-153`, `sync/game/route.ts:59-124`, `player-name-db.ts:41-42`, `signup/route.ts:13`, `signups/route.ts:12`) has unrestricted reach over every row of every tenant. |
| **T3** | 🔴 High | `src/app/admin/page.tsx`, `src/app/api/signups/route.ts:8` | A second, parallel auth system: `POST {password}` compared against `ADMIN_PASSWORD`, then a service-role `select * from tryout_signups` with **no filter at all**. Under multi-tenancy this hands every tenant's parent names, phone numbers, and emails — **for minors** — to anyone holding one shared password. MERGE-PLAN §4 already said delete it. Do it in MT-1, not later. |
| **T4** | 🔴 High | `supabase/migrations/001_identity.sql:59-63` | `player_aliases.alias text primary key` — the alias is globally unique. Org B cannot have a player aliased `'jack'` because org A already does; the insert fails. The PK must become `(org_id, alias)`. (`players`' `unique (team_id, jersey_number)` at `:44` is already team-scoped and is fine.) |
| **T5** | 🟠 Med | `src/lib/coach/auth.ts:50` | `requireCoach(): Promise<boolean>` answers "is someone logged in," not "who, and for which org." There is no tenant identity anywhere in the request path to scope a query with. Favorable fact: all six route handlers already call it at the top, so the **call sites already exist** — only the return type and what's done with it change. |
| **T6** | 🟠 Med | `src/lib/coach/lineup.ts:61`, `src/app/api/coach/lineup/route.ts:89,159` | `DEFAULT_TEAM_ID = "team-outlaws"` is used as a silent fallback: a request with no `teamId` writes into tenant #1's data. Under multi-tenancy a missing tenant key must be a **400, not a default**. |
| **T7** | 🟠 Med | `src/lib/coach/lineup.ts:66-67`, `src/app/coach/page.tsx:142-143`, `stats/page.tsx:64`, `import/page.tsx:48,53` | localStorage keys are **global per origin**: `outlaws-field-app:v1`, `outlaws-field-app:games:v1`, `warriors-coach:lineup-plan:v1`. One app instance serving many orgs means the offline write-ahead buffer bleeds across tenants on a shared device — or for a coach who belongs to two orgs. No amount of RLS design catches this; it's client-side. |
| **T8** | 🟡 Low | `supabase-setup.sql:3-14` | `tryout_signups` has **no team column and no org column at all**. It still needs `org_id` — the coach product reads it (`/coach/tryouts` in MERGE-PLAN §6 Phase 4) even though the public form stays single-tenant (§5). |
| **T9** | 🟡 Low | `scripts/run-migration.mjs:13` | `PROJECT_REF` is hardcoded to `omwqwwflvnunuvgidvwx`. Fine for one shared database (which is the recommendation, §2.1) — flagged only so nobody mistakes it for a per-tenant knob. |

### 0.4 Branding: four buckets, not one grep

`grep -rci outlaws src/` returns 180 hits in `seed-db.json`, 79 in `coach/page.tsx`, 34 in
`dashboard/page.tsx`. Reporting that as "branding scattered everywhere" would be wrong and
would size the work at 3× reality. The hits split cleanly:

| Bucket | Count / examples | Workstream |
|---|---|---|
| **(a) Identifiers** — `outlawsScore`, `outlaws_runs_after`, `outlawsAreHome`, `outlawsLineup` | 121 matches of `outlaws[A-Z_]` in `src/**/*.ts{,x}` | **Rename** (MT-1). Mechanical, `sed`-able, zero tenancy semantics. |
| **(b) Data values** — `"outlaws"` / `'outlaws'` as a `TeamAtBat` literal | 55 quoted-literal matches; plus every `batting_team` cell in the 119 live rows | **Rename + data migration** (MT-1). `update play_events set batting_team='us'` under a relaxed check constraint. |
| **(c) User-visible copy** — `"Outlaws"`, `"Warriors"`, `"EAST CHEROKEE"` | Small and already funnelled: `coach/page.tsx:360` `teamLabel()` is *already* the single chokepoint for the scoring screen's team label; the rest is ~15 sites (`heatmap-canvas.tsx:271,337,346,376`, `stats/page.tsx:179,181,336`, `game/[gameId]/page.tsx:31`, `import/page.tsx:217,298`) | **Config** (MT-4). |
| **(d) Assets & storage keys** — `/coach/icons/outlaws-*`, `outlaws-field-app:v1`, `warriors-backup-pts` | ~10 sites | **Config + namespacing** (MT-4 / T7). |

Only (c) and (d) are actually "branding." (a) and (b) are a rename that has to happen anyway
and gets more expensive with every feature written against `outlawsScore`.

### 0.5 What the pivot closes from MERGE-PLAN §9

**§9.7 — "Are the Outlaws and the Warriors 8U the same set of kids, or two teams in one app?"
— is now answered by the pivot, and the answer is neither.** They are one *organization*
(Stuart's), which owns one or more teams. The multi-tenant model makes "many teams" the
default rather than a special case, so the team-switcher-vs-implicit-team question resolves to
"team switcher, scoped to the current org." Close that item.

§9.4 (jersey-number ↔ name mapping) and §9.3 (parents lost to the broken signup form) are
unaffected and remain open.

---

## 1. Target architecture

### 1.1 The tenancy model in one paragraph

An **organization** is the tenant and the billing unit. It owns **teams**; a team owns
**players**, **games**, **lineup plans**, and **tryout signups**. A **user** is a person with
a real login; `org_members` joins users to orgs with a role. Every tenant-scoped table carries
a denormalized `org_id`, and RLS policies compare that column against the caller's org
membership. One deployment, one database, one `public` schema — **not** schema-per-tenant and
**not** database-per-tenant (§9.2 explains why).

```
organizations (tenant, billing unit, branding config)
   ├── org_members ──> auth.users            (who can see this org, and as what)
   ├── teams        (OUR teams AND our opponent records — see §2.3)
   │      ├── players ──> player_aliases
   │      ├── games ──> play_events
   │      └── lineup_plans
   └── tryout_signups
```

### 1.2 Tenant resolution — one helper, never inline

```
src/lib/tenant/context.ts
  getOrgContext(req) -> { orgId, userId, role } | null
```

**Every** tenant lookup goes through this one function. Not through a cookie read in a
component, not through a `searchParams.get("org")` in a route. The reason is §5: today org
identity comes from the session cookie; if subdomains ever happen
(`acme.coachapp.io`), that becomes a `req.headers.host` parse — and it must be a **one-file
change**, not a hunt through 13 pages. This is the cheapest piece of future-proofing in the
whole plan and it costs one file.

### 1.3 Route map delta

```
src/app/
├── page.tsx, games/**          PUBLIC, SINGLE-TENANT (Stuart's team) — see §5
├── admin/                      ❌ DELETED in MT-1 (T3)
├── api/
│   ├── signup/route.ts         PUBLIC, writes org_id = OWNER_ORG_ID (§5.2)
│   ├── signups/route.ts        ❌ DELETED in MT-1 (T3)
│   └── coach/**                🔒 GATED + ORG-SCOPED
│       ├── login/route.ts      passcode -> resolves an ORG, mints an org-bearing session
│       └── (existing 5 routes, each scoped via getOrgContext)
└── coach/
    ├── layout.tsx              🆕 loads org branding, emits CSS vars, links the manifest
    ├── manifest.webmanifest/route.ts  🆕 per-org manifest (name/icons/theme from config)
    └── (existing 7 pages, unchanged in MT-1/MT-2)
```

---

## 2. Data model

### 2.1 One database, one schema, `org_id` everywhere

Reject schema-per-tenant and database-per-tenant. Grounded reasons, not generic ones:

- `scripts/run-migration.mjs:13` applies one SQL file to one hardcoded project ref. N schemas
  means N applications of every migration, and MERGE-PLAN §7.6 already commits to
  forward-only numbered migrations. The tooling is built for one target.
- Supabase Pro bills ~$10/mo per running project (MERGE-PLAN §3.7). Database-per-tenant is a
  linear cost floor on a pre-revenue product.
- `src/lib/supabase.ts`'s PostgREST shim supports `select=`, `order=`, and `col=op.value`
  only (its own header comment, `:40-44`). Adding `org_id=eq.<id>` to every query fits that
  vocabulary exactly. Schema switching does not.

### 2.2 New tables

```sql
-- supabase/migrations/007_organizations.sql
-- Forward-only: do NOT edit 001-005 (MERGE-PLAN §7.6). New work is 006+.
create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id          text primary key,              -- 'org-outlaws' — text PK, matching the
                                             -- existing teams/games/players convention
  slug        text not null unique,          -- 'outlaws' — future subdomain / URL segment
  name        text not null,                 -- 'East Cherokee Outlaws'
  short_name  text,                          -- 'Outlaws' — the scoreboard label (§4)
  branding    jsonb not null default '{}'::jsonb,   -- see §4.2 for the shape
  plan        text not null default 'free',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Who may see an org, and as what.
--
-- ⚠️ This table stays EMPTY until MT-5. A composite PK makes both columns
-- implicitly NOT NULL, so there is no such thing as a "membership row without a
-- user" — the passcode bridge (§3.2) therefore does NOT write here. During MT-3
-- the sole source of org identity is `org_passcodes` + the JWT `org_id` claim,
-- which is the first branch of current_org_ids() (§2.5). The table is created in
-- MT-2 only so that branch two of that function compiles against a real table.
create table if not exists public.org_members (
  org_id     text not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'coach' check (role in ('owner','coach','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists idx_org_members_user on public.org_members(user_id);
```

A coach can belong to **more than one** org — `org_members` is a many-to-many by
construction. The UI picks one *active* org per session; the policies allow any org the user
is a member of. Getting this right now costs one composite PK; retrofitting it later costs a
session redesign.

### 2.3 `org_id` on existing tables — and the `teams` problem

`teams` today conflates two different things: **our teams** and **opponent scouting records**.
`sync/game/route.ts:66-71` creates an opponent row on the fly from whatever name a coach
typed. Under multi-tenancy, **opponent rows must be tenant-owned**: a spray chart of the NYO
Bucks' hitters is private scouting data that org A paid for with its own game-day attention.
Two orgs that both play the Bucks get two `teams` rows. That's duplication, and it's correct.

Add a `kind` column to say which is which, rather than inferring it from "is it referenced by
`players`":

```sql
-- supabase/migrations/008_org_id_columns.sql   (+ 009 backfill, 010 set not null)
-- THREE STEPS per table. `add column ... not null` fails on a non-empty table,
-- and every one of these tables has live rows.

-- Step 1: add nullable
alter table public.teams          add column if not exists org_id text references public.organizations(id) on delete cascade;
alter table public.games          add column if not exists org_id text references public.organizations(id) on delete cascade;
alter table public.play_events    add column if not exists org_id text references public.organizations(id) on delete cascade;
alter table public.players        add column if not exists org_id text references public.organizations(id) on delete cascade;
alter table public.player_aliases add column if not exists org_id text references public.organizations(id) on delete cascade;
alter table public.lineup_plans   add column if not exists org_id text references public.organizations(id) on delete cascade;
alter table public.tryout_signups add column if not exists org_id text references public.organizations(id) on delete cascade;

alter table public.teams add column if not exists kind text not null default 'opponent'
  check (kind in ('own','opponent'));

-- Step 2: backfill (§6.2) — every existing row belongs to org-outlaws
-- Step 3: set not null (§6.3)
```

**Why `org_id` on every table, denormalized, rather than deriving it through the FK chain
(`play_events -> games -> teams -> org`):** an RLS policy that walks three FKs runs a
correlated subquery per row. `play_events` is the table that grows without bound, and
`local-db.ts:109` selects *all* of it on every dashboard load. A direct column is one index
scan.

**Keep the denormalization honest with composite FKs.** This makes cross-tenant attachment
structurally impossible rather than merely discouraged — the same argument
`001_identity.sql:50-52` makes for `player_aliases.alias` being a PK.

Do this for **every** cross-table reference, not just the obvious one. A composite FK on
`play_events` while `players.team_id` keeps its single-column FK leaves the hole open
somewhere less visible:

```sql
-- supabase/migrations/012_composite_integrity.sql
-- The (org_id, id) uniques the composite FKs target.
alter table public.teams   add constraint teams_org_id_key   unique (org_id, id);
alter table public.games   add constraint games_org_id_key   unique (org_id, id);
alter table public.players add constraint players_org_id_key unique (org_id, id);

-- Each original single-column FK is DROPPED and replaced, not supplemented —
-- leaving both means two overlapping constraints per relation and a confusing
-- error message when one of them fires. ON DELETE behaviour is preserved
-- verbatim from the originals (schema.sql:17,29 and 001_identity.sql:34,61,
-- 004_lineup_plans.sql:42-43).

alter table public.play_events drop constraint if exists play_events_game_id_fkey;
alter table public.play_events add constraint play_events_org_game_fk
  foreign key (org_id, game_id) references public.games(org_id, id) on delete cascade;

alter table public.games drop constraint if exists games_opponent_team_id_fkey;
alter table public.games add constraint games_org_opponent_fk
  foreign key (org_id, opponent_team_id) references public.teams(org_id, id) on delete restrict;

alter table public.players drop constraint if exists players_team_id_fkey;
alter table public.players add constraint players_org_team_fk
  foreign key (org_id, team_id) references public.teams(org_id, id) on delete restrict;

alter table public.player_aliases drop constraint if exists player_aliases_player_id_fkey;
alter table public.player_aliases add constraint player_aliases_org_player_fk
  foreign key (org_id, player_id) references public.players(org_id, id) on delete cascade;

alter table public.lineup_plans drop constraint if exists lineup_plans_game_id_fkey;
alter table public.lineup_plans add constraint lineup_plans_org_game_fk
  foreign key (org_id, game_id) references public.games(org_id, id) on delete cascade;

alter table public.lineup_plans drop constraint if exists lineup_plans_team_id_fkey;
alter table public.lineup_plans add constraint lineup_plans_org_team_fk
  foreign key (org_id, team_id) references public.teams(org_id, id);
```

⚠️ Constraint names above are Postgres' default `<table>_<column>_fkey` form, which is what
`references` inline in `create table` produces. `drop constraint if exists` makes a wrong
guess a silent no-op rather than an error — **so verify each drop actually removed something**
(`select conname from pg_constraint where conrelid = 'public.players'::regclass`) instead of
trusting the migration's exit code.

⚠️ `tryout_signups.player_id` may also carry an FK to `players` — depends on which definition
is live (§6.5 item 1). If it exists, it needs the same treatment.

After this, a play event, a player, an alias, or a lineup plan in org A cannot reference a
game or team in org B. The database refuses it.

### 2.4 Fix the global uniques (T1, T4)

```sql
-- supabase/migrations/011_scope_uniques.sql   (runs BEFORE 012 — the composite
-- FKs in 011 target uniques, and rebuilding player_aliases' PK afterwards would
-- have to drop and recreate the FK 011 just added)
alter table public.teams drop constraint if exists teams_normalized_name_key;
alter table public.teams add constraint teams_org_normalized_name_key
  unique (org_id, normalized_name);                                    -- T1

-- T4: alias PK is global. Rebuild it as (org_id, alias).
alter table public.player_aliases drop constraint if exists player_aliases_pkey;
alter table public.player_aliases add primary key (org_id, alias);
```

⚠️ `player_aliases` is the one place where a drop-and-recreate of a PK touches live data (14
rows). It is safe because `002_link_play_events.sql` already denormalized the resolution into
`play_events.batter_player_id` — nothing reads `player_aliases` on the hot path except
`player-name-db.ts:42`, which fails soft by design (`:76-80`).

Corresponding app change: `src/lib/coach/player-name-db.ts:39-61` `fetchAliasMap()` must take
an `orgId` and filter both selects, and `primeAliasCache()` in `player-name.ts` must become a
**per-org cache** (`Map<orgId, Map<alias, name>>`) rather than the current module-level
singleton. As written, one org's roster would be served to the next request from another org.
This is a real bug the moment tenant #2 exists, and it lives in a file whose header
(`player-name.ts:36-45`) explicitly justifies the singleton on single-tenant grounds.

### 2.5 RLS policy design

The policies below are the real target. They are **inert** while the app connects with the
service-role key (T2) — §3.4 names the exact cutover that turns them on.

**This migration runs LAST in MT-2 (013), after the backfill and after the rename.** Reason:
it turns on `force row level security`, and 012's bulk `UPDATE`s rewrite every row of
`play_events`. Whether the Management-API role that `scripts/run-migration.mjs` uses carries
`BYPASSRLS` is not something this document can settle without a query — so don't depend on it.
Ordering RLS last costs nothing and removes a failure mode where 012's `UPDATE` matches zero
rows and the rename half-lands silently.

```sql
-- supabase/migrations/013_rls_policies.sql

-- Resolve the caller's orgs once, not per row. SECURITY DEFINER so the function
-- itself can read org_members without recursing through org_members' own policy.
create or replace function public.current_org_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  -- Two sources, in priority order:
  --   1. An explicit org_id claim on the JWT (the MT-3 custom-JWT bridge, §3.2)
  --   2. Membership rows for the authenticated user (the MT-5 Supabase Auth path)
  -- Branch 2 returns nothing until MT-5 — org_members stays empty by design (§2.2).
  select nullif(auth.jwt() ->> 'org_id', '')
  union
  select om.org_id from public.org_members om
   where om.user_id = (select auth.uid());
$$;
```

`select nullif(...)` with no `where` yields exactly one row, which is `NULL` when the claim is
absent — and `org_id in (select ...)` never matches `NULL`, so an unclaimed caller sees
nothing. That is the fail-closed behaviour `auth.ts:39-43` already establishes for the
passcode gate, preserved at the database layer.

> `(select auth.uid())` rather than bare `auth.uid()` is deliberate: Postgres hoists the
> scalar subquery into an InitPlan and evaluates it once for the statement instead of once per
> row. This is the standard Supabase RLS performance trap and it matters on `play_events`.

```sql
-- One policy shape, applied to every tenant-scoped table.
do $$
declare t text;
begin
  foreach t in array array[
    'teams','games','play_events','players','player_aliases','lineup_plans','tryout_signups'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$
      create policy tenant_isolation on public.%I
        for all
        to authenticated
        using      (org_id in (select public.current_org_ids()))
        with check (org_id in (select public.current_org_ids()))
    $p$, t);
  end loop;
end $$;

-- organizations: a member may read their own org row (branding, name). Nobody
-- writes it through PostgREST — org creation is an admin operation (§3.5).
alter table public.organizations enable row level security;
create policy org_self_read on public.organizations
  for select to authenticated
  using (id in (select public.current_org_ids()));

-- org_members: a user sees their own membership rows and nothing else.
alter table public.org_members enable row level security;
create policy org_members_self on public.org_members
  for select to authenticated using (user_id = (select auth.uid()));

-- The one deliberate public write: the tryout signup form (§5.2). Insert-only,
-- no select, and only into the owner org.
--
-- ⚠️ THIS POLICY IS DEAD UNTIL THE ROUTE STOPS USING SERVICE-ROLE.
-- src/app/api/signup/route.ts:13 calls getSupabaseClient() — the service-role
-- client, which bypasses it. The policy only constrains anything once that one
-- route switches to the ANON key (§5.2, MT-2 task M7b). Until then it is
-- documentation, and §9.2 is about exactly this confusion.
create policy public_signup_insert on public.tryout_signups
  for insert to anon
  with check (org_id = 'org-outlaws');
```

Two details that are easy to get wrong and expensive to discover in production:

- **`force row level security`** is not optional here. Without it, the *table owner* role
  bypasses RLS even with policies present. The migration runner connects as an owner-level
  role.
- **`for all` covers `select/insert/update/delete`,** but `using` alone does not constrain
  inserts — `with check` does. Both clauses are required or a tenant can write rows stamped
  with another tenant's `org_id`.

### 2.6 The `outlaws` → `us` rename (from §0.2)

```sql
-- supabase/migrations/006_rename_perspective.sql
alter table public.games       rename column outlaws_score       to us_score;
alter table public.games       rename column outlaws_home        to us_home;
alter table public.play_events rename column outlaws_runs_after  to us_runs_after;

alter table public.play_events drop constraint if exists play_events_batting_team_check;
update public.play_events set batting_team = 'us' where batting_team = 'outlaws';
alter table public.play_events add constraint play_events_batting_team_check
  check (batting_team in ('us','them'));
update public.play_events set batting_team = 'them' where batting_team = 'opponent';
```

⚠️ Order matters: drop the constraint, migrate `outlaws`→`us`, re-add the constraint, *then*
migrate `opponent`→`them` — otherwise the new constraint rejects the rows that still say
`opponent`. Better still, do both updates before re-adding. The corresponding code change is
`game-types.ts:13` → `export type TeamAtBat = "us" | "them";` and a mechanical rename across
the 121 identifier sites and 55 literal sites from §0.4.

`seed-db.json` (180 hits) must be regenerated in the same commit — `local-db.ts:88` falls back
to it when Supabase is unreachable, so a stale seed would deserialize into the old union and
silently produce a blank scoreboard during exactly the outage it exists to survive.

---

## 3. Auth model

### 3.1 What's there now, precisely

`src/lib/coach/auth.ts` is 57 lines. `getPasscode()` (`:23-26`) reads one env var;
`hashPasscode()` (`:29-35`) is `sha256("ec-coach-auth:" + passcode)`; the cookie
`ec_coach_auth` holds that hash; `requireCoach()` (`:50-57`) compares cookie to expected and
returns a boolean. `middleware.ts:24-28` does the same comparison at the edge.

It has exactly one useful property worth keeping: it **fails closed** when `APP_PASSCODE` is
unset (`auth.ts:39-43`, MERGE-PLAN B7). Do not regress that at any point below.

It has one fatal property for this product: **there is no identity in it.** A valid cookie
says "someone knows the passcode," which under multi-tenancy is not a statement about which
data they may see.

### 3.2 MT-3: per-org passcodes — the bridge, not the destination

The passcode model generalizes to multi-tenant more cheaply than it looks, and doing so buys
tenant identity **without** building user accounts:

```sql
-- supabase/migrations/014_org_passcodes.sql
create table if not exists public.org_passcodes (
  org_id      text not null references public.organizations(id) on delete cascade,
  passcode_sha text not null,        -- sha256(salt || ':' || passcode), same as auth.ts:29-35
  label       text not null default 'Coaches',
  role        text not null default 'coach' check (role in ('owner','coach','viewer')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (org_id, passcode_sha)
);
create unique index if not exists idx_org_passcodes_sha on public.org_passcodes(passcode_sha)
  where active;
```

`POST /api/coach/login` changes from *compare* to *lookup*: hash the submitted passcode, find
the row, and the row tells you the org. The unique partial index makes one passcode resolve to
at most one org — a collision is a startup-time error, not a runtime ambiguity.

**The session cookie must then carry `org_id`, and it must be tamper-proof.** Today's cookie
is `sha256(salt:passcode)` — a bare value with no integrity binding. Replace with a signed
payload:

```
ec_coach_session = base64url({orgId, role, iat, exp}) + "." + HMAC-SHA256(SESSION_SECRET, payload)
```

`SESSION_SECRET` is a new server-only env var. Both `middleware.ts` (edge) and
`requireCoach()` (node) verify with Web Crypto — the same API `auth.ts:31` already uses, so
this stays runtime-portable.

`requireCoach()` changes signature (T5):

```ts
// src/lib/coach/auth.ts
export type CoachSession = { orgId: string; role: "owner" | "coach" | "viewer" };
export async function requireCoach(): Promise<CoachSession | null>;
```

All six call sites already invoke it at the top of the handler
(`games/route.ts:6`, `game/[gameId]/route.ts:6`, `play-events/route.ts:6`,
`sync/game/route.ts:31`, `lineup/route.ts:75,130`) — the `if (!session)` guard reads
identically, and `session.orgId` is then in scope for the query. **The plumbing already
exists; only the payload changes.**

### 3.3 MT-5: Supabase Auth — designed now, built later

When there's a paying second tenant, replace passcodes with real accounts. Do **not** build a
custom user/password/reset/invite system — that's the one piece where rolling your own is
strictly worse than the managed option, and Supabase Auth is already in the project
(`auth.users` exists; `personal-apps` and Copper Ridge both use it, per MEMORY.md).

Design:

- **Provider:** email magic link as the primary. Coaches log in from a phone in a dugout;
  a password they set once in March and need in October is a support ticket. Magic link has
  no reset flow because it has no password.
- **Org binding:** on invite acceptance, a server action inserts `org_members(org_id, user_id,
  role)` and calls `supabase.auth.admin.updateUserById(id, { app_metadata: { org_id } })`.
  `app_metadata` is **not** user-writable, which is what makes it safe to read in an RLS
  policy. `user_metadata` is user-writable and must never appear in a policy.
- **Session:** `@supabase/ssr` cookie-based sessions, refreshed in `middleware.ts`. This is a
  dependency add (`@supabase/ssr`) on top of the existing `@supabase/supabase-js@^2.49.0`.
- **Active-org switching** for multi-org coaches: a separate `ec_active_org` cookie naming
  which member org is in focus. The JWT claim grants *access*; the cookie chooses *focus*.
  Policies stay membership-based (`current_org_ids()` §2.5 already unions both sources), so a
  forged cookie can only select among orgs the user genuinely belongs to. That is the whole
  reason `current_org_ids()` is a `setof` rather than a scalar.
- **Invites:** `org_invites(token, org_id, email, role, expires_at)`; accepting creates the
  membership. Needed before a second org can onboard itself; not needed to serve a second org
  you set up by hand.

### 3.4 Killing the service-role bypass (T2) — the exact cutover

This is the step that turns §2.5's policies from documentation into enforcement, and it is a
**client-construction change, not a schema change**. Three stages, each independently
shippable:

**Stage A (MT-2) — make the chokepoint mandatory.** All ~14 Supabase calls already funnel
through four functions in `src/lib/supabase.ts` (`sbSelectAll:85`, `sbUpsert:96`,
`sbDelete:108`, `sbInsert:118`). Change their signatures to require a scope:

```ts
export type OrgScope = { orgId: string };
export async function sbSelectAll<T>(scope: OrgScope, table: string, query?: string): Promise<T[]>;
```

…and have each implementation append `org_id=eq.<scope.orgId>` to the query / stamp `org_id`
onto every written row. A missing scope is a **thrown error, never a default** (T6). The
TypeScript compiler then finds every unscoped call site for you — that's the point of putting
the scope in position 1 rather than making it optional.

This is app-layer filtering and is honestly labelled as such. Its value is that it is
*unbypassable by accident*: there is no code path to the database that doesn't go through
these four functions.

**Stage B (MT-3) — real DB enforcement, still without Supabase Auth.** Stop using the
module-level service-role client (`supabase.ts:19-31`) for request-path queries. Instead,
per request, mint a short-lived JWT signed with the project's JWT secret carrying
`{ role: "authenticated", org_id, exp: now+60s }`, and construct the client with the **anon**
key plus that JWT as the auth token. `current_org_ids()` (§2.5) reads the `org_id` claim and
the policies bite. Postgres — not `sbSelectAll` — is now the enforcement boundary.

> ⚠️ **Verify before building this.** Supabase is migrating to asymmetric (ECC/RSA) JWT
> signing keys, and the legacy symmetric JWT-secret path is deprecated for new projects.
> `omwqwwflvnunuvgidvwx` predates that migration so it should still have a symmetric secret,
> but this must be confirmed in the dashboard (Settings → API → JWT Settings) before MT-3 is
> scoped. If it isn't available, Stage B collapses into Stage C and MT-3 ships with Stage A
> enforcement only. See §9.1.

**Stage C (MT-5) — the real user's JWT.** With Supabase Auth in place, the per-request client
is built from the logged-in user's session token via `@supabase/ssr`. `current_org_ids()`
falls through to the `org_members` branch. Custom JWT minting is deleted.

The service-role key survives Stage C in exactly two places, both correct: the migration
runner (`scripts/run-migration.mjs`) and admin operations that must cross tenants (org
creation, §3.5). Both are out of the request path.

**The third place it must *not* survive, and which is easy to forget because it isn't under
`/coach`:** `src/app/api/signup/route.ts:13`. The public tryout form runs service-role today,
which is both unnecessary (it does one insert) and the thing that makes §2.5's
`public_signup_insert` policy inert. Add a second client factory —
`getPublicSupabaseClient()` using a new `SUPABASE_ANON_KEY` env var — and point that one route
at it. **Do this in MT-2, not MT-5**: it's four lines, it's the only place a real RLS policy
can be proven to work before the JWT plumbing exists, and it makes the public site's blast
radius one insert instead of the entire database.

### 3.5 Org provisioning

Deliberately **not** self-serve. Creating an org is a `scripts/create-org.mjs` run by Stuart:
insert `organizations`, insert an `org_passcodes` row (MT-3) or send an owner invite (MT-5),
insert the org's own `teams` row with `kind='own'`. Self-serve signup is a §9.4 deferral —
building a signup funnel for a product with zero paying customers is the textbook wrong order.

---

## 4. Branding and per-tenant config

### 4.1 Why env vars can't do this — and what already landed

`.env.local.example` is the current config surface and it is process-global. One running
instance serving org A and org B cannot read a different `TEAM_NAME` per request. Branding has
to be **data**, keyed to the tenant, loaded per request. This is the single hard constraint the
pivot imposes on config.

> ⚠️ **In-flight, uncommitted as of 2026-09-21:** `src/lib/brand-config.ts` appeared in the
> worktree during the writing of this document (a parallel session), along with
> `src/app/layout.tsx` rewired to consume it. It exports `club` / `team` / `colors` /
> `assets` as module-level `as const` objects.
>
> **This is the right first half and the wrong final shape.** Right: it collapses ~40
> scattered hex literals and name strings into one module, which is the genuinely tedious part
> of §4 and is now done. Its header comment also independently reaches this plan's §0.2
> conclusion — that `"outlaws"` as a `TeamAtBat` value, a row id, and a device-state key is
> *persisted data* and must never be driven from branding config. That agreement is worth
> noting: two passes over the code found the same seam.
>
> Wrong for multi-tenancy: `as const` at module scope is resolved at **build time and shared
> by every request**, which is the same defect as an env var (§4.1's opening paragraph) in a
> nicer wrapper. It cannot serve org A and org B different values.
>
> **Net effect on MT-4: it gets cheaper and its shape changes.** MT-4 is no longer "centralize
> the branding strings" — it is "change `brand-config.ts` from a constant into a per-request
> lookup." Concretely, `export const club = {...}` becomes
> `export async function getBrand(orgId: string): Promise<Brand>` reading
> `organizations.branding`, with today's literals kept as the fallback for `OWNER_ORG_ID`.
> Every call site already imports from one module, so the change is contained. Do **not** ask
> the parallel session to stop or redo this — it is strictly forward progress toward MT-4.

### 4.2 The shape

`organizations.branding jsonb` (§2.2). Read once per request in the layout, never in a leaf
component:

```jsonc
{
  "colors": {
    "primary":   "#0f172a",   // coach.css --bg-primary
    "accent":    "#3b82f6",   // coach.css --accent-primary
    "publicInk": "#0f2044",   // marketing navy (public site only)
    "publicGold":"#c9a84c"
  },
  "logo":       { "src": "/org/outlaws/logo.png", "alt": "Outlaws" },
  "icons":      { "192": "/org/outlaws/icon-192.png", "512": "/org/outlaws/icon-512.png",
                  "maskable512": "/org/outlaws/maskable-512.png" },
  "scoreboard": { "usLabel": "Outlaws", "themLabelFallback": "Opponent" },
  "pwa":        { "name": "Outlaws Coach", "shortName": "Outlaws" }
}
```

Assets live in Supabase Storage (or `public/org/<slug>/` while there's one tenant) and the
config holds URLs. Do not put image bytes in the jsonb.

### 4.3 The injection point: a coach layout that doesn't exist yet

From §0.1 finding 2: `src/app/coach/layout.tsx` is missing and `coach.css` is imported
nowhere. That's an opportunity, not a bug to fix twice. `coach.css:7-20` already defines the
entire dark theme as **custom properties** on `.coach-theme`:

```css
.coach-theme {
  --bg-primary: #0f172a;   --bg-secondary: #1e293b;   --bg-card: #1e293b;
  --accent-primary: #3b82f6;  --accent-secondary: #8b5cf6;  /* … */
}
```

So a server layout that reads the org's branding and emits an inline `style` overriding those
variables **themes the entire coach app with zero component edits**:

```tsx
// src/app/coach/layout.tsx  (new)
import "./coach.css";
import { getOrgContext } from "@/lib/tenant/context";
import { getOrgBranding } from "@/lib/tenant/branding";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  const b = await getOrgBranding(ctx?.orgId);
  return (
    <div
      className="coach-theme"
      style={{
        ["--bg-primary" as string]: b.colors.primary,
        ["--accent-primary" as string]: b.colors.accent,
      }}
    >
      {children}
    </div>
  );
}
```

One file themes seven pages. That is the strongest single argument for doing branding as a
data-driven config rather than a find-and-replace: the CSS was already written for it.

### 4.4 The remaining surfaces

| Surface | Today | Change |
|---|---|---|
| **`src/lib/brand-config.ts`** | In-flight (§4.1): module-level `as const`, build-time, one tenant | `getBrand(orgId)` reading `organizations.branding`; today's literals become the `OWNER_ORG_ID` fallback. **The single highest-leverage edit in MT-4** — every other row in this table flows through it |
| Scoreboard label | `coach/page.tsx:360` `teamLabel()` — **already a chokepoint** | Read `branding.scoreboard.usLabel` instead of the literal `"Outlaws"` |
| Other visible strings | `heatmap-canvas.tsx:271,337,346,376`, `stats/page.tsx:179,181,336`, `game/[gameId]/page.tsx:31`, `import/page.tsx:217,298` | Thread the same label down as a prop, or a `useBranding()` context from the layout |
| Coach PWA manifest | `public/coach/manifest.webmanifest` — static, says "Outlaws Field App", linked by nothing | Replace with `src/app/coach/manifest.webmanifest/route.ts` returning per-org JSON. Add it and `/coach/icons/*` to `middleware.ts:15`'s `OPEN` set — a manifest that 307s cannot be parsed and the install silently fails (MERGE-PLAN §4 already warned about exactly this) |
| localStorage keys (T7) | `outlaws-field-app:v1` etc. | Namespace: `coach:<orgId>:game:v1`. **Include a one-time migration** that reads the old key and rewrites it under the org-1 key, or Stuart loses his in-progress game state on the deploy |
| Coach icons | `public/coach/icons/outlaws-*.png` | Move to `public/org/<slug>/`, referenced from `branding.icons` |
| Root layout / public manifest | `layout.tsx:15-35`, `public/manifest.json` | **Unchanged** — single-tenant by decision (§5) |

---

## 5. The public site: recommendation

### 5.1 Recommendation — keep it single-tenant. Do not build per-tenant public pages.

**Recommendation: the marketing site, tryout signup, and kids' games stay Stuart's team's, on
the apex domain, single-tenant. Only `/coach` becomes multi-tenant.**

Grounded reasons:

1. **`src/app/page.tsx` is 364 lines of irreducibly East Cherokee content**, not a template
   with a team name in it: `COACH_EMAIL = "warriors8u@gmail.com"` (`:8`), `"EAST CHEROKEE"` /
   `"WARRIORS"` (`:110-111`), `"8U · Travel Ball · Canton, GA · 2026"` (`:138`), a
   `TRYOUTS_OPEN` season flag (`:7`), and prose about "the warrior spirit" (`:114`).
   Templating that isn't "add a config" — it's rewriting the page into a CMS. That's a
   multi-week project whose output is a worse marketing page than the one Stuart has.
2. **`/games/**` has no tenancy dimension at all.** `src/lib/gameData.ts` is 920 lines of
   generic baseball rules and backup-position scenarios. Nothing in it is team-specific. It's
   content, and content doesn't need a tenant key.
3. **They are different products.** The coach tool is a SaaS utility sold to organizations.
   The marketing site sells *one* 8U team to *local parents*. An org buying lineup software
   does not want its recruiting page hosted inside its vendor's app — it already has a
   website, or a Facebook group, or a GameChanger link.
4. **There is no demand for it.** One interested org, no signed deal (per
   `memory/project-warriors-org-interest.md`). Building a per-tenant CMS is speculative work
   for a customer who hasn't asked for it and may never.

### 5.2 What that costs, and the two things to do anyway

The cost is that `tryout_signups` becomes slightly asymmetric: the public form writes only
Stuart's org, but the coach-side reader is org-scoped like everything else. That's a five-line
concession, not an architectural compromise:

1. `src/app/api/signup/route.ts` stamps `org_id = OWNER_ORG_ID` (a real env var — this one
   *can* be env-based precisely because the public site is single-tenant).
2. That same route switches from `getSupabaseClient()` (service-role) to a new
   `getPublicSupabaseClient()` on the **anon** key. This is what makes the
   `public_signup_insert` policy in §2.5 actually enforce anything rather than being
   bypassed — see §3.4's closing note.

And do these regardless, because they keep the subdomain door open for free:

- **All org resolution through `getOrgContext()`** (§1.2). Cookie today, `req.headers.host`
  later, one file either way.
- **`organizations.slug` exists from day one** (§2.2). It costs a column now; adding it after
  a customer has bookmarked URLs costs a redirect table.

### 5.3 If a tenant genuinely needs public pages later

The escape hatch, in order of cost: (a) they link to their own site — free; (b)
`/t/<slug>/roster` and `/t/<slug>/schedule` as thin data-driven pages off `players`/`games`
(this is MERGE-PLAN §6 Phase 5, which already planned those pages — make them org-scoped when
they're built, which is nearly free); (c) subdomains with a wildcard domain and host-based
`getOrgContext`. Option (b) is the likely real answer and it is *already on the roadmap*. Do
not pre-build (c).

---

## 6. Migration path — live data, no special cases

Live state per MERGE-PLAN §3.4 and §0.4: **2 teams, 2 games, 119 play events, 11 players, 14
aliases, 1 lineup_plans table, `tryout_signups` = 0 rows.**

**Stuart's team becomes `org-outlaws`, tenant #1, by the same code path as tenant #2.** No
`if (orgId === 'org-outlaws')` anywhere. The way you *prove* that is the migration below: it
creates the org row first and backfills everything into it, so from the application's
perspective there has never been an un-tenanted row.

### 6.1 Order of operations

```
MT-1:
006_rename_perspective.sql   outlaws->us / opponent->them (§2.6)  ← bulk UPDATEs
                             depends on nothing in the tenancy work — that is §0.2 as a number
MT-2:
007_organizations.sql        create organizations + org_members (org_members stays EMPTY, §2.2)
                             seed: org-outlaws / slug 'outlaws' / branding = today's colors
008_org_id_columns.sql       add NULLABLE org_id to 7 tables + teams.kind
009_backfill_org.sql         set org_id='org-outlaws' on every existing row;
                             teams.kind='own' for team-outlaws, 'opponent' for the rest
010_org_not_null.sql         alter column org_id set not null (7 tables)
011_scope_uniques.sql        T1 + T4 — rebuild the two global uniques as org-scoped
012_composite_integrity.sql  (org_id,id) uniques + composite FKs, originals dropped (§2.3)
013_rls_policies.sql         current_org_ids() + tenant_isolation (inert until §3.4B)
                             ⚠️ LAST: enables `force row level security` (§2.5)
MT-3:
014_org_passcodes.sql        per-org passcode lookup (§3.2)
```

These numbers are authoritative; the §2 snippets carry the same ones. Three orderings are
load-bearing rather than arbitrary:

- **006 first and alone** — the rename touches no tenancy object, so MT-1 stays independently
  shippable exactly as §0.2 argues.
- **011 before 012** — 012's composite FKs target the uniques 011 rebuilds, and rebuilding
  `player_aliases`' PK afterwards would mean dropping and recreating an FK just added.
- **013 last** — it enables `force row level security`. Every bulk `UPDATE` in the sequence
  (006's rename, 009's backfill) runs before any policy is in force, so none of them can
  silently match zero rows.

### 6.2 The backfill

```sql
-- 009_backfill_org.sql
insert into public.organizations (id, slug, name, short_name, branding)
values ('org-outlaws','outlaws','East Cherokee Outlaws','Outlaws','{}'::jsonb)
on conflict (id) do nothing;

update public.teams          set org_id = 'org-outlaws' where org_id is null;
update public.games          set org_id = 'org-outlaws' where org_id is null;
update public.play_events    set org_id = 'org-outlaws' where org_id is null;
update public.players        set org_id = 'org-outlaws' where org_id is null;
update public.player_aliases set org_id = 'org-outlaws' where org_id is null;
update public.lineup_plans   set org_id = 'org-outlaws' where org_id is null;
update public.tryout_signups set org_id = 'org-outlaws' where org_id is null;

update public.teams set kind = 'own'      where id = 'team-outlaws';
update public.teams set kind = 'opponent' where id <> 'team-outlaws';
```

Every statement is `where org_id is null` — re-runnable, matching MERGE-PLAN §7.6's
forward-only/idempotent rule. Same reasoning as `005_backfill_batter_player_id.sql:23-25`.

### 6.3 Verification checklist

**Two blocks, at two different points in the sequence.** Running them together as one
post-migration block is the obvious mistake, and it produces a check that passes for the wrong
reason.

**Block A — immediately after 006 (end of MT-1).** This re-runs MERGE-PLAN §2.4's own
completeness check under the renamed value:

```sql
-- Every row moved to the new vocabulary — the old values must be gone entirely.
select batting_team, count(*) from public.play_events group by 1;  -- only 'us' and 'them'

-- The Phase 2 backfill survived the rename.
select count(*) from public.play_events
 where batter_player_id is null and batting_team = 'us';           -- 0
```

⚠️ Run the second query **before** 006 and it returns 0 because `batting_team` is still
`'outlaws'` — the predicate matches nothing, and an empty result is indistinguishable from a
healthy one. The `group by` line exists precisely to catch that: if it still shows
`outlaws`/`opponent`, the zero below it is meaningless. **Always read the two together.**

**Block B — after 010 (mid-MT-2).** The equivalent of MERGE-PLAN §3.4's five-item check:

```sql
select count(*) from public.organizations;                          -- expect 1
select count(*) from public.org_members;                            -- expect 0 until MT-5
select count(*) from public.teams          where org_id is null;    -- 0
select count(*) from public.games          where org_id is null;    -- 0
select count(*) from public.play_events    where org_id is null;    -- 0  (of 119)
select count(*) from public.players        where org_id is null;    -- 0  (of 11)
select count(*) from public.player_aliases where org_id is null;    -- 0  (of 14)
select count(*) from public.lineup_plans   where org_id is null;    -- 0
select count(*) from public.tryout_signups where org_id is null;    -- 0
```

**Block C — after 012.** Confirm the composite FKs replaced the originals rather than joining
them (§2.3's warning about `drop constraint if exists` silently no-op'ing a wrong guess):

```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
  from pg_constraint
 where contype = 'f'
   and conrelid in ('public.play_events'::regclass, 'public.games'::regclass,
                    'public.players'::regclass, 'public.player_aliases'::regclass,
                    'public.lineup_plans'::regclass)
 order by 1, 2;
-- Expect exactly one FK per relation, every one of them two-column and leading with org_id.
```

### 6.4 What can be lost, honestly

- **Game data: three copies exist** (`data/local-db.json`, `src/lib/coach/seed-db.json`,
  `outlaws-field-app/supabase/schema.sql`), byte-identical per MERGE-PLAN §0.4. Effectively
  unloseable.
- **`tryout_signups`: zero rows** (MERGE-PLAN §3.4). The table with no backups is also the
  table with nothing in it. This genuinely lowers the risk rather than papering over it.
- **localStorage on Stuart's phone: one copy, no backup.** The live-scoring blob under
  `outlaws-field-app:v1` has never been synced anywhere except when a game is explicitly
  pushed. **The T7 key-namespacing rename is the single highest-risk item in this whole
  plan**, because it silently orphans that blob. Ship the old-key→new-key migration in the
  same commit, and have Stuart use `/coach/import`'s export before the deploy.

### 6.5 Two ambiguities that need a live check before MT-2

1. **Which `tryout_signups` definition is actually deployed?** The repo holds two conflicting
   ones: `supabase-setup.sql:3-14` (9 columns, no eval fields) and MERGE-PLAN §3.3 (adds
   `evaluated_at`, `eval_scores`, `eval_notes`, `player_id`). MERGE-PLAN §3.2 step 5 says the
   table was created during Phase 0, but doesn't say from which definition. Resolving this
   requires a database query, which is out of scope for a planning document — **check it
   before writing 007**, because `add column if not exists org_id` is safe either way but the
   §9 tryout-eval work is not.
2. **Does `omwqwwflvnunuvgidvwx` still have a symmetric JWT secret?** Gates §3.4 Stage B. See
   §9.1.

---

## 7. Phased rollout

Named **MT-1…MT-5** rather than continuing MERGE-PLAN's Phase 1–5 numbering, because
MERGE-PLAN's Phase 4 (Dugout Master) and Phase 5 (public roster/schedule) are still unbuilt
and the numbers must not collide. Each phase ends deployable, in MERGE-PLAN's tradition.

### MT-1 — De-Outlaw and delete the second auth system (no tenancy yet)

Ships completely alone. Nothing here depends on organizations existing.

1. **Delete `/admin`** — `src/app/admin/page.tsx`, `src/app/api/signups/route.ts`, and the
   `ADMIN_PASSWORD` env var in `.env.local.example:9` and Vercel (T3, MERGE-PLAN §4).
   Tryout-signup viewing moves behind the coach gate when MERGE-PLAN Phase 4 builds
   `/coach/tryouts`; until then it's a SQL query, which is fine for a table with 0 rows.
2. **Migration 006** (§2.6): rename `outlaws_*` columns, migrate `batting_team` values.
   It is numbered first because it depends on nothing in the tenancy work — which is the
   §0.2 split restated as a migration number.
3. **Rename in code**: 121 identifier sites + 55 literals (§0.4 buckets a/b),
   `game-types.ts:13` union, regenerate `seed-db.json`.
4. **Create `src/app/coach/layout.tsx`** importing `coach.css` and rendering `.coach-theme` —
   fixes the dead-stylesheet finding from §0.1 and pre-positions §4.3.
5. **Fix `middleware.ts:15`**: add `/coach/manifest.webmanifest` and a `/coach/icons/` prefix
   check to `OPEN`.
6. Verify: `npm run build` (**`--webpack`**, per MERGE-PLAN §7.9 — Turbopack prod builds are
   broken in Next 16.2.6 here), all 7 coach pages render, a game logs and syncs end to end,
   the 119 historical events still aggregate on `/coach/stats`.

**Gate:** deployable and strictly better than today, with or without the rest of this plan.

### MT-2 — Tenant schema and the mandatory scope

1. Migrations 007–013 (§6.1), including RLS policies (inert — say so in the commit message so
   nobody later reads their presence as enforcement).
2. `src/lib/tenant/context.ts` — `getOrgContext()` (§1.2). In MT-2 it returns a constant
   `{ orgId: OWNER_ORG_ID }`; the plumbing is what matters.
3. **`src/lib/supabase.ts` Stage A** (§3.4): scope-first signatures on all four shim
   functions; TypeScript then enumerates every call site.
4. **Public signup route onto the anon key** (§3.4 closing note, §5.2): add
   `getPublicSupabaseClient()` + `SUPABASE_ANON_KEY`, point `api/signup/route.ts:13` at it,
   stamp `org_id = OWNER_ORG_ID`. This is what makes `public_signup_insert` a live policy
   rather than documentation — and it is the **only** place in MT-2 where RLS actually
   enforces anything, so it doubles as the proof that §2.5's policies are correctly written.
5. Per-org alias cache in `player-name.ts` / `player-name-db.ts` (§2.4).
6. `DEFAULT_TEAM_ID` fallbacks become 400s (T6): `lineup.ts:61`,
   `lineup/route.ts:89,159`.
7. Verify: §6.3 Blocks B and C; plus a **negative test** — hand-insert an `org-test` row into
   `teams`/`games`, confirm `/coach/games` does not return it, then delete it. Plus a
   **positive RLS test**: submit the public tryout form with `org_id` tampered to `org-test`
   and confirm Postgres rejects it.

**Gate:** deployable, behaviour-identical for Stuart, every query provably org-scoped.

### MT-3 — Real tenant identity + real DB enforcement

1. Migration 014 (`org_passcodes`), seed Stuart's current `APP_PASSCODE` as `org-outlaws`'s.
2. Signed session cookie (§3.2); `requireCoach()` returns `CoachSession | null` (T5);
   `middleware.ts` verifies the HMAC; `getOrgContext()` reads the real org.
3. `SESSION_SECRET` env var, marked Sensitive in Vercel.
4. **§3.4 Stage B**: per-request custom-JWT client, service-role removed from the request
   path. §2.5's policies become live enforcement. *Conditional on §6.5 item 2.*
5. localStorage namespacing + old-key migration (T7, §6.4).
6. Verify: create `org-test` with its own passcode, log in as each, confirm neither sees the
   other's games — **and confirm at the database level** by running a scoped query directly,
   not just by looking at the UI.

**Gate:** a second tenant can be onboarded by hand and is genuinely isolated.

### MT-4 — Branding config

0. **Land the in-flight `brand-config.ts` work first** (§4.1). MT-4 builds directly on it; do
   not start until it is committed, or the two efforts will collide on the same files.
1. Populate `organizations.branding` for `org-outlaws` with today's exact values — take them
   from `brand-config.ts`'s `colors` and `assets` plus `coach.css:8-20`'s custom properties, so
   the seed is a transcription rather than a re-derivation. A **no-op visual change is the
   proof it works**.
2. Convert `brand-config.ts` from module-level `as const` to `getBrand(orgId)` reading
   `organizations.branding`, with today's literals as the `OWNER_ORG_ID` fallback (§4.4).
3. Wire CSS variables through `coach/layout.tsx` (§4.3).
4. `scoreboard.usLabel` through `teamLabel()` (`coach/page.tsx:360`) and the ~9 other visible
   sites (§4.4).
5. `src/app/coach/manifest.webmanifest/route.ts` — per-org manifest; move icons to
   `public/org/<slug>/`.
6. Verify: flip `org-test`'s branding to garish colours and confirm the coach UI changes with
   zero code edits. That is the acceptance test for "config-driven" — anything less is a
   rename in disguise.

**Gate:** a new tenant is a database row plus assets, not a code change.

### MT-5 — Supabase Auth ⏸️ DEFERRED (see §9.3)

`@supabase/ssr`, magic-link login, `org_members.user_id` not-null, invite flow, §3.4 Stage C,
`org_passcodes` deleted. **Do not start this until a second organization has actually
committed.** §9.3 is the argument.

### 7.6 Collision with MERGE-PLAN's unbuilt phases

MERGE-PLAN Phase 4 (Dugout Master: drills, tryout eval) and Phase 5 (public roster/schedule)
are unstarted. **Do MT-1 and MT-2 before either of them.** Reason: every feature written
against `outlawsScore` or an unscoped `sbSelectAll` adds to the rename-and-scope bill, and
both of those phases add new tables and new query sites. MERGE-PLAN Phase 4's
`tryout_signups.eval_scores` columns in particular should be created *with* `org_id`, in one
migration, rather than added and then retrofitted.

---

## 8. Suggested subagent tasks

MT-1 and MT-2 fan out well — both are wide and mechanical, which is the same property that
made MERGE-PLAN §8's Phase 1 parallelizable. MT-3 mostly does not.

| # | Task | Phase | Depends on | Notes |
|---|---|---|---|---|
| **M1** | Delete `/admin` + `/api/signups` + `ADMIN_PASSWORD`; confirm nothing else references them | MT-1 | — | Small, high value, zero risk. Do it first and alone. |
| **M2** | Write migration 006 (column renames + `batting_team` value migration) and apply it | MT-1 | — | ⚠️ Serial with M3 — the DB rename and the code rename must land in one deploy. |
| **M3** | Code rename: 121 identifiers + 55 literals + `game-types.ts:13` + regenerate `seed-db.json` | MT-1 | M2 authored | Split M3a (`coach/page.tsx`, 1764 ln) / M3b (`dashboard`, `stats`, `intel`, `import`, `game/[gameId]`) / M3c (`lib/coach/*`, `components/coach/*`, API routes) for 3-way parallelism. |
| **M4** | Create `coach/layout.tsx`; import `coach.css`; render `.coach-theme`; fix `middleware.ts` `OPEN` | MT-1 | — | Independent of M2/M3. |
| **M5** | Author migrations 007–013 (§6.1); dry-run against a scratch schema | MT-2 | — | **Fully independent — can start immediately, in parallel with all of MT-1.** Largest SQL task. |
| **M6** | `src/lib/tenant/context.ts` + `getOrgBranding()` | MT-2 | — | Tiny, but everything downstream imports it — land it early. |
| **M7** | `src/lib/supabase.ts` Stage A: scope-first shim signatures + fix all ~14 call sites | MT-2 | M5, M6 | TypeScript enumerates the work. Highest-leverage single task in the plan. |
| **M7b** | `getPublicSupabaseClient()` on the anon key; move `api/signup/route.ts:13` onto it; stamp `OWNER_ORG_ID` | MT-2 | M5 | Small and independent of M7. The only live RLS enforcement in MT-2 (§5.2). |
| **M8** | Per-org alias cache (`player-name.ts` + `player-name-db.ts`); `DEFAULT_TEAM_ID` → 400 | MT-2 | M7 | Small; has a real correctness bug in it (§2.4). |
| **M9** | Negative-isolation test harness: seed `org-test`, assert no leakage across every route | MT-2 | M7 | **Do not skip.** This is the only artifact that proves the plan worked. |
| **M10** | Branding: populate `branding` jsonb, CSS-var wiring, `teamLabel()`, ~9 visible sites | MT-4 | M6, M4 | |
| **M11** | Per-org manifest route + icon relocation | MT-4 | M10 | |
| **M12** | localStorage namespacing + old-key migration | MT-3 | M6 | ⚠️ Touches Stuart's only copy of live game state — review by hand (§6.4). |

**Serial, not delegated** — the same category MERGE-PLAN §8 carved out:

- **MT-3's session/HMAC design and the §3.4 Stage B JWT cutover.** Auth is where a
  plausible-looking diff is indistinguishable from a correct one.
- **Applying 013 to live data.** A column rename against production is not a fan-out task.
- **The M12 localStorage migration**, per above.
- **§6.5's two live checks.** They need a database connection and a judgement call.

---

## 9. Risks, unknowns, and how much to build now

### 9.1 🔲 Unknown — is the symmetric JWT secret still available?

§3.4 Stage B mints a custom JWT signed with the project's JWT secret. Supabase has moved to
asymmetric signing keys and deprecated the symmetric path for new projects.
`omwqwwflvnunuvgidvwx` predates that, so it probably still has one — **but this is unverified
and it gates real DB-level enforcement in MT-3.** Check Settings → API → JWT Settings before
scoping MT-3. If it's gone, MT-3 ships with Stage A (chokepoint) enforcement and real RLS
enforcement moves to MT-5 with Supabase Auth. Say that out loud in the MT-3 commit rather than
letting the RLS policies' mere existence imply protection.

### 9.2 Risk — RLS is not enforcement until the client changes

The most likely failure mode of this entire plan is shipping §2.5's policies, seeing them in
the migration history, and believing tenants are isolated — while `supabase.ts:19-31` still
hands out a service-role client that bypasses every one of them. **Mitigation:** the MT-2
commit message and the migration header both state "INERT — enforcement lands in MT-3 §3.4
Stage B," in the same way `005_backfill_batter_player_id.sql:5-7` announces itself as
reference-only. And M9's negative test must run against the *database*, not the UI.

### 9.3 The real recommendation: build the schema, defer the auth

**Build now (MT-1 + MT-2, roughly one focused session each):**

- The `outlaws`→`us` rename. **This gets monotonically more expensive with every feature
  written**, and MERGE-PLAN Phase 4 is queued right behind it. It is also the one item with
  positive value even if multi-tenancy is abandoned tomorrow — it's just better code.
- `org_id` columns, composite FKs, scoped uniques, backfill. Retrofitting a tenant key gets
  worse as data grows, and more importantly it gets worse as *query sites* grow. There are 14
  today. Phase 4 and Phase 5 would add ~10 more.
- The `sbSelectAll`-scope chokepoint. Small diff, and it's the mechanism that makes every
  later query correct by construction.
- Deleting `/admin`. Independently justified — it's a live credential-sharing hole today,
  tenants or no tenants.

**Build when convenient (MT-3, MT-4):**

- Per-org passcodes and branding config. Neither is needed until there's a second org, but
  both are cheap and MT-4 in particular has a satisfying property: `coach.css` was already
  written with CSS variables, so one new file themes the whole app.

**Do not build until a second organization has actually signed (MT-5):**

- Supabase Auth, invites, self-serve org signup, billing, subdomains, an org-admin UI, a
  per-tenant public CMS.

**The honest reasoning, not a hedge.** There is one interested org and no deal
(`memory/project-warriors-org-interest.md`). The argument for doing the schema work now is
*not* "multi-tenant is the direction" — it's that `org_id` is the one decision that's
genuinely painful to reverse, and it's cheap while there are 119 rows and 14 query sites. The
argument for deferring auth is symmetric: replacing the passcode is the **highest-risk,
lowest-immediate-value** piece in the plan. It touches the login path of a tool Stuart uses
**during live games**, which MERGE-PLAN §7.4 explicitly protects, and it delivers nothing to
the only current user, who is perfectly well served by one passcode.

The passcode is not technical debt at one tenant. It becomes technical debt at two. Build the
thing that's expensive to add later; skip the thing that's cheap to add later.

**The tell that this line is drawn correctly:** after MT-2, adding tenant #2 is a manual
database insert plus a passcode — doable in an hour, by hand, for a pilot customer. That's the
right amount of readiness for a product with no customers. If a deal closes, MT-3 and MT-4 are
each a session's work and MT-5 follows the money.

### 9.4 Risk — MERGE-PLAN Phase 4/5 written against the old shape

Covered in §7.6. Restated here because it's the likeliest way this plan gets undermined in
practice: someone builds `/coach/drills` or `/coach/tryouts` first, against unscoped queries
and `outlawsScore`, and M3/M7 grow by 30%. **MT-1 and MT-2 block Phase 4 and Phase 5.**

### 9.5 Risk — MT-1's rename touches everything at once

121 + 55 sites across a 1764-line file used during live games. Mitigations: (a) it's
mechanical and type-checked — `TeamAtBat` narrowing means a missed literal is a compile error,
not a runtime one; (b) regenerate `seed-db.json` in the same commit or the offline fallback
deserializes into the old union (§2.6); (c) `npm run build --webpack` and a full end-to-end
game log before deploy; (d) MERGE-PLAN §7.4's feature flags don't help here — a rename can't
be flagged — so this one deploys on a day with no game scheduled.

### 9.6 Risk — cost has no revenue behind it

MERGE-PLAN §3.7: **$35/mo** steady state on the Vercel invoice, for a product with zero paying
customers. Nothing in this plan increases it (one database, one schema, one deployment —
§2.1 — is partly *chosen* for this reason). Flagging it because the multi-tenant pivot makes
"is this project paying for itself" a live question that single-team hobby software didn't
raise.

### 9.7 🔲 Unknown — is "org" the right tenant grain?

`memory/project-warriors-org-interest.md` describes an org wanting a *multi-team/league*
version. A league is plausibly a **tenant containing many orgs**, not an org. This plan models
two levels (org → teams) and not three (league → org → teams). If the interested party is
really a league with independent member clubs that must not see each other's data, the tenant
boundary might need to sit one level up. **Do not design for three levels speculatively** —
but ask before MT-2 applies, because it's the one question whose answer changes the schema
rather than the code.

---

## 10. Open items for Stuart

1. 🔲 **What is the interested organization's actual shape?** One club with several age-group
   teams, or a league of independent clubs? §9.7 — this is the only open item that can change
   the schema, so it's worth one email before MT-2.
2. 🔲 **Name.** Still none (confirmed 2026-09-21). This plan needs no name to proceed —
   `org-outlaws` is a data value and every user-visible string comes from `branding` after
   MT-4. But `package.json:2` still says `"warriors-baseball"`, `layout.tsx:16` says
   "Warriors Baseball — East Cherokee", and the Vercel project is `warriors-baseball`.
   Renaming is cosmetic and can happen any time (MERGE-PLAN §9.5 said the same).
3. 🔲 **Confirm the MVP line in §9.3.** Specifically: are you content that after MT-2, tenant
   #2 is onboarded by Stuart running a script rather than by self-serve signup? That's the
   single assumption the whole "defer MT-5" recommendation rests on.
4. 🔲 **Which `tryout_signups` definition is live?** §6.5 item 1 — needs one query.
5. 🔲 **JWT secret availability.** §9.1 — needs one dashboard check.
6. 🔲 **Export the phone's game state before MT-3.** §6.4 — the localStorage rename orphans
   the only copy. Use `/coach/import`'s export first.
7. ✅ **MERGE-PLAN §9.7 closed by the pivot** — "one team or two teams in one app" is now
   "one org owning many teams." See §0.5.
8. Still open from MERGE-PLAN, unaffected by this plan: §9.3 (parents lost to the broken
   signup form) and §9.4 (jersey-number ↔ name mapping).
