#!/usr/bin/env node
// Seeds the owner org's existing APP_PASSCODE into org_passcodes.
// MULTI-TENANT-PLAN.md §7 MT-3 step 1 ("seed Stuart's current APP_PASSCODE as
// org-outlaws's"), phase MT-3.
//
// WHY THIS IS A SCRIPT AND NOT PART OF MIGRATION 015
// --------------------------------------------------
// The live APP_PASSCODE is a Vercel environment variable. It is not in this
// repository, it is not in .env.local, and guessing it is not an option:
// MERGE-PLAN.md:471 records the OLD published default (`outlaws`), and seeding
// a hash of that would hand org-outlaws to anyone who reads the repository.
//
// A migration is also a committed artifact, and the salted SHA-256 of a short
// human-typed passcode does not belong in version control regardless of who
// knows the plaintext.
//
// So: run this yourself, with the real value in the environment. It reads the
// passcode, writes only the hash, and never prints or logs the passcode.
//
// Usage — pass it via the environment, never as an argument (argv is visible in
// `ps` to every user on the machine, and lands in shell history):
//
//   APP_PASSCODE='<the live value>' node scripts/seed-owner-passcode.mjs
//
// or put APP_PASSCODE in .env.local (gitignored) and run it with no env prefix.
//
// UNTIL THIS RUNS, NOTHING IS BROKEN. src/app/api/coach/login/route.ts still
// compares against APP_PASSCODE when no org_passcodes row matches, which is
// what makes MT-3 behaviour-identical for org-outlaws. Running this migrates
// that last env-var dependency into the table; the fallback can then be deleted.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runSql, ROOT, PROJECT_REF } from "./lib/sql.mjs";

const OWNER_ORG_ID = process.env.OWNER_ORG_ID || "org-outlaws";
const AUTH_SALT = "ec-coach-auth"; // must match src/lib/coach/auth.ts:19

function readPasscode() {
  if (process.env.APP_PASSCODE) return process.env.APP_PASSCODE;
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return null;
  const match = fs.readFileSync(envPath, "utf8").match(/^APP_PASSCODE=(.*)$/m);
  if (!match) return null;
  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value || null;
}

const passcode = readPasscode();
if (!passcode) {
  console.error(
    "APP_PASSCODE is not set (checked the environment and .env.local).\n" +
      "Run: APP_PASSCODE='<the live value>' node scripts/seed-owner-passcode.mjs",
  );
  process.exit(1);
}

// Identical to hashPasscode() in src/lib/coach/auth.ts:29-35.
const digest = await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(`${AUTH_SALT}:${passcode}`),
);
const sha = Array.from(new Uint8Array(digest))
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// If this passcode is already registered to a DIFFERENT org, the partial unique
// index refuses the insert and this errors out — which is the correct outcome
// and the reason §3.2 wanted that index. Do not add an ON CONFLICT that swallows
// it.
const rows = await runSql(`
insert into public.org_passcodes (org_id, passcode_sha, label, role)
values (${sqlLiteral(OWNER_ORG_ID)}, ${sqlLiteral(sha)}, 'Coaches (APP_PASSCODE)', 'owner')
on conflict (org_id, passcode_sha) do update set active = true;

select org_id, label, role, active, created_at
from public.org_passcodes
where org_id = ${sqlLiteral(OWNER_ORG_ID)};
`);

console.log(`Seeded ${OWNER_ORG_ID}'s passcode on ${PROJECT_REF} (hash only).`);
console.log(JSON.stringify(rows, null, 1));
console.log("\nVerify by logging in with the same passcode, then delete the");
console.log("APP_PASSCODE fallback in src/app/api/coach/login/route.ts.");
