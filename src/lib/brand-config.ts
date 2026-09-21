// Single source of truth for brand-level identity: names, colors, and logo
// paths. The point of this module is rebrand-readiness, not a rebrand — every
// value below is the name/color the app already shipped with. Changing the
// product's name later should mean editing this file, not grepping components.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT BELONGS HERE
//   Strings and assets a rebrand would have to change: wordmarks, the club and
//   team display names, brand hex values, logo/mascot paths.
//
// WHAT DOES NOT BELONG HERE — and must never be driven from this file
//   Data identifiers. These are *persisted values*, not labels:
//     - `TeamAtBat = "us" | "them"` (src/lib/coach/game-types.ts), every
//       `=== "us"` comparison derived from it, and `play_events.batting_team`
//     - column names `games.us_score`, `games.us_home`,
//       `play_events.us_runs_after`
//     - saved device state keys: `usLineup`, `usAreHome`,
//       `stateAfter.usRuns`, `usRunsAfter`
//     - the localStorage keys `outlaws-field-app:v1` / `:games:v1`, and row ids
//       such as `team-outlaws` — both still spelled the old way on purpose
//       (T7 / MT-4 own those renames, and each needs its own data migration)
//     - the auth cookie `ec_coach_auth` and its salt
//     - asset filenames under `public/coach/icons/`
//   Renaming any of those silently drops saved state or breaks the synced event
//   shape in Supabase. Rebranding is a display concern; keep it to display.
//
//   This list used to say "outlaws" everywhere instead of "us". Migration 006
//   (MULTI-TENANT-PLAN §2.6) renamed the perspective vocabulary precisely so
//   that the data layer stops borrowing a team's name — the entries above are
//   now neutral, and the remaining "outlaws" spellings are the ones that still
//   have a migration owed to them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The public-facing club — the parent-facing marketing identity used by the
 * homepage, document titles, and social cards.
 */
export const club = {
  /** Full formal name: footers, metadata, og:title. */
  name: "East Cherokee Warriors",
  /** Short name for running copy: "the Warriors roster is full". */
  shortName: "Warriors",
  /** Locality shown as the hero eyebrow and in the document title. */
  region: "East Cherokee",
  /** One-line descriptor under the name in the footer. */
  tagline: "8U Travel Baseball",
} as const;

// The nav and hero render the wordmark in Anton, which has no small-caps
// feature — the source string has to already be uppercase. Derived rather than
// stored so a rebrand only has to set `shortName`/`region` above.
/** Nav + hero wordmark, e.g. "WARRIORS". */
export const wordmark = club.shortName.toUpperCase();
/** Hero eyebrow above the wordmark, e.g. "EAST CHEROKEE". */
export const eyebrow = club.region.toUpperCase();

/**
 * The team the coach tool logs games for.
 *
 * Kept separate from `club` on purpose: whether the Outlaws are being retired
 * into the Warriors or whether this is one tool serving two teams is still an
 * open decision (MERGE-PLAN §9.7, DESIGN.md §9.4). Modelling them as two
 * values means that decision can be made later by editing this file, and it
 * doesn't have to be made now just to centralize the strings.
 */
export const team = {
  /** Short display name used throughout the coach tool: scoreboards, box scores. */
  name: "Outlaws",
  /** Full name, used on the coach login screen. */
  fullName: "East Cherokee Outlaws",
  /**
   * Filename-safe slug for generated downloads (`<slug>-game-summary.md`).
   * Display-only — this is NOT the `team-outlaws` database id, and changing it
   * renames future exports without touching any stored row.
   */
  slug: "us",
} as const;

/**
 * Brand colors.
 *
 * ⚠️ These are the source of truth for *TypeScript* consumers — `themeColor`,
 * metadata, and inline `style` props. They are mirrored, deliberately, by the
 * `@theme` block in `src/app/globals.css`, because Tailwind cannot interpolate
 * a TS constant into an arbitrary value (`bg-[#0f2044]` must be a literal).
 * Change a hex here and change it there; they are two lines in two files
 * rather than the ~40 scattered literals this replaced.
 */
export const colors = {
  /** Primary brand — nav, hero, footer surfaces. */
  navy: "#0f2044",
  /** Navy hover/elevated variant. */
  navyHover: "#1a3160",
  /** Action color — signup CTAs. */
  crimson: "#8b1a2e",
  /** Crimson hover. */
  crimsonHover: "#a82037",
  /**
   * Accent only. ~2.3:1 on white — never use as body text on a light surface.
   * Eyebrows, rules, and badges on dark only. (DESIGN.md §1)
   */
  gold: "#c9a84c",
} as const;

/** Logo and mascot assets. */
export const assets = {
  logo: "/images/warriors/logo.png",
  logoJpg: "/images/warriors/logo.jpg",
  mascot: "/images/warriors/mascot.png",
} as const;

/** Grouped export, for call sites that want a single import. */
export const BRAND = { club, team, colors, assets, wordmark, eyebrow } as const;

export default BRAND;
