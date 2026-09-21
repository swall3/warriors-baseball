#!/usr/bin/env node
// Applies a single SQL migration file via the Supabase Management API.
// Reads SUPABASE_MGMT_TOKEN from .env.local — never printed, never logged.
// Usage: node scripts/run-migration.mjs supabase/migrations/004_lineup_plans.sql

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PROJECT_REF = "omwqwwflvnunuvgidvwx"; // Outlaws-field0app — shared Warriors/Outlaws project

const migrationArg = process.argv[2];
if (!migrationArg) {
  console.error("Usage: node scripts/run-migration.mjs <path-to-migration.sql>");
  process.exit(1);
}
const migrationPath = path.resolve(root, migrationArg);
if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const envPath = path.join(root, ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(".env.local not found");
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, "utf8");
const match = envContent.match(/^SUPABASE_MGMT_TOKEN=(.*)$/m);
if (!match) {
  console.error("SUPABASE_MGMT_TOKEN not set in .env.local");
  process.exit(1);
}
let token = match[1].trim();
if (
  (token.startsWith('"') && token.endsWith('"')) ||
  (token.startsWith("'") && token.endsWith("'"))
) {
  token = token.slice(1, -1);
}

const sql = fs.readFileSync(migrationPath, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`Migration failed (HTTP ${res.status}):`, body);
  process.exitCode = 1;
} else {
  console.log(`Applied ${path.relative(root, migrationPath)} — HTTP ${res.status}`);
  console.log(body);
}
