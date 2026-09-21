// Shared Supabase client for the whole app (Warriors' signup routes + the
// ported Outlaws coach routes under /api/coach). Standardizes on
// @supabase/supabase-js — Warriors' existing dependency and approach — rather
// than Outlaws' original raw-fetch PostgREST helpers.
//
// Env vars (server-only; never prefix with NEXT_PUBLIC_):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   — the coach app. Bypasses RLS (T2).
//   SUPABASE_ANON_KEY           — the public tryout form only. RLS applies.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_ANON_KEY"): string {
  return process.env[name] || "";
}

export function isSupabaseEnabled(): boolean {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

let cachedClient: SupabaseClient | null = null;

// Server-only client using the service-role key (bypasses RLS) — only ever
// call this from API routes / server code, never from client components.
//
// ⚠️ This is defect T2 and it is still here on purpose. service_role carries
// BYPASSRLS, so every one of migration 013's tenant_isolation policies is
// inert on this connection. MT-2 does not fix that; §3.4 Stage B does, in
// MT-3, by minting a per-request JWT against the anon key. What MT-2 does
// instead is make the org scope MANDATORY at the four functions below, so that
// there is no path to the database that can accidentally forget it — honest
// app-layer filtering, labelled as such.
//
// After Stage C the service-role key survives in exactly two places, both
// correct and both outside the request path: scripts/run-migration.mjs and
// cross-tenant admin operations like org creation (§3.5).
export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseEnabled()) throw new Error("Supabase is not configured");
  if (!cachedClient) {
    cachedClient = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  }
  return cachedClient;
}

// ---------------------------------------------------------------------------
// The public client — MULTI-TENANT-PLAN §3.4 closing note, §5.2
// ---------------------------------------------------------------------------
// One caller: src/app/api/signup/route.ts, the public tryout form. It does a
// single INSERT and has no business holding a key that can read every row of
// every table.
//
// This is the ONLY request path in MT-2 where RLS actually enforces anything,
// which makes it the only place §2.5's policy design can be proven correct
// before MT-3's JWT plumbing exists. Migration 013's `public_signup_insert`
// grants anon INSERT on tryout_signups where org_id = 'org-outlaws', and
// nothing else — no select, no other table. The public site's blast radius
// becomes one insert instead of the entire database.
//
// (Supabase grants anon full CRUD on every table in `public` by default —
// verified against this project. RLS is the whole of the protection, which is
// why the policy has to be right and why scripts/verify-mt2.mjs tests it in
// both directions rather than only checking that the deny fires.)

let cachedPublicClient: SupabaseClient | null = null;
let warnedAboutAnonFallback = false;

export function isPublicSupabaseEnabled(): boolean {
  return Boolean(env("SUPABASE_URL") && (env("SUPABASE_ANON_KEY") || env("SUPABASE_SERVICE_ROLE_KEY")));
}

// True when the public route is genuinely running under RLS rather than on the
// service-role fallback below. Exported so a health check — or a human reading
// logs — can tell the two apart without guessing from behaviour.
export function isPublicSupabaseUsingAnonKey(): boolean {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_ANON_KEY"));
}

