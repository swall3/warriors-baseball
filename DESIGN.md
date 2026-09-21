# Warriors + Outlaws — UX & Visual Design Direction

**Branch:** `merge-outlaws-coach`
**Written:** 2026-09-18
**Status:** Spec. Nothing in here has been implemented yet.

This document governs the merged app: the public **Warriors** site, the kids' **Play & Learn**
games hub, and the ported **Outlaws coach field tool**. It was written against the actual code in
this worktree, not against a wishlist — every "current state" claim below cites a file.

---

## 0. Read this first — blockers, contradictions, and gaps

Ranked. The first three block the merge from shipping at all.

### BLOCKER-1 — `/coach` is currently unauthenticated, and it will hold PII about minors

`outlaws-field-app/src/middleware.ts` gates the entire Outlaws app behind a passcode cookie.
**That file was not ported.** This worktree has `src/lib/coach/auth.ts` (43 lines, and it's a
genuinely improved version — it fails *closed* when `APP_PASSCODE` is unset, where the original
defaulted to the literal string `"outlaws"`), but there is no middleware, no `/coach/login` page,
and `src/app/api/coach/` is an **empty directory**.

As soon as coach pages land, `/coach/*` is publicly reachable from a marketing domain that parents
are being told to visit. Spray charts leaking is survivable. **Tryout evaluations are not** — this
spec asks you to build subjective written assessments of named 8-year-olds ("coachability," arm
strength rankings). That cannot sit on an open URL.

**Rule: `/coach` ships behind middleware or it does not ship.**

Port `middleware.ts` + `/login` + `/api/login` — but with one mandatory change. The original
matcher gates *everything*:

```ts
matcher: ["/((?!_next/static|_next/image).*)"]   // outlaws — gates the whole app
```

In the merged app that would put a passcode wall in front of the public Warriors site. Narrow it:

```ts
export const config = { matcher: ["/coach/:path*", "/api/coach/:path*"] };
```

Keep the allowlist for `/coach/login`, `/api/coach/login`, `/coach.webmanifest`, `/coach/sw.js`.

### BLOCKER-2 — offline capability was dropped in the port

`outlaws-field-app` ships `public/sw.js`, `public/manifest.webmanifest`,
`src/app/pwa-register.tsx`, and `src/app/install-prompt.tsx`. **None of the four are in this
worktree.** The field tool is the single surface that genuinely needs offline — ballparks have
no signal — so merging as-is is a functional downgrade of the app's core use case.

### BLOCKER-3 — `src/app/api/coach/` is empty while client code posts to it

`src/lib/coach/db-sync.ts` calls `syncGameToDatabase()`, which posts to a `/api/coach/...`
endpoint that does not exist. Every game-save will fail, and the current error path returns
`{ok: false}` that the UI reports as *"Saved locally. Database sync is disabled…"* — the wrong
message for a 404. Coaches would believe the game was fine and lose it. Port the routes, and make
the failure copy distinguish *disabled* from *failed*.

### DECISION-1 — the coach theme is dark; the requirement is light

`src/app/coach/coach.css` sets `--bg-primary: #0f172a` and a full dark palette. The stated
requirement is the opposite, for a concrete reason: direct sunlight turns a dark phone screen into
a mirror.

The good news is that whoever did the port **scoped the whole thing under `.coach-theme`** with an
explicit comment warning against bare `body`/`:root` rules. That scoping is the lever — the change
is contained to one stylesheet instead of 1,674 lines of JSX.

**But do not read that as "swap 20 lines of tokens."** `coach.css` is 395 lines; the token block is
about 20 of them. The other ~375 are nested *inside* `.coach-theme` and carry dark-theme assumptions
that will look broken on light no matter what the tokens say:

- `.baseball-field` — `box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 100px rgba(59,130,246,0.1)`.
  That second value is a **blue glow**. DECISION-2's glow ban has a violation sitting in the coach
  app too, not just the games hub. Delete it; on light, replace the drop shadow with a 1px border.
- `.glass` — `rgba(30,41,59,0.8)` + `backdrop-filter: blur(12px)`. Frosted dark panels have no light
  equivalent. These become plain `--d-surface` cards with `--d-line` borders.
- The nested `h1–h6` / `p` rules set `color: var(--text-secondary)`, a token the new set doesn't
  provide. Rename tokens without rewriting these and you get unstyled text.

Estimate it as **"rewrite `coach.css`"**, not "retint it" — tokens plus a line-by-line audit of every
nested rule for dark-theme assumptions. Estimated as an afternoon, this lands as a week.

