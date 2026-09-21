// Contrast audit for the /coach ("Field") surface.
//
//   node scripts/contrast-audit.mjs [passcode]
//
// The light theme exists so the tool is legible outdoors in direct sun, so the
// bar is DESIGN.md's ~7:1 for primary text rather than WCAG AA's 4.5:1 —
// glare eats effective contrast. This walks the rendered DOM of every coach
// screen, computes contrast for each text node against its painted background,
// and reports anything that would be hard to read at a fence.
//
// Elements drawn over the baseball field graphic are exempt: the field stays
// green by design (DESIGN.md §5.8), so its chrome is deliberately
// light-on-dark and is measured against the field, which this script cannot
// see through the canvas. Those are listed separately, not failed.
import { chromium } from "/home/swall/.local/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs";

const PASSCODE = process.argv[2] || process.env.APP_PASSCODE;
const BASE = process.env.BASE || "http://127.0.0.1:3010";
const PAGES = ["/coach/login", "/coach/dashboard", "/coach/lineup", "/coach", "/coach/stats", "/coach/intel", "/coach/import"];

const AUDIT = () => {
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  // Walk up the tree compositing backgrounds until we hit an opaque one.
  const bgOf = (el) => {
    let acc = null;
    for (let n = el; n && n !== document.documentElement.parentNode; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a === 0) continue;
      if (!acc) acc = { rgb: c.rgb.slice(), a: c.a };
      else acc = { rgb: acc.rgb.map((v, i) => v * acc.a + c.rgb[i] * (1 - acc.a)), a: acc.a + c.a * (1 - acc.a) };
      if (acc.a >= 0.99) break;
    }
    return acc ? acc.rgb : [255, 255, 255];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const txt = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    // Over the field graphic? (canvas sibling or the photo container)
    const overField = !!el.closest(".baseball-field-canvas, .dugout-theme .relative:has(canvas)") ||
      !!el.closest("[class*='absolute']") && !!el.closest("div:has(> canvas)");
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 600;
    const large = px >= 24 || (px >= 18.66 && bold);
    out.push({
      text: txt.slice(0, 44), ratio: +ratio(fg.rgb, bgOf(el)).toFixed(2),
      px: +px.toFixed(1), large, overField,
      fg: cs.color, bg: `rgb(${bgOf(el).map(Math.round).join(",")})`,
    });
  }
  return out;
};

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 } });
const page = await ctx.newPage();

// authenticate
await page.goto(`${BASE}/coach/login`, { waitUntil: "networkidle" });
const pass = page.locator('input[type="password"]');
await pass.click();
await pass.pressSequentially(PASSCODE, { delay: 20 });
await page.waitForFunction(() => { const b = document.querySelector('button[type="submit"]'); return b && !b.disabled; });
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("/coach/login"));

let worst = [];
for (const path of PAGES) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const rows = await page.evaluate(AUDIT);
  const onPage = rows.filter((r) => !r.overField);
  // DESIGN.md target: ~7:1 primary. Treat <4.5 (or <3 for large) as a failure,
  // and 4.5-7 as below the sunlight target but not broken.
  const fail = onPage.filter((r) => (r.large ? r.ratio < 3 : r.ratio < 4.5));
  const soft = onPage.filter((r) => !(r.large ? r.ratio < 3 : r.ratio < 4.5) && r.ratio < 7);
  console.log(`${path.padEnd(18)} nodes=${String(onPage.length).padStart(4)}  FAIL=${String(fail.length).padStart(3)}  below-7:1=${String(soft.length).padStart(3)}  overField(exempt)=${rows.length - onPage.length}`);
  for (const f of fail.slice(0, 8)) {
    console.log(`    FAIL ${String(f.ratio).padStart(5)}:1  ${f.px}px  "${f.text}"  ${f.fg} on ${f.bg}`);
  }
  worst = worst.concat(fail);
}
console.log(`\nTOTAL hard failures: ${worst.length}`);
await browser.close();
