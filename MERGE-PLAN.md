# Warriors + Outlaws Merge — Technical Architecture & Migration Plan

**Status:** plan of record
**Date:** 2026-09-18
**Base repo:** `warriors-baseball`, branch `merge-outlaws-coach`
**Worktree:** `/home/swall/.openclaw/workspace/warriors-baseball-merge`

---

## 0. Findings from the review — read before planning work

### 0.1 The merge is already ~40% done

`merge-outlaws-coach` is not a fresh branch. It is a half-finished port, and any plan that
treats this as greenfield will produce wrong file paths. Verified state:

**Already landed (uncommitted, in worktree):**

| Path | State |
|---|---|
| `src/lib/coach/{analytics,field-geometry,game-types,player-name,seed-db.json}` | byte-identical to Outlaws |
| `src/lib/coach/{db-sync,games-data,local-db,types}.ts` | ported, import paths rewritten to `@/lib/coach/*` |
| `src/lib/coach/auth.ts` | ported **+ security fix** — fails closed when `APP_PASSCODE` unset, cookie renamed `ec_coach_auth`, salt `ec-coach-auth` |
| `src/lib/coach/defense.ts` | **new** — defense constants extracted out of the 1674-line `page.tsx` |
| `src/lib/supabase.ts` | **new** — shared `@supabase/supabase-js` client + PostgREST-shim wrappers (`sbSelectAll`/`sbUpsert`/`sbDelete`/`sbInsert`) so Outlaws call sites port unchanged |
| `src/components/coach/{heatmap-canvas,spray-chart}.tsx` | ported |
| `public/coach/**` | icons, field backgrounds |
| `src/app/coach/coach.css` | ported dark theme |
| `src/app/api/{signup,signups}/route.ts` | refactored onto shared client |

**Not yet done — this is the actual Phase 1 backlog:**

- **Zero pages under `src/app/coach/`** (only `coach.css`). All 8 Outlaws screens still unported.
- **Zero routes under `src/app/api/coach/`.** Note `src/lib/supabase.ts` already documents
  `src/app/api/coach/**` as if it exists.
- **No `src/middleware.ts` at all.** Auth inversion has not happened.
- `src/lib/coach/defense.ts` cites `src/app/coach/dashboard/page.tsx` — also doesn't exist yet.