**Explicit exemption:** `.field-fair-wedge` uses `clip-path: polygon(...)`, and the design principles
ban diagonal clip-paths. That ban is about decorative section dividers. Here the clip-path is
*geometry* — it's what makes fair territory a 90° fan from home plate. **Keep it.** Do not "fix" it.

**This changes the rollout order.** Port the coach pages with light tokens *already in place*.
Porting dark and restyling later means touching every `page.tsx` twice.

### DECISION-2 — the games hub violates design principles Stuart set personally

`src/app/games/page.tsx` + `globals.css` currently ship:

| Element | Code | Principle it breaks |
|---|---|---|
| `.hub-bg` radial gold glow | `globals.css:69` | "no glowing orbs"; "one dark section max" |
| Ghosted rotated emoji at `opacity-[0.12] -rotate-12` | `games/page.tsx` ×3 | "no ghosted numbers" |
| `.animate-pulse-dot` infinite | `globals.css:64` | "no pulsing animations" |
| Tile glow shadows `0 10px 40px rgba(...)` | `.tile-rules/.tile-backup/.tile-daily` | "no glowing orbs" |
| Inline `style={{boxShadow}}` objects | `page.tsx`, `games/page.tsx` | "inline styles are the enemy" |

I am **not** silently overturning this, because the design principles came from Stuart's own
Warriors redesign. But applying them verbatim is also wrong — tactile depth is legitimate,
well-evidenced UX for 8-year-olds, and Duolingo-style feedback is the correct idiom for a kids'
drill app. So split the violations by *why* the rule exists:

**Keep** (game feel, bounded to `/games`): `tile-3d` press-down, `.tactile` button depth,
`.streak-flame`, one-shot `pop-in` / `float-up` / `shake-h`.

**Cut regardless of surface** (craft, not surface type): the ghosted rotated emoji — it reads
amateur anywhere; `animate-pulse-dot` on an infinite loop — battery, vestibular accessibility,
and it currently ignores `prefers-reduced-motion`.

**Stuart's call — my recommendation is to cut it:** `.hub-bg`'s radial gold glow and the tile glow
shadows. Recommendation reasoning: the hub is the *install target* for the kid-facing PWA, so it's
the first screen after launch, and a glow-on-navy hub next to a white photo-led marketing site reads
as two different products. Replace with the Play surface defined in §2 — same tactile depth, flat
color, no glow. If you'd rather keep the dark hub, that's defensible for a game; say so and I'll
scope it as a deliberate exception rather than drift.

### Quick fixes — list, don't dwell

5. **`public/manifest.json` is wrong in four ways.** `start_url: "/games"` means a parent installing
   from the marketing site lands in the kids' game hub. The same `logo.png` is declared as both
   `192x192` and `512x512` — one file can't be both. It's declared `any maskable` with no safe-zone
   padding, so Android will crop it (note you already generated a proper `outlaws-maskable-512.png`
   for coach; Warriors needs an equivalent). Description is stale: *"Rules Quiz & Backup Positions
   game"* — predates Play of the Day and Where Do I Go?.
6. **`maximumScale: 1`** in `src/app/layout.tsx` blocks pinch-zoom. Bad generally; worse on a field
   tool where a coach wants to zoom a spray chart.
7. **`COACH_PHONE = "(678) 555-0000"`** is a placeholder live on a public site (`page.tsx:11`).
8. **The OG description advertises closed tryouts.** `layout.tsx` openGraph says *"Tryouts now
   open"* while `TRYOUTS_OPEN = false`. Every social share is currently wrong. Drive the OG copy
   off the same flag.
9. **Dead-end CTA.** With `TRYOUTS_OPEN = false` the nav still shows a crimson **Sign Up** button
   that scrolls to a section reading "TRYOUTS CLOSED." Swap the CTA to "Contact Staff" on the same flag.
10. **Two of three public surfaces don't exist.** The brief names "roster, games for kids, signups."
    There is no roster page and no schedule. They're specced new in §4, not restyled.
11. **`min-h-[44px]`** (`outlaws page.tsx:821`) is the iOS floor, not a gloved-hand-in-sunlight
    target. See §3 touch sizing.

### GAP-1 — the kids' game teaches a field the team may not play

This one needs Stuart's answer before Phase 2.

- `src/components/Diamond.tsx` defines **9 positions** with a single `CF`.
- `src/lib/coach/defense.ts` defines `DEFENSE_SPOTS_COACH_PITCH` with **10 fielders**
  (`LF/LCF/RCF/RF`) and `DEFENSE_SPOTS_KID_PITCH` with 9 (`LF/CF/RF`).
