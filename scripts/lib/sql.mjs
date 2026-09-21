// Shared Supabase Management-API SQL runner.
//
// Extracted from scripts/run-migration.mjs so the verification harnesses
// (scripts/verify-mt2.mjs) can run ad-hoc queries against the same project
// with the same credential handling. The token is read from .env.local, is
// never printed, and is never passed on a command line.
//
// The Management API's /database/query endpoint runs the whole body as one
// statement batch and returns the LAST statement's rows as JSON.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

export const PROJECT_REF = "omwqwwflvnunuvgidvwx"; // shared Warriors/Outlaws project

let cachedToken = null;

export function readMgmtToken() {
  if (cachedToken) return cachedToken;
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) throw new Error(".env.local not found");
  const match = fs.readFileSync(envPath, "utf8").match(/^SUPABASE_MGMT_TOKEN=(.*)$/m);
  if (!match) throw new Error("SUPABASE_MGMT_TOKEN not set in .env.local");
  let token = match[1].trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1);
  }
  cachedToken = token;
  return token;
}

// Runs SQL and returns the parsed response body. Throws on a non-2xx, with
// the API's own error text — which is what makes a failed RLS check legible
// (e.g. `new row violates row-level security policy`).
export async function runSql(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readMgmtToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`SQL failed (HTTP ${res.status}): ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Same as runSql but never throws: returns { ok, rows } or { ok:false, error }.
// Used by the negative tests, where the *failure* is the passing outcome.
export async function trySql(sql) {
  try {
    return { ok: true, rows: await runSql(sql) };
  } catch (e) {
    return { ok: false, error: e.body || e.message };
  }
}