> ⚠️ **Env var was renamed during the port.** `src/lib/supabase.ts` reads
> `SUPABASE_SERVICE_ROLE_KEY` (Warriors' name). Outlaws used `SUPABASE_SECRET_KEY`.
> Every plan step and the Vercel config below uses the **new** name. Getting this wrong
> silently disables Supabase (`isSupabaseEnabled()` returns false) rather than erroring.

### 0.2 Infrastructure blocker — Supabase free-tier project cap

Both source databases are **paused and unreachable** (`curl` → HTTP 000, host does not resolve):

| Ref | Name | Org | Status |
|---|---|---|---|
| `omwqwwflvnunuvgidvwx` | Outlaws-field0app | Stuart's projects (Vercel-managed) | **INACTIVE** |
| `hrisecaohwqybllffply` | supabase-aureolin-park | Stuart's projects (Vercel-managed) | **INACTIVE** |
| `fnqyckfvnqvhtqtvrdnz` | tournament-finder | Stuart's projects | ACTIVE |
| `tlgeedmgvjlpkrsekpqq` | personal-apps | Buddy Apps | ACTIVE |
| `qlgxkftsluerrfbpdlla` | Copperridge-HOA | Copperridge-HOA's Org | ACTIVE |

Restore was attempted and **rejected**:

```
HTTP 403 — swall3 (2 project limit) has reached their maximum number of
active free projects within organizations where they are administrator or owner.
```

Three active projects already exist against a 2-project cap. **No paused project can be
restored, and no new project can be created, without first freeing a slot.** The API
reports no downloadable backups for either paused project
(`GET /v1/projects/{ref}/database/backups` → `"backups": []`).

**This settles the "which Supabase project do we keep" question — neither.** See §3.

### 0.3 Live bugs found during review

| # | Severity | File | Bug |
|---|---|---|---|
| **B1** | 🔴 High | `outlaws-field-app/src/lib/local-db.ts:66` | `readDb()` routes to Supabase whenever `isSupabaseEnabled()` is true. Env vars *are* set in Vercel, the host doesn't resolve → every read throws → **Outlaws production returns 500 on every data screen right now.** The `seed-db.json` fallback only fires when Supabase is *unconfigured*, never when it's configured-but-broken. Fix: catch and fall back on **error**, not just missing config. |
| **B2** | 🟠 Med | `outlaws-field-app/src/lib/analytics.ts:98` | `computePlayerTendencies` keys `playerMap` on raw `pin.batter`. `canonicalPlayerName` is never applied → `/intel` shows Jack and Jackson as two separate hitters with split spray data. 14 distinct batter strings exist for 11 kids. |
| **B3** | 🟠 Med | `outlaws-field-app/src/app/v2/stats/page.tsx:130,142` | Same raw-`batter` split. `canonicalPlayerName` is not imported in this file at all. |
| **B4** | 🟠 Med | `outlaws-field-app/src/app/page.tsx:1307-1312` | Defense assignment is a **free-text `<input placeholder="Player name">`** — not a select bound to the lineup. Name drift into the defense grid is structurally guaranteed, which is what produced `Linc` vs `Lincoln` in the first place. |
| **B5** | 🟡 Low | `outlaws-field-app/src/app/page.tsx:145,226` | Two incompatible identity namespaces seeded side by side: `DEFAULT_OUTLAWS_LINEUP` is jersey numbers (`"#00","#3","#6"…`), `DEFAULT_DEFENSE_GROUPS` is names (`"Jack","Linc","Kellen"`). The shipped defaults can never match each other. |
| **B6** | 🟡 Low | `outlaws-field-app/src/lib/player-name.ts:2-7` | Alias map direction is inconsistent — `jackson→Jack` (long→short) but `linc→Lincoln` and `aidan→Aiden` (short→long). Hardcoded to one roster; a new player named Jackson can never be represented. |
| **B7** | 🟡 Low | `outlaws-field-app/src/lib/auth.ts:12` | `APP_PASSCODE` defaults to the literal `"outlaws"` — a published default. **Already fixed** in `merge-outlaws-coach`'s `src/lib/coach/auth.ts` (fails closed). Do not regress it. |

### 0.4 Data inventory — asymmetric risk

**Game data is safe.** 2 games / 119 play events / 2 teams, verified **byte-identical across
three independent local copies**:

- `outlaws-field-app/data/local-db.json`
- `outlaws-field-app/src/lib/seed-db.json`
- `outlaws-field-app/supabase/schema.sql` (119 `insert into play_events`, 2 `insert into games`)

Games: `game-2026-05-24-bucks` (12–19 vs NYO Bucks), `game-2026-05-24-wahoos` (16–24 vs
Oregon Park Wahoos). Losing the paused Outlaws DB costs nothing.

**Signup data is the single point of failure.** `tryout_signups` exists **only** in a paused
Supabase project. No local export, no seed file, no SQL dump anywhere in the workspace.
It cannot currently be read.

**Which project holds it is still unknown.** `supabase-aureolin-park` and `Outlaws-field0app`
were created 4 minutes apart (00:15:30 and 00:19:22 on 2026-06-13) under the same
Vercel-managed org. Warriors' Vercel env vars were created ~6 days later, consistent with
either target — or with both apps sharing one project. `vercel env pull` returns empty
values for all three Warriors secrets (Vercel does not return encrypted values), so the ref
cannot be read from the CLI. Referred to below as `<WARRIORS_REF>`, resolved in Phase 0.

### 0.5 Decision recorded

Stuart confirmed: **Jack/Jackson, Aidan/Aiden, and Linc/Lincoln are each one kid**, and he is
open to resetting game/roster data and starting fresh. The plan below therefore treats the
119-event history as *preserved by default but disposable on request* — §2.4 gives both paths.

---

## 1. Target architecture

### 1.1 Route map

```
src/app/
├── page.tsx                      PUBLIC  Warriors home (hero, program, tryouts, signup)
├── roster/page.tsx               PUBLIC  NEW — team roster (reads warriors.players)
├── schedule/page.tsx             PUBLIC  NEW — games + results
├── games/                        PUBLIC  kids' Play & Learn (unchanged)
│   ├── page.tsx  daily/  rules/  backup/  position/
├── api/
│   ├── signup/route.ts           PUBLIC  tryout signup POST
│   └── coach/                    🔒 GATED
│       ├── login/route.ts                passcode → ec_coach_auth cookie
│       ├── games/route.ts
│       ├── game/[gameId]/route.ts
│       ├── sync/game/route.ts
│       ├── play-events/route.ts
│       ├── lineup/route.ts               NEW — defense plan persistence
│       ├── players/route.ts              NEW — roster CRUD
│       └── signups/route.ts              MOVED from /api/signups
└── coach/                        🔒 GATED  (except /coach/login)
    ├── login/page.tsx
    ├── page.tsx                          live scoring  (was Outlaws /)
    ├── dashboard/page.tsx                (was Outlaws /dashboard)
    ├── intel/page.tsx                    (was Outlaws /intel)
    ├── stats/page.tsx                    (was Outlaws /v2/stats)
    ├── import/page.tsx                   (was Outlaws /game-import)
    ├── game/[gameId]/page.tsx
    ├── lineup/page.tsx                   NEW — Dugout Master lineup builder
    ├── roster/page.tsx                   NEW — player identity admin
    ├── drills/page.tsx                   NEW — drill library
    ├── tryouts/page.tsx                  NEW — evaluation (was /admin)
    └── coach.css
```

`src/app/admin/page.tsx` is **deleted** — folded into `/coach/tryouts` under the single gate.

### 1.2 One database, one schema

Single Supabase project `tlgeedmgvjlpkrsekpqq` (`personal-apps`), with all baseball tables in
a dedicated **`warriors` Postgres schema** — not table prefixes. Rationale: `personal-apps`
already hosts daily-walk and courtney-health in `public`; a separate schema gives collision-free
namespacing, a single `grant` surface, and a clean `pg_dump -n warriors` backup boundary.

### 1.3 Two PWAs, two scopes, one origin

| | Public | Coach |
|---|---|---|
| manifest | `/manifest.json` | `/coach/manifest.json` |
| `scope` | `/` | `/coach` |
| `start_url` | `/` | `/coach` |
| service worker | `/sw.js` scope `/` | `/coach/sw.js` scope `/coach` |
| icons | Warriors logo | Outlaws icons (`public/coach/icons/`) |

Installing both produces two independent home-screen apps from one deployment. **Capacitor is
not used** — it adds a native build/signing pipeline and app-store review for zero benefit
here; both installs are already achievable with plain web manifests.

---

## 2. Data model unification

### 2.1 New identity tables

The fix for B2–B6. Provenance-preserving: the raw `batter` string is **never dropped**.

```sql
-- migrations/001_warriors_schema.sql
create schema if not exists warriors;
create extension if not exists "pgcrypto";

create table warriors.players (
  id             text primary key,          -- 'plr-jack', app-generated
  team_id        text not null references warriors.teams(id) on delete restrict,
  display_name   text not null,             -- canonical: 'Jack'
  first_name     text,
  last_name      text,
  jersey_number  text,                      -- text: '#00' ≠ 0
  bats           text check (bats in ('L','R','S')),
  throws         text check (throws in ('L','R')),
  birth_year     integer,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (team_id, jersey_number)
);

create table warriors.player_aliases (
  alias      text primary key,              -- ALWAYS lower(btrim(x))
  player_id  text not null references warriors.players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_player_aliases_player on warriors.player_aliases(player_id);
create index idx_players_team          on warriors.players(team_id);
```

### 2.2 Wire play events to identities

```sql
-- migrations/002_link_play_events.sql
alter table warriors.play_events
  add column batter_player_id text references warriors.players(id) on delete set null;

create index idx_play_events_batter_player on warriors.play_events(batter_player_id);
```

`play_events.batter` (text) stays exactly as-is. `batter_player_id` is nullable — an
unrecognized name still records the play, it just doesn't aggregate until an alias is added.
This is the whole point: **never lose a plate appearance to a typo.**

### 2.3 Seed the roster and aliases

11 players, 14 observed strings. Jersey numbers from `DEFAULT_OUTLAWS_LINEUP`
(`#00 #3 #6 #11 #15 #18 #20 #22 #31 #41 #99`) — assignment must be **confirmed by Stuart**,
since the numbers and names were never correlated in the source (that is B5).

```sql
-- migrations/003_seed_roster.sql
insert into warriors.players (id, team_id, display_name) values
  ('plr-jack','team-outlaws','Jack'),       ('plr-lincoln','team-outlaws','Lincoln'),
  ('plr-aiden','team-outlaws','Aiden'),     ('plr-caden','team-outlaws','Caden'),
  ('plr-corey','team-outlaws','Corey'),     ('plr-felix','team-outlaws','Felix'),
  ('plr-foster','team-outlaws','Foster'),   ('plr-kellen','team-outlaws','Kellen'),
  ('plr-levi','team-outlaws','Levi'),       ('plr-phoenix','team-outlaws','Phoenix'),
  ('plr-ryan','team-outlaws','Ryan')
on conflict (id) do nothing;

insert into warriors.player_aliases (alias, player_id) values
  ('jack','plr-jack'),       ('jackson','plr-jack'),        -- confirmed same kid
  ('lincoln','plr-lincoln'), ('linc','plr-lincoln'),        -- confirmed same kid
  ('aiden','plr-aiden'),     ('aidan','plr-aiden'),         -- confirmed same kid
  ('caden','plr-caden'),     ('corey','plr-corey'),   ('felix','plr-felix'),
  ('foster','plr-foster'),   ('kellen','plr-kellen'), ('levi','plr-levi'),
  ('phoenix','plr-phoenix'), ('ryan','plr-ryan')
on conflict (alias) do nothing;
```

### 2.4 Backfill — two paths

**Path A — preserve the 119 events (default):**

```sql
update warriors.play_events e
set batter_player_id = a.player_id
from warriors.player_aliases a
where lower(btrim(e.batter)) = a.alias
  and e.batter_player_id is null;

-- Verify: must return zero rows for Outlaws batters
select distinct batter, count(*)
from warriors.play_events
where batter_player_id is null and batting_team = 'outlaws'
group by batter order by 2 desc;
```

Opponent batters stay unlinked by design — they're scouting data, not roster members.

**Path B — fresh start (Stuart said this is acceptable):** skip the play-events seed entirely,
run `001`–`003` only, and start logging into a clean schema. Costs the two 2026-05-24 games;
the local JSON copies remain as an archive. **Recommendation: take Path A.** It costs one
`UPDATE`, and Path A's backfill query *is* the test that the alias table is correct.

### 2.5 Application changes

| File | Change |
|---|---|
| `src/lib/coach/player-name.ts` | Replace hardcoded map with an async alias lookup + in-memory cache seeded from `warriors.player_aliases`. Keep a sync `canonicalPlayerName` fallback for client components. |
| `src/lib/coach/analytics.ts:98` | Key `playerMap` on `pin.batterPlayerId ?? canonicalPlayerName(pin.batter)` — **fixes B2** |
| `src/app/coach/stats/page.tsx` | Same, at both `:130` and `:142` — **fixes B3** |
| `src/app/coach/page.tsx` | Defense spot `<input>` → `<select>` over active roster + a "＋ new player" escape hatch — **fixes B4** |
| `src/lib/coach/defense.ts` | Assignments keyed by `player_id`, not name string — **fixes B5/B6 at the root** |

---

## 3. Supabase consolidation

### 3.1 Decision: consolidate into `tlgeedmgvjlpkrsekpqq` (`personal-apps`)

Neither source project survives. Reasons:

1. **Forced by the cap.** 3 active vs a 2-project limit means restoring either paused project
   requires pausing a live one. `personal-apps` is already active and already in the
   Buddy Apps org — using it consumes **zero additional slots**, permanently.
2. Both paused projects are **Vercel-marketplace-managed** (`org=vercel_icfg_…`). Those are
   tied to the Vercel integration lifecycle; `personal-apps` is a first-class project Stuart
   controls directly via PAT.
3. The Outlaws schema is the complex one (3 tables, FK chain, indexes, text PKs matching
   app-generated ids) and it already exists as a clean idempotent `schema.sql`. Re-creating
   it in a new schema is a paste. `tryout_signups` is one flat table.

### 3.2 Phase 0 — rescue the signups (blocking, needs a free slot)

`tryout_signups` is the only unbacked-up data in the system. To read it, one slot must be
freed. Options, cheapest first:

| Option | Cost | Note |
|---|---|---|
| **B. Upgrade to Pro** ⭐ | $25/mo | Removes the cap permanently, removes the auto-pause risk that caused this outage, **and lets the merged app keep a dedicated project — buying back the isolation boundary that §3.5 otherwise gives up.** Re-ranked to first for that last reason. |
| **A. Pause `tournament-finder` for ~20 min** | brief 500s on a live affiliate site | Cheapest one-time rescue if staying on free. Do it at low traffic (early AM ET). |
| **C. Delete a dead project** | free | `HOAInspector` / `SDbook` are INACTIVE in `swall3's Org` — **but deleting a paused project is irreversible and its data is unrecoverable.** Confirm they're truly dead first. |

Steps once a slot is free (`$PAT` = Supabase PAT, never echoed):

```bash
# 1. Restore the likelier Warriors candidate first
curl -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{}' https://api.supabase.com/v1/projects/hrisecaohwqybllffply/restore
# wait for status ACTIVE_HEALTHY (poll GET /v1/projects/{ref})

# 2. Identify it — this is the discriminating check, not a guess
curl -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"select table_name from information_schema.tables where table_schema='"'"'public'"'"'"}' \
  https://api.supabase.com/v1/projects/hrisecaohwqybllffply/database/query
#   tryout_signups                → this is Warriors.  <WARRIORS_REF> resolved.
#   teams/games/play_events       → this is Outlaws; re-pause and restore the other ref.
#   both                          → one shared project; consolidation is already half done.

# 3. Export everything before touching anything
curl -X POST -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"query":"select * from tryout_signups order by signed_up_at"}' \
  https://api.supabase.com/v1/projects/<WARRIORS_REF>/database/query \
  > backups/2026-09-18-tryout-signups.json

# 4. Verify in the SAME restored session — do NOT try to compare against the
#    admin UI, which reads this very DB and is down until the restore lands.
#    select count(*) from tryout_signups;   ← must equal the exported length
python3 -c "import json;print(len(json.load(open('backups/2026-09-18-tryout-signups.json'))))"

# 5. Re-pause to free the slot again
curl -X POST -H "Authorization: Bearer $PAT" \
  https://api.supabase.com/v1/projects/<WARRIORS_REF>/pause
```

Commit `backups/2026-09-18-tryout-signups.json` **and** a generated
`backups/2026-09-18-tryout-signups.sql` of `insert` statements. Do not proceed to Phase 1
until both exist and the count is verified.

### 3.3 Build the target schema

```sql
-- migrations/000_bootstrap.sql  (run against tlgeedmgvjlpkrsekpqq)
create schema if not exists warriors;

-- teams / games / play_events: copy verbatim from
-- outlaws-field-app/supabase/schema.sql lines 5-53, prefixing every table
-- name with warriors.  Keep text PKs — app-generated ids depend on them.

create table warriors.tryout_signups (
  id             uuid primary key default gen_random_uuid(),
  player_name    text not null,
  age            integer not null,
  parent_name    text not null,
  phone          text not null,
  email          text not null,
  position       text,
  experience     text,
  notes          text,
  signed_up_at   timestamptz not null default now(),
  -- new: tryout evaluation (Dugout Master feature, §6.4)
  evaluated_at   timestamptz,
  eval_scores    jsonb,        -- {hitting:1-5, fielding:1-5, throwing:1-5, running:1-5}
  eval_notes     text,
  player_id      text references warriors.players(id) on delete set null
);

-- RLS on everything; the service-role key bypasses it, anon gets nothing.
alter table warriors.teams          enable row level security;
alter table warriors.games          enable row level security;
alter table warriors.play_events    enable row level security;
alter table warriors.players        enable row level security;
alter table warriors.player_aliases enable row level security;
alter table warriors.tryout_signups enable row level security;
```

Then expose the schema to PostgREST:

```bash
curl -X PATCH -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d '{"db_schema":"public,warriors"}' \
  https://api.supabase.com/v1/projects/tlgeedmgvjlpkrsekpqq/config/postgrest
```

And pin the client to it in `src/lib/supabase.ts`:

```ts
cachedClient = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
  db:   { schema: "warriors" },        // ← add this
});
```

### 3.4 Load the data

1. Games/teams/events — from `outlaws-field-app/supabase/schema.sql` seed inserts
   (lines 61+), `s/^insert into /insert into warriors./`. **Local files are the source of
   truth; the paused Outlaws DB is never restored.**
2. Signups — from `backups/2026-09-18-tryout-signups.sql`.
3. Run `001`–`003` + the §2.4 backfill.
4. Verify — all five, as one checklist:
   - `teams=2, games=2, play_events=119, players=11, player_aliases=14`
   - `tryout_signups=<Phase 0 count>`
   - the §2.4 orphan query returns **zero rows** — this is the one check that proves the
     alias seed is complete, so run it here, not only in §2.4

### 3.5 Security tradeoff of consolidating into `personal-apps`

`personal-apps` also hosts **courtney-health** in its `public` schema. The
`SUPABASE_SERVICE_ROLE_KEY` set in §3.5 **bypasses RLS on every schema in the project**, not
just `warriors`. Deploying it to the `warriors-baseball` Vercel project means a key leak from
a public youth-sports marketing site reaches health records.

Outlaws previously had its own isolated project; this consolidation collapses that boundary.
It is forced by the free-tier cap, not chosen. Mitigations if staying on free:

- Keep the key server-only — never `NEXT_PUBLIC_*`. (Already true; `src/lib/supabase.ts`
  reads it only in server code. Enforce with a lint rule.)
- Mark it **Sensitive** in Vercel so it can't be read back from the dashboard or CLI.
- Consider a dedicated Postgres role scoped to the `warriors` schema with a custom JWT,
  instead of the project-wide service-role key. More work, and it restores most of the boundary.

**Cleanest fix is Option B in §3.2** — Pro removes the cap, so the merged app gets its own
project and the boundary is never collapsed. Flagged as Open Item §9.2.

### 3.6 Vercel env

Set manually on the `warriors-baseball` project (**do not** re-wire the Supabase Vercel
integration — it would create yet another project and re-trip the cap):

```
SUPABASE_URL=https://tlgeedmgvjlpkrsekpqq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<personal-apps service role key>
APP_PASSCODE=outlaws
```

`ADMIN_PASSWORD` is **removed** — `/admin` is gone, the coach passcode replaces it (§4).
Mark all three as Sensitive. Preview and Production both.

> ⚠️ That service-role key bypasses RLS across the **whole** `personal-apps` project,
> including courtney-health's data in `public`. Read §3.5 before setting it.

---

## 4. Auth model — invert the gate

Outlaws gates everything and allowlists exceptions. The merged app must do the opposite.

**Create `src/middleware.ts`** (does not exist on the branch):

```ts
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/coach/auth";

// Reachable without a cookie, inside the gated tree.
// ⚠️ manifest + sw MUST be here — see the PWA note below.
const OPEN = [
  "/coach/login", "/api/coach/login",
  "/coach/manifest.json", "/coach/sw.js",
];

// PWA + static assets served from under /coach. These must bypass the gate:
// a manifest that 307s can't be parsed (install becomes impossible), and a
// service-worker script that responds with a redirect is a hard registration
// failure per spec — so /coach/sw.js would never register, including on
// update after the 30-day cookie expires.
function isCoachAsset(pathname: string): boolean {
  if (pathname.startsWith("/coach/icons/")) return true;
  if (pathname.startsWith("/coach/images/")) return true;
  return /\.(png|jpg|jpeg|svg|ico|webp|woff2?|ttf|css)$/.test(pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN.includes(pathname) || isCoachAsset(pathname)) return NextResponse.next();

  const cookie   = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await expectedToken();          // null when APP_PASSCODE unset → fails closed
  if (expected && cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/coach/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Allow-by-default: the matcher itself is the allowlist inversion.
  matcher: ["/coach/:path*", "/api/coach/:path*"],
};
```

The win of the inversion is that **unmatched routes never enter the gate at all** — `/`,
`/roster`, `/schedule`, `/games/*`, `/api/signup` and every root-level asset are public with
no code path through auth, so they cannot be accidentally gated by a matcher edit. It is *not*
that the allowlist disappears: `isCoachAsset()` above is the same class of check as Outlaws'
`isPublic()`, just scoped to the `/coach` subtree instead of the whole app. Smaller surface,
same category of risk — keep it under test.

**The SW must stay at `/coach/sw.js`.** A service worker can only claim a scope at or below
its own path, so serving it from `/sw.js` would need a `Service-Worker-Allowed` header; the
`/coach/` path avoids that entirely.

**API routes must not rely on middleware alone.** Add a `requireCoach(req)` guard in
`src/lib/coach/auth.ts` and call it at the top of every `/api/coach/*` handler — defence in
depth if the matcher is ever edited.

**Fold `/admin` into the gate.** `src/app/admin/page.tsx` → `src/app/coach/tryouts/page.tsx`;
`src/app/api/signups/route.ts` → `src/app/api/coach/signups/route.ts`, switched from
`POST {password}` to `GET` behind the cookie. Delete the `ADMIN_PASSWORD` check and the env
var. Shipping without this leaves two parallel auth systems.

**Keep `auth.ts`'s fail-closed behaviour (B7).** Do not reintroduce the `"outlaws"` default.

---

## 5. PWA setup

> ⚠️ **The installed app on Stuart's phone will not migrate.** It is installed against
> `outlaws-field-app.vercel.app`; the merged app is a different origin with different
> localStorage. Plan for it explicitly:
>
> 1. Before cutover, open the installed PWA → **Export** on `/dashboard` (the markdown/CSV
>    export already exists) and save the current-game state, including any live
>    `defenseGroups`, which live **only in `localStorage` under `outlaws-field-app:v1`** and
>    have never been synced anywhere.
> 2. After cutover, install the coach PWA fresh from the new origin.
> 3. Keep the `outlaws-field-app` Vercel project deployed for ~30 days serving a redirect to
>    the new `/coach`, so the old icon doesn't dead-end. **Add that redirect path to the old
>    app's `PUBLIC_PREFIXES` in `outlaws-field-app/src/middleware.ts`** — otherwise its own
>    gate intercepts and sends users to the old login screen instead.

**Files:**

`public/manifest.json` (public) — keep, change `start_url` to `/`, `scope` stays `/`.
The current `start_url: "/games"` is wrong for a site whose front door is the homepage.

`public/coach/manifest.json` (new):

```json
{
  "name": "Warriors Coach", "short_name": "Coach", "id": "/coach",
  "start_url": "/coach", "scope": "/coach",
  "display": "standalone", "orientation": "portrait",
  "background_color": "#0f172a", "theme_color": "#0f172a",
  "icons": [
    { "src": "/coach/icons/outlaws-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/coach/icons/outlaws-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`src/app/coach/layout.tsx` (new) — a nested layout emitting
`metadata.manifest = "/coach/manifest.json"` plus `appleWebApp`, importing `coach.css`, and
rendering the ported `pwa-register.tsx` + `install-prompt.tsx`. The root layout keeps
`/manifest.json`. Nested metadata overrides cleanly in the App Router — this is why two
scopes on one origin works without conflict.

`public/coach/sw.js` — port `outlaws-field-app/public/sw.js`, register with
`{ scope: "/coach" }`. **Bump the cache name** (e.g. `warriors-coach-v1`); reusing the
Outlaws cache key against different asset paths serves stale 404s.

`src/app/coach/install-prompt.tsx` — change `DISMISS_KEY` from `"outlaws-install-dismissed"`
to `"warriors-coach-install-dismissed"`.

**Keep `next build --webpack`.** Both `package.json` files already set it. Per
`outlaws-field-app/next.config.ts`, the Turbopack production build in Next 16.2.6 emits a
broken shared client chunk → 500 → no hydration → dead buttons. This is a known live trap.

---

## 6. Feature integration order

Sequenced zero-risk → highest-risk. Each phase ends deployable.

### Phase 1 — Finish the port, invert auth, harden (no new features)

1. Port 8 pages `outlaws-field-app/src/app/*` → `src/app/coach/*` per the §1.1 map.
   Mechanical: rewrite `@/lib/*`→`@/lib/coach/*`, `@/components/*`→`@/components/coach/*`,
   internal `href`s to `/coach/*`, asset paths to `/coach/*`.
2. Port 5 API routes → `src/app/api/coach/*`. Swap `sbSelect/sbUpsert` imports from
   `@/lib/coach/supabase` to `@/lib/supabase` (the shim is already call-compatible).
3. Create `src/middleware.ts` (§4). Add `requireCoach()` guards.
4. Move `/admin` → `/coach/tryouts`; delete `ADMIN_PASSWORD`.
5. **Fix B1** in `src/lib/coach/local-db.ts`:
   ```ts
   if (isSupabaseEnabled()) {
     try { return await readDbFromSupabase(); }
     catch (e) { console.error("Supabase read failed, falling back to seed", e); }
   }
   ```
   Deploy this even if nothing else ships — it's what turns a paused DB from an outage into
   degraded-but-working.
6. Create `src/app/coach/layout.tsx` + both manifests + `/coach/sw.js` (§5).
7. Verify: `npm run build`, public pages render logged-out, `/coach/*` redirects to
   `/coach/login`, `/api/coach/games` returns 401 without a cookie, passcode `outlaws` works.

**Gate:** deployable. Public site unchanged for visitors; coach tools live behind the gate.

### Phase 2 — Data model unification

Migrations `000`–`003` + backfill (§2, §3.3–3.4), then the §2.5 app changes. Fixes B2, B3, B6.
Ship behind `NEXT_PUBLIC_FF_PLAYER_IDS` so old name-string aggregation stays one env flip away.

### Phase 3 — Defense rotation persistence (first real new capability)

The gap: `defenseGroups` + `inningDefenseGroup` exist and work, but live **only** in
`localStorage`. Lose the phone, lose the plan; the dashboard on a laptop sees nothing.

```sql
-- migrations/004_lineup_plans.sql
create table warriors.lineup_plans (
  id          text primary key,
  game_id     text references warriors.games(id) on delete cascade,
  team_id     text not null references warriors.teams(id),
  label       text not null default 'Game plan',
  format      text not null default 'coach_pitch' check (format in ('coach_pitch','kid_pitch')),
  batting_order jsonb not null default '[]'::jsonb,   -- [player_id, …]
  groups      jsonb not null default '{}'::jsonb,     -- {A1:{SS:player_id,…},…}
  inning_map  jsonb not null default '{}'::jsonb,     -- {1:'A1',2:'A2',…}
  updated_at  timestamptz not null default now()
);
create index idx_lineup_plans_game on warriors.lineup_plans(game_id);
```

`POST/GET /api/coach/lineup`. Client keeps localStorage as the offline write-ahead buffer and
syncs opportunistically — mirror `db-sync.ts`'s existing non-blocking pattern, where a failed
sync never blocks the live game flow. **Fixes B4** by switching the spot input to a roster
`<select>` at the same time.

### Phase 4 — Dugout Master features

Three of the four already have partial implementations. Scope accordingly:

| DM feature | What exists | Actual work |
|---|---|---|
| **Lineup builder by inning** | `defenseGroups`/`inningDefenseGroup` (localStorage), `defense.ts` constants | Phase 3 persists it. Remaining: a real grid UI at `/coach/lineup` — innings × positions, tap-to-assign, live conflict detection (same kid in two spots). |
| **Bench-time fairness** | `buildFairness()` renders at `dashboard/page.tsx:659`, counts innings benched | Promote from a read-only dashboard panel to a **live constraint** in the builder: flag any kid benched >1 consecutive inning or >N total, and add a "balance remaining innings" auto-suggest. |
| **Drill library** | Warriors `src/lib/gameData.ts` — 920 lines of real scenarios, already driving `/games/backup` + `/games/position` | Mostly a re-presentation: a coach-facing `/coach/drills` index over the same data, filtered by position/situation, plus practice-plan assembly. Do **not** rebuild the content. |
| **Tryout evaluation** | `tryout_signups` rows are the raw material | Genuinely new: `eval_scores`/`eval_notes` columns (already in §3.3), a 1–5 rubric UI on `/coach/tryouts`, ranked sort, CSV export, and "promote signup → player" writing `warriors.players` + linking `tryout_signups.player_id`. |

**Outlaws' moat stays untouched.** Pitch-level events (`GameEventV2`, `pitchOutcome`,
`countAfter`), `heatmap-canvas.tsx` (386 lines), `spray-chart.tsx`, and `field-geometry.ts`
have no Dugout Master equivalent. Nothing in Phase 4 modifies them.

### Phase 5 — Public site

`/roster` reading `warriors.players` (public, `active=true` only — names and numbers, **no
contact data**), `/schedule` from `warriors.games`. Optionally surface the Play & Learn
mastery stats coaches can see.

---

## 7. Risk mitigation

1. **Back up before anything.** Phase 0 is blocking. `tryout_signups` has zero copies; the
   other data has three. Verify row counts against the admin UI before proceeding.
2. **Never restore-then-migrate in one step.** Export → verify → re-pause → load into the
   target. Do not attempt a live DB-to-DB copy while the cap is in play.
3. **The local JSON files are the source of truth for game data.** `data/local-db.json`,
   `src/lib/seed-db.json`, and `schema.sql` agree byte-for-byte. Never reconcile against the
   paused Outlaws DB.
4. **Feature flags** for every new UI: `NEXT_PUBLIC_FF_PLAYER_IDS`, `NEXT_PUBLIC_FF_LINEUP_V2`,
   `NEXT_PUBLIC_FF_DRILLS`, `NEXT_PUBLIC_FF_TRYOUT_EVAL`. Default **off**; flip per-env in
   Vercel. The live-scoring screen is used during actual games — it must never regress.
5. **Commit the branch now.** Everything in `merge-outlaws-coach` is currently *uncommitted
   working-tree state* in a worktree. A stray `git checkout` loses the whole port. Commit
   before any further work.
6. **Migrations are numbered, idempotent, and forward-only.** `create ... if not exists`,
   `on conflict do nothing`. Keep them in `supabase/migrations/` and run via the Management
   API `POST /v1/projects/{ref}/database/query`.
7. **Don't cut over DNS/primary URL until a real game has been logged end-to-end** on the
   merged app against the new DB.
8. **Re-pausing risk.** Supabase free-tier auto-pauses after ~7 days idle — that is how this
   happened. `personal-apps` is active because daily-walk/courtney-health touch it. If the
   merged app becomes the only consumer during an off-season, it will pause again and B1's
   fallback becomes load-bearing. Pro ($25/mo) removes the risk entirely.
9. **Verify `next build --webpack` after every phase.** Turbopack prod builds are broken here.

---

## 8. Suggested subagent tasks (parallelizable)

Phase 1's port is wide and mechanical — good fan-out. Dependencies noted.

| # | Task | Depends on | Notes |
|---|---|---|---|
| **S1** | Port the 8 Outlaws pages → `src/app/coach/*`; rewrite imports, hrefs, asset paths. Do **not** change logic. | — | Largest task; `page.tsx` alone is 1674 lines. Split S1a (`page.tsx` + `game/[gameId]`) / S1b (`dashboard`, `intel`, `stats`) / S1c (`import`, `login`, `layout`) for 3-way parallelism. |
| **S2** | Port the 5 API routes → `src/app/api/coach/*`; swap to `@/lib/supabase`; add `requireCoach()`. | — | Independent of S1. |
| **S3** | Write `src/middleware.ts`, `requireCoach()`, move `/admin`→`/coach/tryouts`, delete `ADMIN_PASSWORD`. | S2 | |
| **S4** | PWA: `coach/layout.tsx`, both manifests, `/coach/sw.js` w/ new cache key, rename `DISMISS_KEY`. | S1c | |
| **S5** | Author `supabase/migrations/000`–`004` + the load script from local JSON. Dry-run against a scratch schema. | — | Fully independent — can start immediately, before Phase 0 resolves. |
| **S6** | Fix B1/B2/B3 (Supabase error fallback + the two raw-`batter` aggregation sites) with unit tests over `seed-db.json` asserting Jack+Jackson collapse to one row. | S1b | High value, small diff. |
| **S7** | Build `/coach/lineup` inning×position grid w/ conflict + bench-fairness constraints. | S1, Phase 3 API | Biggest new-UI task. |
| **S8** | Re-present `gameData.ts` as `/coach/drills`. | S1 | Read-only over existing data; zero risk. |
| **S9** | Tryout evaluation rubric UI + promote-to-player flow. | S3, S5 | |
| **S10** | Public `/roster` + `/schedule`. | S5 | Must exclude contact fields. |

**Serial, not delegated** — judgement calls that shouldn't be fanned out:
Phase 0 (the restore/export, which is irreversible and needs Stuart's slot decision), the
jersey-number↔name correlation in §2.3, and the final cutover.

---

## 9. Open items for Stuart

1. **Which slot to free** for the Phase 0 signup rescue — pause `tournament-finder` briefly,
   pay for Pro, or delete `HOAInspector`/`SDbook`. Nothing else can start until this is
   answered; it is the only true blocker.
2. **Free tier or Pro ($25/mo)?** This is a *security* decision, not just a cost one. On free,
   the merged app shares `personal-apps` with courtney-health and a service-role key on the
   public Warriors site has RLS-bypass reach into health data (§3.5). On Pro, the app gets its
   own project and that boundary holds. Accepting the free path means accepting shared blast
   radius — worth saying out loud rather than discovering later.
3. **Jersey-number → name mapping.** `#00 #3 #6 #11 #15 #18 #20 #22 #31 #41 #99` vs the 11
   names. Never correlated in the source.
4. **Repo/app name.** Plan assumes the `warriors-baseball` repo and Vercel project are kept
   as-is. Renaming is cosmetic and can happen any time after Phase 1.
5. **Roster scope.** Are the Outlaws and the Warriors 8U the same set of kids, or two teams
   in one app? `warriors.players.team_id` supports both, but the UI differs — a team switcher
   vs a single implicit team.