- `src/lib/coach/game-types.ts` `FieldZone` carries `left_center` and `right_center`.
- `seed-db.json` contains **8 `left_center` + 10 `right_center`** real play events.

So the Outlaws data is unambiguously **four-outfielder**, while all 37 `BACKUP_SCENARIOS` in
`gameData.ts` target the 9-position layout (`CF` ×3, no LCF/RCF at all), and the Mastery grid is
hardcoded `grid-cols-9`.

If Warriors 8U plays coach-pitch with four outfielders — typical at that age — then **"Where Do I
Go?" and Position Mastery are drilling kids on a field they never stand on.** Fix path: `defense.ts`
is already format-branched, so promote format to a team-level setting, give `Diamond` a 10-position
variant, and make the Mastery grid render from the format rather than `grid-cols-9`.

### NAMING — the brief's four games don't match the code's four games

The brief lists *Play of the Day, Where Do I Go?, Miss Rewind, Position Mastery*. The code has:

| Route | Ships as | In brief? |
|---|---|---|
| `/games/daily` | PLAY OF THE DAY | ✅ |
| `/games/rules` | RULES QUIZ | ✗ not in brief |
| `/games/backup` | BACKUP DRILL | ✗ not in brief |
| `/games/position` | WHERE DO I GO? | ✅ |

**Miss Rewind is not a game** — it's `roundType: "rewind"` inside `backup/page.tsx`, a half-points
retry of the misses you just made. **Position Mastery is not a game** — it's the 9-cell progress
grid on the hub.

Recommendation: leave both where they are. Rewind is contextual to a just-finished round; promoted
to its own tile it's a dead link whenever you had no misses. Mastery is a progress indicator, not a
destination. **The hub stays four tiles.** This spec describes what exists.

---

## 1. Design system — one token set, three surfaces

