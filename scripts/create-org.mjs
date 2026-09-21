#!/usr/bin/env node
// Provisions a new tenant — MULTI-TENANT-PLAN.md §3.5, phase MT-3.
//
// §3.5 is explicit that this is a SCRIPT and not a signup funnel:
//
//   "Deliberately not self-serve. Creating an org is a scripts/create-org.mjs
//    run by Stuart: insert organizations, insert an org_passcodes row (MT-3)
//    … insert the org's own teams row with kind='own'. Self-serve signup is a
//    §9.4 deferral — building a signup funnel for a product with zero paying
//    customers is the textbook wrong order."
//
// Usage:
//   node scripts/create-org.mjs --name "Talking Baseball" --slug talking-baseball \
//     --team "Talking Baseball 8U" [--short-name "Talking"] [--id org-xyz] \
//     [--role owner] [--passcode <value>] [--dry-run]
//
// Prints the generated passcode ONCE, on stdout, and never stores it: only
// sha256('ec-coach-auth:' || passcode) reaches the database, exactly as
// src/lib/coach/auth.ts hashes it. Redirect it to a gitignored file — do not
// paste it into a commit, an issue, or a chat message.
//
// The hash is computed with crypto.subtle and the identical salt string, so it
// cannot drift from the app's hashPasscode(). If that salt ever changes, this
// file changes with it or every provisioned passcode stops working.

import crypto from "node:crypto";
import { runSql, PROJECT_REF } from "./lib/sql.mjs";

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === "--name") out.name = next();
    else if (a === "--slug") out.slug = next();
    else if (a === "--short-name") out.shortName = next();
    else if (a === "--team") out.team = next();
    else if (a === "--id") out.id = next();
    else if (a === "--role") out.role = next();
    else if (a === "--label") out.label = next();
    else if (a === "--passcode") out.passcode = next();
    else if (a === "--dry-run") out.dryRun = true;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.name || !args.slug || !args.team) {
  console.error(
    "Usage: node scripts/create-org.mjs --name <org name> --slug <slug> --team <team name>\n" +
      "       [--short-name <label>] [--id <org-id>] [--role owner|coach|viewer]\n" +
      "       [--label <passcode label>] [--passcode <value>] [--dry-run]",
  );
  process.exit(1);
}

const slug = args.slug.trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(`--slug must be lowercase alphanumeric/hyphen: got ${JSON.stringify(args.slug)}`);
  process.exit(1);
}

const orgId = args.id || `org-${slug}`;
const teamId = `team-${slug}`;
const role = args.role || "owner";
if (!["owner", "coach", "viewer"].includes(role)) {
  console.error(`--role must be owner, coach or viewer: got ${role}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// the passcode
// ---------------------------------------------------------------------------
// Generated, not chosen, unless --passcode is given. A human-chosen demo
// passcode is how "demo123" ends up in a production table — and per §3.2's
// unique index this value is the ONLY thing standing between a stranger and a
// tenant's data until MT-5 brings real accounts.
//
// Alphabet excludes 0/O/1/I/l: this gets read aloud and typed on a phone in a
// dugout. 10 chars of a 31-char alphabet is ~49 bits, which is far past what a
// rate-limited login is worth attacking.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".replace("O", "");
function generatePasscode(length = 10) {
  const bytes = crypto.randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i += 1) {
    // Reject above the largest multiple of the alphabet size, so the modulo
    // does not bias the first few characters.
    const limit = 256 - (256 % ALPHABET.length);
    if (bytes[i] >= limit) continue;
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

const passcode = args.passcode || generatePasscode();

// Byte-identical to hashPasscode() in src/lib/coach/auth.ts:29-35 — same Web
// Crypto call, same salt, same hex encoding. Written out rather than imported
// because that module is TypeScript inside the Next app; the salt is repeated
// here and nowhere else, and the verification harness asserts the two agree.
const AUTH_SALT = "ec-coach-auth";
async function hashPasscode(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${AUTH_SALT}:${value}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const sha = await hashPasscode(passcode);

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
// One statement batch, so a failure part-way leaves nothing half-provisioned.
//
// `on conflict do nothing` throughout: re-running this with the same slug is a
// no-op rather than an error, which is what you want when the first attempt
// died on a network blip. The one thing it will NOT silently absorb is a
// passcode already in use by a different org — idx_org_passcodes_sha refuses
// that at insert time, which is §3.2's "a collision is a startup-time error,
// not a runtime ambiguity" doing its job.
//
// `branding` stays '{}' — MT-4 populates it, and seeding a guess now would
// destroy the no-op-visual-change test that proves MT-4's wiring (§7 MT-4.1).
//
// kind='own' marks the org's OWN team, as against the `opponent` rows the sync
// path creates by name. §2.3: an org has exactly one own team today.
function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const sql = `
insert into public.organizations (id, slug, name, short_name)
values (${sqlLiteral(orgId)}, ${sqlLiteral(slug)}, ${sqlLiteral(args.name)}, ${
  args.shortName ? sqlLiteral(args.shortName) : "null"
})
on conflict (id) do nothing;

insert into public.teams (id, org_id, name, normalized_name, kind)
values (${sqlLiteral(teamId)}, ${sqlLiteral(orgId)}, ${sqlLiteral(args.team)}, ${sqlLiteral(
  args.team.trim().toLowerCase(),
)}, 'own')
on conflict (id) do nothing;

insert into public.org_passcodes (org_id, passcode_sha, label, role)
values (${sqlLiteral(orgId)}, ${sqlLiteral(sha)}, ${sqlLiteral(args.label || "Coaches")}, ${sqlLiteral(role)})
on conflict (org_id, passcode_sha) do nothing;

select
  (select count(*) from public.organizations where id = ${sqlLiteral(orgId)})            as org_rows,
  (select count(*) from public.teams where org_id = ${sqlLiteral(orgId)})                as team_rows,
  (select count(*) from public.org_passcodes where org_id = ${sqlLiteral(orgId)} and active) as passcode_rows,
  (select count(*) from public.games where org_id = ${sqlLiteral(orgId)})                as game_rows,
  (select count(*) from public.players where org_id = ${sqlLiteral(orgId)})              as player_rows;
`;

if (args.dryRun) {
  console.log("--- DRY RUN: no statements executed ---");
  console.log(sql.replace(sha, "<passcode-sha>"));
  console.log(`org id:   ${orgId}`);
  console.log(`team id:  ${teamId}`);
  process.exit(0);
}

const rows = await runSql(sql);

console.log(`Provisioned on ${PROJECT_REF}:`);
console.log(`  org id:    ${orgId}`);
console.log(`  slug:      ${slug}`);
console.log(`  name:      ${args.name}`);
console.log(`  team id:   ${teamId}  (${args.team}, kind='own')`);
console.log(`  role:      ${role}`);
console.log(`  counts:    ${JSON.stringify(rows?.[0] ?? rows)}`);
console.log("");
console.log(`  PASSCODE:  ${passcode}`);
console.log("");
console.log("  ^ shown once and never stored — only its salted SHA-256 is in the database.");
console.log("    Put it somewhere gitignored. Do not commit it.");