// ⚠️ FALLS BACK TO SERVICE-ROLE WHEN SUPABASE_ANON_KEY IS UNSET, and that is a
// deliberate, temporary compromise rather than an oversight.
//
// SUPABASE_ANON_KEY is a new env var as of this commit. It is not yet set in
// Vercel, and setting it is Stuart's action, not this branch's. If this
// function threw instead, the first deploy carrying it would turn the public
// tryout signup form — the marketing site's entire purpose — into a 500 for
// every parent who filled it in, and MULTI-TENANT-PLAN's MT-2 gate is
// explicitly "behaviour-identical for Stuart".
//
// The cost of the fallback is precise and worth stating so nobody reads more
// safety into this commit than it delivers: until SUPABASE_ANON_KEY is set in
// the deployment environment, the signup route still holds a BYPASSRLS key and
// public_signup_insert is still inert IN PRODUCTION. The policy being proven
// correct (which verify-mt2.mjs does, against the real database) and the route
// being protected by it are two different claims, and only the first is true
// today.
//
// REMOVE THIS FALLBACK once the env var is set — at which point a missing anon
// key should be a hard failure, the same way isSupabaseEnabled() already
// fails closed.
export function getPublicSupabaseClient(): SupabaseClient {
  const url = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!url) throw new Error("Supabase is not configured");

  if (!anonKey) {
    if (!warnedAboutAnonFallback) {
      warnedAboutAnonFallback = true;
      console.warn(
        "[supabase] SUPABASE_ANON_KEY is not set — the public signup route is " +
          "falling back to the service-role key, so the public_signup_insert RLS " +
          "policy is NOT enforcing anything. Set SUPABASE_ANON_KEY to close this.",
      );
    }
    return getSupabaseClient();
  }

  if (!cachedPublicClient) {
    cachedPublicClient = createClient(url, anonKey, { auth: { persistSession: false } });
  }
  return cachedPublicClient;
}

// ---------------------------------------------------------------------------
// Thin wrappers reproducing the Outlaws app's original PostgREST helper
// signatures (sbSelectAll/sbUpsert/sbDelete/sbInsert), now backed by
// @supabase/supabase-js instead of raw fetch. Kept call-compatible so the
// ~10 Outlaws call sites (src/lib/coach/local-db.ts, src/app/api/coach/**)
// didn't need individual rewrites during the /coach merge.
//
// These only support the small set of PostgREST query-string forms the
// Outlaws code actually used: `select=cols`, `order=col.dir`, and
// `col=eq.value` filters. That's a deliberate scope limit, not a general
// PostgREST-query emulator — extend it if a new call site needs another
// operator (e.g. `gt.`, `in.`).
// ---------------------------------------------------------------------------

function extractSelect(query: string): string {
  for (const part of query.split("&")) {
    if (part.startsWith("select=")) return decodeURIComponent(part.slice("select=".length)) || "*";
  }
  return "*";
}

// Applies every `key=op.value` / `order=col.dir` pair in a PostgREST-style
// query string to a supabase-js filter builder, skipping the `select=` pair
// (the caller already applied that via .select()).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyQueryString(builder: any, query: string) {
  for (const part of query.split("&")) {
    if (!part || part.startsWith("select=")) continue;
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex);
    const rawValue = decodeURIComponent(part.slice(eqIndex + 1));

    if (key === "order") {
      const dot = rawValue.lastIndexOf(".");
      const column = dot === -1 ? rawValue : rawValue.slice(0, dot);
      const direction = dot === -1 ? "asc" : rawValue.slice(dot + 1);
      builder = builder.order(column, { ascending: direction !== "desc" });
      continue;
    }

    const dot = rawValue.indexOf(".");
    const op = dot === -1 ? "eq" : rawValue.slice(0, dot);
    const value = dot === -1 ? rawValue : rawValue.slice(dot + 1);
    if (typeof builder[op] === "function") {
      builder = builder[op](key, value);
    }
  }
  return builder;
}

// ---------------------------------------------------------------------------
// The mandatory org scope — MULTI-TENANT-PLAN §3.4 Stage A
// ---------------------------------------------------------------------------
// All of this app's Supabase traffic funnels through the four functions below.
// Each now takes an OrgScope in ARGUMENT POSITION 1 — first, and not optional.
//
// Position 1 rather than a trailing optional parameter is the entire design.
// An optional scope would let every existing call site keep compiling while
// silently querying across tenants; a required first argument makes the
// TypeScript compiler enumerate the work and refuse to build until every one
// is handled. The type checker is doing the audit, not a grep and not a
// reviewer's attention.
//
// Reads get `org_id = <scope.orgId>` appended. Writes get org_id STAMPED onto
// every row, overriding anything the caller put there — a caller cannot write
// into another tenant even by passing an explicit org_id, because the stamp
// goes on last.
//
// ⚠️ This is APP-LAYER filtering and is labelled as such. The connection still
// holds a BYPASSRLS service-role key (T2), so Postgres is not the enforcement
// boundary in MT-2; §3.4 Stage B makes it one in MT-3. The honest value of
// this layer is that it is unbypassable BY ACCIDENT: there is no code path to
// the database that does not pass through here.
//
// ⚠️ SCOPE: these four functions serve TENANT-SCOPED tables — the seven that
// carry an org_id column. `organizations` and `org_members` do not (they are
// keyed by `id` and `(org_id, user_id)`), so they must not be queried through
// this shim; org provisioning is a script, by decision (§3.5).

