// Shared Supabase client for the whole app (Warriors' signup routes + the
// ported Outlaws coach routes under /api/coach). Standardizes on
// @supabase/supabase-js — Warriors' existing dependency and approach — rather
// than Outlaws' original raw-fetch PostgREST helpers.
//
// Env vars (server-only; never prefix with NEXT_PUBLIC_):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  return process.env[name] || "";
}

export function isSupabaseEnabled(): boolean {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

let cachedClient: SupabaseClient | null = null;

// Server-only client using the service-role key (bypasses RLS) — only ever
// call this from API routes / server code, never from client components.
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

// Select all rows from a table (tiny dataset; no pagination needed).
export async function sbSelectAll<T>(table: string, query = "select=*"): Promise<T[]> {
  const client = getSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder: any = client.from(table).select(extractSelect(query));
  builder = applyQueryString(builder, query);
  const { data, error } = await builder;
  if (error) throw new Error(`Supabase select ${table} failed: ${error.message}`);
  return (data ?? []) as T[];
}

// Upsert rows, resolving conflicts on the given unique column(s).
export async function sbUpsert<T>(table: string, rows: unknown[], onConflict: string): Promise<T[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any[], { onConflict })
    .select();
  if (error) throw new Error(`Supabase upsert ${table} failed: ${error.message}`);
  return (data ?? []) as T[];
}

// Delete rows matching a PostgREST filter (e.g. `game_id=eq.${id}`).
export async function sbDelete(table: string, filter: string): Promise<void> {
  const client = getSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder: any = client.from(table).delete();
  builder = applyQueryString(builder, filter);
  const { error } = await builder;
  if (error) throw new Error(`Supabase delete ${table} failed: ${error.message}`);
}

// Insert rows (no conflict resolution).
export async function sbInsert(table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await client.from(table).insert(rows as any[]);
  if (error) throw new Error(`Supabase insert ${table} failed: ${error.message}`);
}
