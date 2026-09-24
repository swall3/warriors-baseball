// Read-only Phase-1 migration preflight for InningWise prod.
// Runs each query in docs/runbooks/2026-09-24-migration-repair.sql via the
// Supabase Management API. Requires SUPABASE_KEY (Management API PAT) in env.
const REF = "omwqwwflvnunuvgidvwx";
const KEY = process.env.SUPABASE_KEY;
if (!KEY) {
  console.error("SUPABASE_KEY not set in env");
  process.exit(2);
}

async function q(label, sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await r.text();
  console.log(`\n===== ${label} (HTTP ${r.status}) =====`);
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
}

const QUERIES = [
  [
    "1. recorded migration history",
    "select version, name from supabase_migrations.schema_migrations order by version;",
  ],
  [
    "2a. schema_migrations table shape",
    "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position;",
  ],
  [
    "2b. last 5 history rows",
    "select * from supabase_migrations.schema_migrations order by version desc limit 5;",
  ],
  ["3. postgres version", "select version();"],
  [
    "4a. practice_plans table + new cols present?",
    "select to_regclass('public.practice_plans')::text as practice_plans_table, (select count(*) from information_schema.columns where table_schema='public' and table_name='practice_plans' and column_name in ('source_game_id','recommendation_context')) as new_cols_present_count;",
  ],
  [
    "4b. FK targets: live_games/teams PK|unique on (org_id,id)",
    "select conrelid::regclass::text as tbl, conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid in ('public.live_games'::regclass,'public.teams'::regclass) and contype in ('p','u') order by tbl, conname;",
  ],
  [
    "4b2. practice_plans has org_id column?",
    "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='practice_plans' and column_name='org_id';",
  ],
  [
    "4c. organizations PK",
    "select conname, contype from pg_constraint where conrelid='public.organizations'::regclass and contype='p';",
  ],
  [
    "4d. custom_practice_drills table (expect null)",
    "select to_regclass('public.custom_practice_drills')::text as custom_practice_drills_table;",
  ],
  [
    "5a. game_progress columns",
    "select column_name, data_type, column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='game_progress' order by ordinal_position;",
  ],
  [
    "5b. game_progress constraints",
    "select conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.game_progress'::regclass order by contype, conname;",
  ],
  [
    "5c. game_progress index",
    "select indexname, indexdef from pg_indexes where schemaname='public' and tablename='game_progress';",
  ],
  [
    "5d. game_progress RLS + grants",
    "select relrowsecurity from pg_class where oid='public.game_progress'::regclass;",
  ],
  [
    "5d2. game_progress grants",
    "select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='game_progress' order by grantee, privilege_type;",
  ],
  [
    "6. recent_attempts present (atomic_game_progress ran)?",
    "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='game_progress' and column_name='recent_attempts') as recent_attempts_present;",
  ],
];

for (const [label, sql] of QUERIES) {
  await q(label, sql);
}
console.log("\n===== PREFLIGHT COMPLETE =====");