export type OrgScope = { orgId: string };

// A missing scope is a thrown error, never a default (T6). The distinction
// matters: DEFAULT_TEAM_ID's silent fallback is the defect T6 names, and
// re-creating it one layer down — `scope?.orgId ?? OWNER_ORG_ID` — would
// reintroduce exactly the bug this phase removes, in the one place nothing
// downstream could catch it.
function scopeOf(scope: OrgScope, table: string, op: string): string {
  const orgId = scope?.orgId;
  if (typeof orgId !== "string" || !orgId) {
    throw new Error(`Supabase ${op} ${table} refused: missing org scope`);
  }
  return orgId;
}

// Stamps org_id onto every row being written, last, so it wins over any
// org_id the caller supplied.
function stamp(rows: unknown[], orgId: string): Record<string, unknown>[] {
  return rows.map((row) => ({ ...(row as Record<string, unknown>), org_id: orgId }));
}

// Select all rows from a table (tiny dataset; no pagination needed).
export async function sbSelectAll<T>(
  scope: OrgScope,
  table: string,
  query = "select=*",
): Promise<T[]> {
  const orgId = scopeOf(scope, table, "select");
  const client = getSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder: any = client.from(table).select(extractSelect(query));
  builder = applyQueryString(builder, query);
  // Applied on the builder rather than concatenated into `query`: the org id
  // then never passes through applyQueryString's `op.value` splitting, so an
  // org id containing a '.' could not be mis-parsed into an operator.
  builder = builder.eq("org_id", orgId);
  const { data, error } = await builder;
  if (error) throw new Error(`Supabase select ${table} failed: ${error.message}`);
  return (data ?? []) as T[];
}

// Upsert rows, resolving conflicts on the given unique column(s).
//
// ⚠️ `onConflict` must name an ORG-SCOPED unique for any tenant table — for
// `games` that is "org_id,client_game_id", rebuilt by migration 011. Naming a
// bare column that is unique only globally would have Postgres resolve the
// conflict across tenants, and no amount of filtering here would catch it: a
// WHERE clause has no bearing on which row ON CONFLICT chooses. That is the
// argument in 011's section 3, restated at the call site that depends on it.
export async function sbUpsert<T>(
  scope: OrgScope,
  table: string,
  rows: unknown[],
  onConflict: string,
): Promise<T[]> {
  const orgId = scopeOf(scope, table, "upsert");
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(table)
    .upsert(stamp(rows, orgId), { onConflict })
    .select();
  if (error) throw new Error(`Supabase upsert ${table} failed: ${error.message}`);
  return (data ?? []) as T[];
}

// Delete rows matching a PostgREST filter (e.g. `game_id=eq.${id}`).
export async function sbDelete(scope: OrgScope, table: string, filter: string): Promise<void> {
  const orgId = scopeOf(scope, table, "delete");
  const client = getSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder: any = client.from(table).delete();
  builder = applyQueryString(builder, filter);
  builder = builder.eq("org_id", orgId);
  const { error } = await builder;
  if (error) throw new Error(`Supabase delete ${table} failed: ${error.message}`);
}

// Insert rows (no conflict resolution).
export async function sbInsert(scope: OrgScope, table: string, rows: unknown[]): Promise<void> {
  const orgId = scopeOf(scope, table, "insert");
  if (rows.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from(table).insert(stamp(rows, orgId));
  if (error) throw new Error(`Supabase insert ${table} failed: ${error.message}`);
}
