// Screenshot harness for the /coach light-theme pass and branding config.
// Not part of the app build — a local verification tool.
//
//   node scripts/shots.mjs <outDir> [passcode]
//
// Drives a real browser through the real /coach/login form, so it doubles as
// the end-to-end check that the passcode flow still works after a theme change.
import { chromium } from "/home/swall/.local/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2];
const PASSCODE = process.argv[3] || process.env.APP_PASSCODE;
const BASE = process.env.BASE || "http://127.0.0.1:3010";
if (!OUT) throw new Error("usage: node scripts/shots.mjs <outDir> [passcode]");
mkdirSync(OUT, { recursive: true });

// Public pages first — no cookie needed. These prove the public surfaces are
// visually untouched by this work.
const PUBLIC = [
  ["public-home", "/"],
  ["public-games", "/games"],
  ["public-games-position", "/games/position"],
];

// Gated pages, reached only after the login form succeeds.
const COACH = [
  ["coach-dashboard", "/coach/dashboard"],
  ["coach-lineup", "/coach/lineup"],
  ["coach-live", "/coach"],
  ["coach-stats", "/coach/stats"],
  ["coach-intel", "/coach/intel"],
  ["coach-import", "/coach/import"],
];

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
// Phone-sized: this tool is used one-handed at a fence, so that's the viewport
// that actually matters for the sunlight-readability pass.
const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

async function shot(name, path) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ${name.padEnd(24)} ${path}  ->  ${page.url().replace(BASE, "")}`);
}

console.log("public:");
for (const [name, path] of PUBLIC) await shot(name, path);

// --- the login flow, exercised as a user would ---
console.log("login flow:");
await page.goto(`${BASE}/coach/dashboard`, { waitUntil: "networkidle" });
const redirected = page.url().includes("/coach/login");
console.log(`  gate redirects unauthenticated /coach/dashboard -> login: ${redirected}`);
if (!redirected) throw new Error("GATE FAILED: /coach/dashboard reachable without a passcode");
await page.screenshot({ path: `${OUT}/coach-login.png`, fullPage: true });

// Type rather than fill, and wait for the submit button to leave its disabled
// state — that transition is driven by React, so it also proves hydration.
const pass = page.locator('input[type="password"]');
await pass.waitFor({ state: "visible" });
await pass.click();
await pass.pressSequentially(PASSCODE, { delay: 25 });
const submit = page.locator('button[type="submit"]');
await submit.waitFor({ state: "visible" });
await page.waitForFunction(
  () => { const b = document.querySelector('button[type="submit"]'); return b && !b.disabled; },
  null, { timeout: 20000 },
);
await page.screenshot({ path: `${OUT}/coach-login-filled.png`, fullPage: true });
await submit.click();
await page.waitForURL((u) => !u.pathname.includes("/coach/login"), { timeout: 20000 });
await page.waitForLoadState("networkidle");
console.log(`  after submit -> ${page.url().replace(BASE, "")}`);
if (page.url().includes("/coach/login")) throw new Error("LOGIN FAILED: still on login page");
const landedDashboard = page.url().includes("/coach/dashboard");
console.log(`  landed on the originally-requested /coach/dashboard: ${landedDashboard}`);

console.log("coach (authenticated):");
for (const [name, path] of COACH) await shot(name, path);

// Navigating dashboard -> lineup by clicking, not by URL, per the brief.
await page.goto(`${BASE}/coach/dashboard`, { waitUntil: "networkidle" });
const lineupLink = page.locator('a[href="/coach/lineup"]').first();
const canClick = (await lineupLink.count()) > 0;
if (canClick) {
  await lineupLink.click();
  // App Router navigations are client-side: the URL changes without a load
  // event, so waiting on "networkidle" here reports the old URL.
  await page.waitForURL((u) => u.pathname === "/coach/lineup", { timeout: 15000 });
  const heading = await page.locator("h1").first().textContent();
  console.log(`  clicked dashboard lineup link -> ${page.url().replace(BASE, "")} ("${heading?.trim()}")`);
} else {
  console.log("  NOTE: no a[href=/coach/lineup] on the dashboard");
}

console.log(errors.length ? `\nJS errors (${errors.length}):` : "\nno JS errors");
for (const e of [...new Set(errors)].slice(0, 12)) console.log("  " + e);

await browser.close();