The merge's real risk is three visual languages drifting. Fix it structurally: **one token file,
three surface scopes.** Tailwind v4 — tokens live in `@theme` and CSS variables, *not* a
`tailwind.config.js`. (Memory note: the "shadcn + dark sidebar" prior from earlier projects is
**overridden here** for Field. Sidebar is bottom-tab, and it's light.)

| Surface | Routes | Character | Rules |
|---|---|---|---|
| **Club** | `/`, `/roster`, `/schedule`, `#signup` | Premium, photo-led, parent-facing | Existing principles verbatim: photos do the work, white/light-gray interiors, one dark hero, color as accent |
| **Play** | `/games/*` | Tactile, rewarding, kid-facing | Bounded exception: depth and one-shot animation allowed. No glow, no ghosting, no infinite loops |
| **Field** | `/coach/*` | Instrument panel. Glanceable in sun | Light, high-contrast, huge targets, tabular numerals, no decoration |

### Brand tokens (shared — unchanged, they're good)

```css
@theme {
  --color-navy:    #0f2044;  /* primary brand */
  --color-navy-2:  #1a3160;  /* hover */
  --color-crimson: #8b1a2e;  /* action */
  --color-crimson-2:#a82037; /* hover */
  --color-gold:    #c9a84c;  /* accent ONLY — never a text color on light */
}
```

`--color-gold` on white is ~2.3:1. It is an eyebrow/rule/badge color on dark, never body text.
This is already being violated on the hub (`text-[#c9a84c]` on navy is fine; watch it on light).

> **Naming note — why `dugout`, not `field`.** `field` already means two different things in this
> codebase: `globals.css` defines `.field` as the **form-input** class (every `<input>` in the
> Warriors signup form uses `className="field"`), and `coach.css` uses `field` for the **baseball
> field graphic** (`.baseball-field`, `.field-fair-wedge`, `.field-outfield-grass`). A third meaning
> would produce `.field-theme .field`, a selector that does something surprising. The outdoor surface
> is therefore **`.dugout-theme` / `--d-*`**, which also matches the "Warriors Dugout" PWA name in §4.
> Prose below still calls the surface "Field" as a design concept; only the CSS namespace is `dugout`.

### Dugout tokens — the sunlight palette

Designed to a **~7:1** target for primary text, not AA's 4.5:1, because outdoor glare eats
effective contrast. Note the absence of pure `#ffffff` at page level: a full-white background in
direct sun is its own glare source.

```css
.dugout-theme {
  --d-bg:        #F2F3F0;  /* page — warm neutral, kills glare */
  --d-surface:   #FBFBF9;  /* cards */
  --d-sunken:    #E7E9E4;  /* wells, inactive tabs */
  --d-line:      #D3D6CF;  /* borders */
  --d-line-str:  #ADB2A9;  /* emphasis borders */

  --d-ink:       #14181C;  /* primary  — 16:1 on --d-bg */
  --d-ink-2:     #41474E;  /* secondary — 8.2:1 */
  --d-ink-3:     #565E66;  /* tertiary  — 6.6:1, ≥16px only */

  --d-pos:       #0B6B3A;  /* safe / on-base / hit */
  --d-neg:       #A4162B;  /* out / error */
  --d-warn:      #8A5A00;  /* fairness warning — NOT #f59e0b (2.1:1, unreadable) */
  --d-sel:       #12457A;  /* selected / active */
  --d-us:        #0f2044;  /* Warriors */
  --d-them:      #5A6470;  /* opponent — neutral slate, never a second brand color */
}
```

**Never encode state in color alone.** Polarized sunglasses shift hue *and* dim the screen
orientation-dependently on LCD and OLED. Every state gets a glyph or a word:
`● SAFE` / `✕ OUT` / `▲ 3 SITS`. Dark coach theme in `coach.css` gets replaced by this block —
keep the `.coach-theme`-style scoping discipline exactly as the existing file comment demands.

### Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

This is currently missing entirely. Field gets **no** decorative motion — only ≤120ms state
transitions. Play keeps its one-shot celebrations.

---

## 2. Typography

| Surface | Display | Body | Notes |
|---|---|---|---|
| Club | **Anton**, caps | Inter | Keep — it's the established Warriors voice |
| Play | **Anton**, caps | Inter | Keep |
| Field | **none** | **Inter only** | Anton is a condensed marketing face; heavy condensed caps at data sizes in sunlight is exactly the wrong choice |

**Field scale** — the rule is *no weight below 500, no size below 13px, numerals always tabular*:

```css
.dugout-theme { font-variant-numeric: tabular-nums; }
```

| Role | Size / weight | Use |
|---|---|---|
| Score | 56 / 800 | Scoreboard only |
| Data L | 36 / 800 | Inning, count, pitch count |
| Data M | 22 / 700 | Player stat cells |
| Body | 16 / 500 | Minimum body size |
| Label | 12 / 700, `tracking-[0.08em]`, caps | Small caps need weight 700 to survive glare |

Club/Play keep the current scale. One fix: `font-display` currently loads Anton via
`@import url(fonts.googleapis.com)` at the top of `globals.css` — a render-blocking third-party
request. Move it to `next/font/google` alongside Inter, which is already wired in `layout.tsx`.

---

## 3. Touch & ergonomics (Field)

The coach is standing at a fence, one-handed, possibly gloved, in sun, logging a play in the two
seconds before the next pitch.

- **Primary logging targets: 56–60px min height**, 12px gaps. `min-h-[44px]` is the iOS floor, not
  a design target.
- Secondary controls: 44px.
- **Destructive actions** (undo, delete game, clear lineup) — 44px, separated from primaries by
  ≥16px, and confirm-on-tap. There is a known history of accidental taps here.
- **Bottom-anchored primary actions.** Thumb reach, not visual hierarchy, decides placement.
- **Portrait-locked** on Field. Spray charts get a dedicated fullscreen viewer rather than a
  rotation-dependent layout.
- Pinch-zoom **enabled** (remove `maximumScale: 1`).

---

## 4. Navigation — three shells, not one nav with a role switch

A single global nav with a role toggle forces parents past coach chrome and coaches past marketing.
Three route groups with **independent shells**:

```
/                     CLUB SHELL — top nav
  ├── #about                Program
  ├── /roster               NEW — team photo grid
  ├── /schedule             NEW — games + results, parent-facing
  ├── #signup               Tryout / interest form
  └── footer → /coach       "Coaches" — footer only, not main nav

/games                PLAY SHELL — hub & spoke, back-chevron only
  ├── /daily                Play of the Day
  ├── /rules                Rules Quiz
  ├── /backup               Backup Drill (contains Miss Rewind)
  └── /position             Where Do I Go?

/coach                FIELD SHELL — bottom tab bar, 5 max
  ├── /coach                Today
  ├── /coach/lineup         Lineup + Defense by inning
  ├── /coach/log            Live game logger
  ├── /coach/stats          Heatmaps, spray, pitch counts
  └── /coach/team           Roster, drills, tryout eval
```

**Bottom** tab bar on Field, not top — one-handed at the fence. Coaches reach `/coach` by
installing or bookmarking it; they don't navigate from the homepage every game, so a footer link
is the right weight.

### Two installable PWAs from one codebase

This resolves the `start_url` conflict instead of picking a loser. **Verified against Next 16.2.6's
own resolver in this repo** (`node_modules/next/dist/lib/metadata/resolve-metadata.js:268` — the
`manifest` case is last-writer-wins in the layout merge chain), so a nested layout override works:

| | Root `/` | `/coach/layout.tsx` |
|---|---|---|
| manifest | `/manifest.json` | `/coach.webmanifest` |
| `start_url` | `/` | `/coach` |
| `scope` | `/` | `/coach` |
| `theme_color` | `#0f2044` | `#F2F3F0` |
| name | East Cherokee Warriors | Warriors Dugout |
| icon | Warriors mascot (**needs a real maskable 512**) | `outlaws-icon-512` / `outlaws-maskable-512` (already exist) |

`scope` is what keeps the two installs distinct on the homescreen. Note the root manifest's
`start_url` must change from `/games` to `/` — a third "Play & Learn" install is not worth a third
manifest; kids can install from the hub and land on `/` one tap from `/games`.

### Service workers — two strategies, one file

Port `sw.js` with route-aware caching:

- `/coach/*` — **app-shell precache + network-first-with-fallback** for data. Games queue to
  IndexedDB when `navigator.onLine` is false (`db-sync.ts` already checks this) and flush on
  reconnect. A persistent **`⛔ OFFLINE — 3 plays queued`** bar in the Field shell, because silent
  queueing is how coaches lose trust.
- `/games/*` — precache. Drills must work in a car with no signal.
- `/` — network-first. Marketing content should never be stale.

**Release checklist item, learned the hard way:** after any deploy the service worker keeps serving
the old bundle, so a normal reload shows no change. Always hard-reload (Ctrl+Shift+R) before
concluding a shipped change didn't deploy, and tell Stuart to force-close/reopen the app on his
phone. Add a build-ID-keyed cache name so the SW self-invalidates.

---

## 5. Key screens

### 5.1 Club — Home (`/`)

Keep the current structure; it's already correct (dark photo hero → white Program photo cards →
gray Tryouts → white Signup → navy footer). Changes only:

- Nav gains **Roster** and **Schedule**. The Games link keeps its gold treatment — it's the one
  playful thing in the nav and it earns the color.
- CTA + OG copy both drive off `TRYOUTS_OPEN` (fixes #8, #9).
- Real phone number or remove the field (fix #7).
- Move the three inline `boxShadow` objects into a `.btn-crimson` token class.

### 5.2 Club — Roster (`/roster`) *(new)*

Photo cards are the whole design — the existing Program section already proves the pattern.
Grid of player cards, `aspect-[3/4]`, photo with a navy bottom-gradient, **# + first name + last
initial** overlaid, position as a gold eyebrow. Tap → a small sheet with position, bats/throws, a
one-line coach note. **No stats on the public roster** — that's an 8U team, and public per-kid
batting averages are a parent-relations incident waiting to happen. Fall back to a mascot-silhouette
card for players without a photo; never a blank box.

### 5.3 Club — Schedule (`/schedule`) *(new)*

Two sections: **Next Up** (single large photo-backed card — opponent, date/time, field, map link)
and **Season** (a light list, one row per game, result chip on the right). Result chips use Field
state tokens with glyphs — `W 12–8` in `--d-pos`, `L 8–12` in `--d-neg`. Parent-facing, so scores
only: no per-kid lines.

**Dependency — this page cannot ship on its own.** Today the source of truth for games is
`localStorage` (`STORAGE_KEY = 'outlaws-field-app:v1'` and `HISTORY_KEY` in `dashboard/page.tsx`),
with Supabase as an *optional* sync behind `isDatabaseSyncEnabled()`. A public page cannot read a
coach's phone. So `/schedule` requires (a) BLOCKER-3 fixed so `/api/coach/*` exists, and (b) sync
made **non-optional for finalized games** — a coach ending a game must push it server-side, with a
visible retry if offline. Without both, `/schedule` ships empty.

### 5.4 Play — Games Hub (`/games`)

Structure stays exactly as built (four tiles + Mastery grid + back link) — the hub-and-spoke IA is
right. Visual changes per DECISION-2:

- Flat tile colors on a light `#F7F8F6` page, keeping `tile-3d` press-down and the hard bottom-edge
  shadow (`0 6px 0 <darker>`) that gives the tactile feel. Drop the `0 10px 40px rgba(...)` glow.
- Delete the three ghosted rotated emoji.
- Keep the streak flame; drop `animate-pulse-dot`.
- Mastery grid renders from team format, not `grid-cols-9` (GAP-1).
- One addition worth building: a **"From Coach"** ribbon on Play of the Day when a coach has pushed
  a specific scenario (see §6).

### 5.5 Field — Today (`/coach`)

The screen a coach opens at 8:50am. Everything is "what do I need in the next ten minutes."

```
┌──────────────────────────────────┐
│  vs Oregon Park Wahoos           │   ← opponent name, 22/700
│  Sat 9:00 AM · Field 3           │
│  ┌────────────────────────────┐  │
│  │   START GAME               │  │   ← 60px, --d-us, full width
│  └────────────────────────────┘  │
│  Lineup ✓ set   Defense ⚠ 2 gaps │   ← glyph + word, taps to /lineup
├──────────────────────────────────┤
│  PITCH COUNT — AVAILABLE TODAY   │
│   Cole 0/50 · Miles 32/50 ·      │   ← rest-rule aware, tabular
│   Eli  RESTING (2d)              │
├──────────────────────────────────┤
│  LAST GAME   L 16–24 · May 24    │
│  3 notes →                       │
└──────────────────────────────────┘
```

Pitch-count availability on the home screen is the highest-value glanceable data a youth coach has
and it's a league-compliance issue, not a nicety.

### 5.6 Field — Lineup Builder (`/coach/lineup`)

**This is the screen that has to beat Dugout Master, and the way to beat it is to make bench
fairness a live constraint instead of a report you audit afterward.**

Two tabs: **Batting** and **Defense**.

*Batting* — drag-handle list, big rows, number on the left. Drag on a phone in sun is fragile, so
every row also gets ▲▼ buttons at 44px. Absent players toggle out and the order renumbers live.

*Defense* — the payload. The data model already exists in the ported dashboard: `DefenseGroups`
keyed `A1/A2/B1/B2/C1/C2` and a `perInning: Record<number, DefenseGroupName>` map over
`PLANNED_INNINGS = 6`.

```
┌──────────────────────────────────┐
│  INNING   1  2  3  4  5  6       │
│  Group   A1 A2 B1 B2 C1 C2       │  ← tap a cell to swap group
├──────────────────────────────────┤
│  FAIRNESS                        │
│  Cole    ▮▮▮▮▮▯  1 sit           │
│  Miles   ▮▮▮▮▯▯  2 sits          │
│  Jack    ▮▮▮▯▯▯  ▲ 3 SITS        │  ← --d-warn + glyph, not color alone
│  Eli     ▮▮▮▮▮▮  0 sits · ⚠ back-to-back innings at P │
└──────────────────────────────────┘
```

Rules the meter enforces **while you build**, surfaced inline:

1. No player sits two consecutive innings.
2. Max sits across the roster differ by ≤1.
3. Every player gets ≥1 infield inning per game.
4. Pitcher rest rules respected (ties into the Today card).

A violation highlights the offending inning cell and offers a one-tap **Auto-balance**. Dugout
Master makes you build a grid and then go read whether it was fair. Making the constraint live at
build time is the actual product differentiator, and it costs almost nothing given the data shape
already in `dashboard/page.tsx`.

### 5.7 Field — Game Logger (`/coach/log`)

Speed is the only requirement. Current implementation is a 1,674-line `page.tsx` that needs
extraction (§7), but the interaction model is sound — keep it and re-skin.

```
┌──────────────────────────────────┐
│ ⛔ OFFLINE — 3 plays queued      │  ← only when offline
├──────────────────────────────────┤
│  WAR 6      INN 4▲     OUTS ●●○  │  ← 56/800 tabular
│  WAH 4                B 2 S 1    │
├──────────────────────────────────┤
│         ▸ #7 COLE W.  ◂          │  ← current batter, 36/800
├──────────────────────────────────┤
│                                  │
│      [ field — tap to place ]    │  ← ≥55% of viewport height
│                                  │
├──────────────────────────────────┤
│  1B   2B   3B   HR               │  ← 60px, --d-pos
│  OUT  K    BB   E                │  ← 60px, --d-neg / --d-ink-2
├──────────────────────────────────┤
│  ↩ Undo            ⋯ More        │  ← 44px, separated
└──────────────────────────────────┘
```

- Tap-the-field-then-tap-the-result, in that order — placement is the slow half, get it done while
  the play is fresh.
- Every entry is **undoable for 10 seconds** via a toast. No confirmation dialogs in the hot path.
  **Undo and the offline queue must not race:** an entry is held locally for the full 10s undo
  window before it becomes eligible to flush. Undo is therefore always a local delete, never a
  server compensation. (Without this rule, undoing an entry that already synced needs a delete
  endpoint and a conflict story — not worth it for a two-second correction.)
- The pin animates to where it lands; that's the only motion on this screen.
- Result buttons use the state tokens *plus* the text label — never color alone.

### 5.8 Field — Stats (`/coach/stats`)

Segmented control: **Team / Player / Opponent**. Heatmap and spray chart render from
`field-geometry.ts` (the canvas module with real Dizzy Dean 8U proportions — 50ft basepaths, 39ft
mound, 180ft fence). On light Field theme the field graphic stays green; it's a *photographic*
element, not chrome, so it's exempt from the light-surface rule the way a photo is.

Heat scale must be sequential and colorblind-safe — do not reuse the `--d-pos`/`--d-neg` pair as a
diverging ramp, since "hot" here means frequency, not good/bad.

**Do not port `baseball-data.ts`.** It reads a hardcoded `/home/swall/...` path that does not exist
in production, which is why `/intel` breaks on Vercel today. Leave `/intel` out until it's DB-backed.

### 5.9 Field — Team (`/coach/team`)

Three sub-sections, all light list UI, no decoration:

- **Roster** — players, jersey #, position eligibility, parent contact. The write-side of what
  `/roster` shows publicly.
- **Drill Library** — the Dugout Master feature worth having. Filter by *skill* (fielding, hitting,
  baserunning, situational) × *duration* (5/10/15 min) × *equipment*. Each drill: name, setup
  diagram, 3-step instruction, coaching point. Practice-plan builder assembles drills into a
  timed block you can hold in one hand at practice.
- **Tryout Eval** — evaluation cards per player, 1–5 on fielding / hitting / arm / speed /
  coachability plus a free-text note, exactly the five criteria the public tryouts section already
  advertises in `page.tsx`. **This is the PII surface from BLOCKER-1.** Additionally: no export, no
  share link, and evaluations are visible only behind the coach gate.

---

## 6. Surfacing Dugout Master's features without copying their aesthetic

Feature parity is an **information-architecture** question; their marketing site is irrelevant. The
mapping:

| Dugout Master capability | Here | How it's better |
|---|---|---|
| Lineup builder | `/coach/lineup` → Batting | Bottom-anchored, 60px targets, works offline |
| Defensive rotation by inning | `/coach/lineup` → Defense | Reuses the existing `A1…C2` × `perInning` model |
| Bench fairness | **Inline meter** | Live build-time constraint, not an after-the-fact report |
| Drill library | `/coach/team` → Drills | Practice-plan builder; filterable by time available |
| Tryout eval | `/coach/team` → Tryouts | **Fed directly from the signup form** — `api/signups` already exists, so a kid who registers on the public site appears as an eval card. Dugout Master can't do this; they don't own the team's website |

The last row is the real argument for the merge. Two integrations only possible because one product
owns both sides:

1. **Signup → tryout eval → roster → public roster page**, one continuous pipeline, no re-typing.
2. **Coach → kids.** A coach finishes a game where the team botched cutoffs, opens the logged game,
   and pushes the matching `BACKUP_SCENARIOS` entry as tomorrow's **Play of the Day**. The kids get
   a drill about the mistake they actually made. `gameData.ts` scenarios and `game-types.ts`
   `FieldZone` are close enough to link. That's a feature Dugout Master structurally cannot ship.

---

## 7. Component library

**shadcn/ui, on Tailwind v4.** Not a component *dependency* — shadcn copies source into the repo,
which is what you want when three surfaces need the same primitive styled three ways.

Caveats for whoever implements:

- This is **Tailwind v4**. shadcn tokens go in `@theme` / CSS variables. Do not follow v3-shaped
  `tailwind.config.js` instructions; they won't apply.
- Adopt only: `Button`, `Card`, `Sheet`, `Tabs`, `Dialog`, `Toast`, `Select`, `Badge`, `Progress`.
  Skip the rest until something needs it.
- Keep **Field-specific primitives hand-rolled**: `FieldCanvas`, `PinLayer`, `FairnessMeter`,
  `ScoreStrip`. They're too specific for a generic library.
- **Extraction is the point.** `outlaws/page.tsx` is 1,674 lines and `dashboard/page.tsx` is 757.
  Break the logger into `<ScoreStrip>`, `<BatterBar>`, `<FieldCanvas>`, `<ResultPad>`, `<UndoToast>`.
- Keep `"build": "next build --webpack"`. It's already in `package.json` and it's the fix for the
  Turbopack dead-button bug — production HTML referenced a client chunk Turbopack never wrote, and
  SSR screenshots looked fine while every button was dead. Do not "clean this up."

**Consolidating `Diamond.tsx` (SVG, hardcoded px, interactive) with `field-geometry.ts` (canvas,
real proportions, single source of zone anchors) is worth doing — `field-geometry.ts` is the better
foundation — but it is Phase 4, not a merge blocker.** Forcing it now risks breaking both renderers
simultaneously.

---

## 8. Phased rollout

### Phase 0 — Unblock (must land before any coach page merges)
1. **Settle the Supabase story first — it's a prerequisite, not a parallel task.** Root
   `supabase.ts` standardizes on `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`, while
   Outlaws used raw PostgREST with `SUPABASE_SECRET_KEY` against project `omwqwwflvnunuvgidvwx`.
   The library standardization is right, but it's an env-var rename **and** a one-project-or-two
   decision, and you cannot write the API routes in step 3 without the answer.
2. Port `middleware.ts` with the `/coach/:path*` matcher; port `/coach/login` + `/api/coach/login`.
3. Implement `/api/coach/*` routes so `db-sync.ts` has a live endpoint; fix the misleading
   "sync disabled" copy on failure.
4. Port `sw.js`, `pwa-register.tsx`, `install-prompt.tsx`; add `/coach.webmanifest`.
5. Fix `manifest.json` (`start_url`, real 192/512 icons, padded maskable, description).
6. Remove `maximumScale: 1`; add the `prefers-reduced-motion` block.

*Exit: `/coach` unreachable without a passcode; a game logged in airplane mode syncs on reconnect.*

### Phase 1 — Field tokens, then port
7. **Rewrite `coach.css`** — `.dugout-theme` light tokens from §1, *plus* a line-by-line audit of all
   ~375 nested rules for dark-theme assumptions (`.baseball-field` blue glow, `.glass` frosted
   panels, `h1–h6`/`p` referencing dropped `--text-*` tokens). Keep the existing scoping discipline
   and keep `.field-fair-wedge`'s clip-path. See DECISION-1 — this is a week, not an afternoon.
8. Port the coach pages **onto light tokens directly**. Never render them dark.
9. Build the Field shell: bottom tab bar, portrait lock, offline bar.

*Exit: Stuart opens `/coach` outdoors at noon and can read it. That's the acceptance test — take
the phone outside.*

### Phase 2 — The coach tool gets good
10. Extract the logger into components; apply 56–60px targets, tabular numerals, undo toast.
11. Build the Lineup Builder with the inline fairness meter.
12. Today screen with pitch-count availability.
13. **Resolve GAP-1** (coach-pitch vs kid-pitch) and make `Diamond` + Mastery format-driven.

### Phase 3 — Public site completion
14. `/roster` and `/schedule` — **`/schedule` first requires finalized games to sync server-side
    non-optionally** (see §5.3), or it renders empty.
15. Fix the placeholder phone, OG/CTA flag contradictions, inline `boxShadow` → token classes.
16. Move the Anton `@import` into `next/font/google`.

### Phase 4 — Play surface + integration
17. Apply DECISION-2 to the games hub (once Stuart rules on the glow).
18. Coach → Play of the Day push.
19. Signup → tryout eval → roster pipeline.
20. Unify `Diamond` onto `field-geometry.ts`.

### Phase 5 — Polish
21. Drill library + practice-plan builder.
22. Real photography pass on `/roster` (the single highest-leverage visual upgrade available —
     photos do the work).
23. Lighthouse + a genuine outdoor-readability pass.

---

## 9. Open decisions for Stuart

1. **DECISION-2** — cut the games-hub glow/dark background, or keep it as a deliberate kid-surface
   exception? (My recommendation: cut. It's the PWA's first screen.)
2. **GAP-1** — does Warriors 8U play 10 fielders with four outfielders? Determines whether the kids'
   games are currently teaching the wrong field.
3. **Supabase** — one merged project or two (Warriors signups vs. Outlaws `omwqwwflvnunuvgidvwx`)?
4. **Team identity** — the merged coach tool still says "Outlaws" throughout (`outlaws-icon.svg`,
   `TeamAtBat = "outlaws" | "opponent"`, `--d-us` naming). Is this one tool serving two teams, or
   is Outlaws being retired into Warriors? It changes whether team becomes a first-class entity or
   a rename.
5. **Public roster** — confirm no per-player stats on the public page. I've specced it that way
   deliberately.
