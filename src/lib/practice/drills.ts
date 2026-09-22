// Preloaded drill catalog (Decision 2, docs/PRACTICE-ASSIGNMENT-AND-DRILLS.md).
//
// Original content only — every name, setup, and instruction below is our own
// wording. DUGOUT-MASTER-DEEP-DIVE.md's hard rule: adopt Dugout Master's
// WORKFLOW patterns (drill categories, station/block structure, equipment
// aggregation), never its drills or diagrams. Nothing here was copied from
// that product or any other catalog.
//
// This is preloaded, code-shipped content (like bundles.ts's position
// bundles) — not a database table. Only coach-authored PRACTICE PLANS
// (src/lib/practice/plans.ts) live in the database; the drills they reference
// resolve back to this catalog by id.
import type { FieldPosition } from "./bundles.ts";

export type DrillCategory =
  | "infield"
  | "outfield"
  | "hitting"
  | "throwing"
  | "baserunning"
  | "team-defense";

export type AgeBand = "8U" | "9U" | "10U" | "11U" | "12U";
export const AGE_BANDS: AgeBand[] = ["8U", "9U", "10U", "11U", "12U"];

// Loosely mirrors the scenario categories Decision 3 introduces for
// BACKUP_SCENARIOS (cover / backup / relay / miss-recovery). This is a soft,
// optional label — not a foreign key into that catalog, since that content is
// owned elsewhere — so game-insights can later suggest "here's a drill for
// the skill you just missed" without this module depending on gameData.ts.
export type ScenarioCategory = "cover" | "backup" | "relay" | "miss-recovery";

// A controlled vocabulary, not free text. This is what makes
// aggregate.ts's equipment checklist actually aggregate: "10 balls", "1 ball
// per pair", and "soft-toss balls" would each be their own line on a printed
// checklist if drills described equipment in their own words. Quantities and
// per-station specifics ("bucket of balls", "one ball per pair") belong in
// `setup`/`players`, which are prose; `equipment` stays a short, de-dupable
// list of what to bring.
export const EQUIPMENT_ITEMS = [
  "balls",
  "cones",
  "bases",
  "batting tee",
  "L-screen",
  "net",
  "catcher's gear",
  "helmets",
  "fungo bat (optional)",
  "stopwatch (optional)",
  "none",
] as const;
export type EquipmentItem = (typeof EQUIPMENT_ITEMS)[number];

export type Drill = {
  id: string;
  name: string;
  category: DrillCategory;
  // Empty array = whole-team drill, not tied to specific field positions.
  positions: FieldPosition[];
  ageBands: AgeBand[];
  durationMinutes: number;
  players: string;
  space: string;
  equipment: EquipmentItem[];
  setup: string;
  instructions: string[];
  coachingCue?: string;
  scenarioCategory?: ScenarioCategory;
};

export const DRILL_CATEGORIES: DrillCategory[] = [
  "infield",
  "outfield",
  "hitting",
  "throwing",
  "baserunning",
  "team-defense",
];

export const DRILLS: Drill[] = [
  // ── Infield ──────────────────────────────────────────────────────────
  {
    id: "d-infield-forehand-shuffle",
    name: "Shuffle-and-field forehand",
    category: "infield",
    positions: ["2B", "SS", "3B", "1B"],
    ageBands: ["8U", "9U", "10U"],
    durationMinutes: 10,
    players: "1 coach, up to 6 infielders in a line",
    space: "Half an infield or a flat patch of grass",
    equipment: ["balls", "cones"],
    setup:
      "Line infielders at their normal depth. Coach stands 15-20 feet away with a bucket of balls.",
    instructions: [
      "Coach rolls a two-hop ground ball just to the fielder's glove side.",
      "Fielder shuffles their feet to get square, fields with two hands, and holds the ball up to show a clean transfer.",
      "Rotate to the back of the line; next fielder steps up.",
      "After two full rounds, move the roll two steps wider to force a real shuffle instead of a reach.",
    ],
    coachingCue: "Chest over the ball, glove out early — don't let it play you.",
  },
  {
    id: "d-infield-backhand-drop-step",
    name: "Backhand drop-step",
    category: "infield",
    positions: ["SS", "3B", "2B"],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach, up to 6 infielders",
    space: "Half an infield",
    equipment: ["balls", "cones"],
    setup: "Infielders line up; coach rolls balls to the glove-side backhand.",
    instructions: [
      "On the roll, fielder drop-steps with the glove-side foot and opens the hips toward the ball.",
      "Field the ball out in front on the backhand, then crow-hop into a throw to a target.",
      "Emphasize catching the ball before crossing the body, not reaching across.",
    ],
    coachingCue: "Get your feet there first — the glove follows the feet.",
  },
  {
    id: "d-infield-double-play-pivot",
    name: "Double-play pivot at the bag",
    category: "infield",
    positions: ["2B", "SS"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 15,
    players: "1 coach, feeder, 4-8 infielders",
    space: "Infield around 2nd base",
    equipment: ["balls", "bases"],
    setup:
      "Feeder stands near shortstop/second position with balls; middle infielders rotate through receiving at the bag.",
    instructions: [
      "Feeder tosses or rolls the ball to the covering fielder near second base.",
      "Fielder receives, taps the bag with the correct foot for their angle, and clears toward first before throwing.",
      "Start with a stationary feed, then add a runner (a coach jogging, not sliding) to teach clearing the bag safely.",
    ],
    scenarioCategory: "cover",
    coachingCue: "Find the bag with your feet before you worry about the throw.",
  },
  {
    id: "d-infield-slow-roller-charge",
    name: "Charge the slow roller",
    category: "infield",
    positions: ["3B", "SS", "2B", "1B"],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach, up to 6 infielders",
    space: "Infield dirt",
    equipment: ["balls", "cones"],
    setup: "Coach rolls a slow, dying ground ball in front of the fielder's starting position.",
    instructions: [
      "Fielder sprints in under control, rounds the ball slightly to the glove side, and fields it moving forward.",
      "Throw on the move with a short arm action — no set-and-reset.",
      "Repeat with the roller placed slightly left, center, and right of the starting spot.",
    ],
    coachingCue: "Field it and throw in one motion — a clean out beats a hard, rushed throw.",
  },
  {
    id: "d-infield-1b-scoop",
    name: "First base scoop and stretch",
    category: "infield",
    positions: ["1B"],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach or thrower, 2-4 first basemen",
    space: "First base and the throwing lane from short/second",
    equipment: ["balls", "bases"],
    setup: "First baseman holds the bag; thrower stands at shortstop or second base depth.",
    instructions: [
      "Thrower delivers a mix of chest-high, short-hop, and slightly off-line throws.",
      "First baseman stretches toward the throw without leaving the bag early, and scoops short hops with the glove low and soft.",
      "Call out 'stretch' or 'come off' so players learn when to leave the bag for a wide throw.",
    ],
    coachingCue: "Let the throw dictate your stretch — don't guess and commit early.",
  },
  {
    id: "d-infield-c-2b-throw",
    name: "Catcher pop-and-throw to second",
    category: "infield",
    positions: ["C", "2B", "SS"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 12,
    players: "1 coach, catcher, middle infielder covering",
    space: "Home plate to second base",
    equipment: ["catcher's gear", "balls", "bases"],
    setup: "Catcher in gear behind the plate; a middle infielder rotates covering second.",
    instructions: [
      "Coach flips or lightly throws a pitch into the catcher's mitt.",
      "Catcher pops up, steps toward second with a quick exchange, and throws low and on a line.",
      "Covering infielder calls 'go' before the throw so the catcher has a target and timing cue.",
    ],
    scenarioCategory: "cover",
    coachingCue: "Quick feet beat a strong arm — get rid of it fast.",
  },
  {
    id: "d-infield-5-star",
    name: "Five-star reaction fielding",
    category: "infield",
    positions: ["1B", "2B", "3B", "SS"],
    ageBands: ["11U", "12U"],
    durationMinutes: 12,
    players: "1 coach with a fungo or tosses, 1 fielder at a time",
    space: "One infield position",
    equipment: ["balls", "fungo bat (optional)"],
    setup: "Fielder starts in an athletic ready position; coach hits or rolls balls in quick succession to different spots.",
    instructions: [
      "Coach alternates ball location left, right, in, and short-hop, giving the fielder just enough time to reset between reps.",
      "Fielder must reset to an athletic position after every rep before the next ball comes.",
      "Keep reps short (5-6) per turn so effort and focus stay high.",
    ],
    coachingCue: "Reset your feet every time — tired feet cause errors.",
  },
  // ── Outfield ─────────────────────────────────────────────────────────
  {
    id: "d-outfield-drop-step-read",
    name: "Drop-step and read fly balls",
    category: "outfield",
    positions: ["LF", "CF", "RF"],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 12,
    players: "1 coach, up to 6 outfielders",
    space: "Open outfield grass",
    equipment: ["balls", "fungo bat (optional)"],
    setup: "Outfielders line up at normal depth; coach hits or throws fly balls over either shoulder.",
    instructions: [
      "On contact, outfielder drop-steps to the ball side (never turns their back running straight backward) and sprints to a spot in front of where the ball will land.",
      "Catch the ball moving forward when possible, in position to throw.",
      "Rotate through both the glove-side and throwing-side drop step.",
    ],
    coachingCue: "First step is a drop step, not a backpedal.",
  },
  {
    id: "d-outfield-crow-hop-throw",
    name: "Crow-hop long throw",
    category: "outfield",
    positions: ["LF", "CF", "RF"],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "Pairs",
    space: "60-120 feet of open grass, distance based on age",
    equipment: ["balls"],
    setup: "Partners face each other at a starting distance appropriate for the age group.",
    instructions: [
      "Fielding partner catches a rolled or tossed ball, crow-hops (small skip step) to gather momentum, and throws on a line.",
      "Receiving partner calls out where the throw arrived (chest, short-hop, off-line) for immediate feedback.",
      "Increase distance by 10 feet every few reps as accuracy holds up.",
    ],
    coachingCue: "The crow hop loads your legs — don't throw with just your arm.",
  },
  {
    id: "d-outfield-gap-communication",
    name: "Gap call and go",
    category: "outfield",
    positions: ["LF", "CF", "RF"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 12,
    players: "1 coach, 3 outfielders (all three spots)",
    space: "Full outfield",
    equipment: ["balls", "fungo bat (optional)"],
    setup: "All three outfielders in their normal spots; coach hits or throws balls into the gaps between them.",
    instructions: [
      "Whichever outfielder has the best angle calls 'ball, ball, ball' loudly and the others peel off to back up.",
      "The non-fielding outfielders sprint to a backup position behind the play, not just stand and watch.",
      "Rotate positions so everyone practices both calling for the ball and backing up.",
    ],
    scenarioCategory: "backup",
    coachingCue: "Loudest voice wins the ball — call early and mean it.",
  },
  {
    id: "d-outfield-cutoff-relay",
    name: "Outfield-to-cutoff relay lines",
    category: "outfield",
    positions: ["LF", "CF", "RF", "SS", "2B"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 15,
    players: "1 coach, outfielder, cutoff player, catcher/target",
    space: "Outfield through the infield to home or a base",
    equipment: ["balls", "bases", "cones"],
    setup: "Outfielder starts near the fence; a cutoff infielder lines up between the outfielder and the target base.",
    instructions: [
      "Coach rolls or hits a ball toward the fence; outfielder fields it and hits the cutoff player with a strong, accurate throw.",
      "Cutoff player squares up, catches, and redirects the throw to the target in one motion.",
      "Rotate the target between home plate and third base so players see both relay angles.",
    ],
    scenarioCategory: "relay",
    coachingCue: "Outfielder's job is to hit the cutoff man in the chest, not the base.",
  },
  {
    id: "d-outfield-sun-drop-recovery",
    name: "Lost-ball recovery",
    category: "outfield",
    positions: ["LF", "CF", "RF"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 8,
    players: "1 coach, up to 6 outfielders",
    space: "Open outfield grass",
    equipment: ["balls"],
    setup: "Outfielder starts in ready position; coach throws or hits a ball that gets past the fielder on purpose.",
    instructions: [
      "When the ball gets by, fielder sprints to retrieve it immediately rather than jogging — treat every miss like a runner is going first-to-third.",
      "Field the ball cleanly on the recovery and make a strong throw to the cutoff or base called out by the coach.",
      "Talk through who covers the vacated depth (the other two outfielders shift over) after the drill.",
    ],
    scenarioCategory: "miss-recovery",
    coachingCue: "A miss isn't over until the ball is back in play — sprint, don't jog.",
  },
  // ── Hitting ──────────────────────────────────────────────────────────
  {
    id: "d-hitting-tee-load",
    name: "Tee work: load and stride",
    category: "hitting",
    positions: [],
    ageBands: ["8U", "9U", "10U"],
    durationMinutes: 10,
    players: "1 hitter per tee, can run 3-4 tees at once",
    space: "Batting cage, net, or open field",
    equipment: ["batting tee", "balls", "net"],
    setup: "Tee set at belt height over the plate; hitter in stance.",
    instructions: [
      "Hitter takes a slow, controlled load (weight shift back) before starting the swing.",
      "Stride short and soft, keeping the head still through contact.",
      "Take 10 swings focusing only on tempo, not power.",
    ],
    coachingCue: "Slow load, quick hands — don't rush the front side.",
  },
  {
    id: "d-hitting-soft-toss-inside-out",
    name: "Soft toss: inside-out swing path",
    category: "hitting",
    positions: [],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 12,
    players: "Pairs (tosser + hitter) or 1 coach per hitter",
    space: "Batting cage or net",
    equipment: ["balls", "net", "L-screen"],
    setup: "Tosser kneels at a 45-degree angle in front of the hitter, out of the swing path.",
    instructions: [
      "Tosser flips the ball toward the hitter's front hip, not the barrel.",
      "Hitter keeps hands inside the ball and drives through the middle of the field.",
      "Rounds of 8-10 swings, then switch roles.",
    ],
    coachingCue: "Let the ball travel — hit it out in front, not out on the barrel's front foot.",
  },
  {
    id: "d-hitting-front-toss-timing",
    name: "Front toss: two-strike timing",
    category: "hitting",
    positions: [],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 12,
    players: "1 tosser (protected by an L-screen), 1 hitter",
    space: "Batting cage",
    equipment: ["L-screen", "balls", "net"],
    setup: "Tosser stands 25-30 feet away behind an L-screen and underhand-tosses at a game-like pace.",
    instructions: [
      "Hitter simulates a two-strike approach: shorten the stride, choke up slightly, and focus on contact over power.",
      "Tosser mixes pace (not location, for safety) so timing has to adjust rep to rep.",
      "10-12 swings per round; track how many are put in play fair.",
    ],
    coachingCue: "Two strikes means see it, shorten up, and battle.",
  },
  {
    id: "d-hitting-bunt-mechanics",
    name: "Bunt mechanics station",
    category: "hitting",
    positions: [],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach or tosser per hitter",
    space: "Batting cage or open grass with an L-screen",
    equipment: ["L-screen", "balls", "cones"],
    setup: "Hitter squares or pivots to bunt as the tosser delivers underhand tosses.",
    instructions: [
      "Hitter squares the bat early, soft hands, and catches the ball with the bat rather than jabbing at it.",
      "Practice both a sacrifice bunt (toward a cone near third) and a drag/push bunt (toward a cone near first).",
      "Reward bunts that land inside the cone zones.",
    ],
    coachingCue: "Give with the ball — the bat is a pillow, not a bat.",
  },
  {
    id: "d-hitting-live-bp-approach",
    name: "Live batting practice: pick a zone",
    category: "hitting",
    positions: [],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 15,
    players: "1 coach pitching (or a pitching machine), rotating hitters",
    space: "Batting cage or field with an L-screen",
    equipment: ["L-screen", "balls", "helmets"],
    setup: "Coach pitches from the mound or a shortened distance behind an L-screen.",
    instructions: [
      "Before stepping in, each hitter states one zone they're hunting (middle, in, or out).",
      "Hitter takes 5-6 pitches, swinging only at strikes in their called zone and taking the rest.",
      "Coach gives one specific piece of feedback per hitter, not a full mechanical rebuild.",
    ],
    coachingCue: "Pick a zone and commit — hunting everything means hitting nothing.",
  },
  {
    id: "d-hitting-two-hand-drill",
    name: "Two-hand top-hand isolation",
    category: "hitting",
    positions: [],
    ageBands: ["8U", "9U", "10U"],
    durationMinutes: 8,
    players: "1 hitter per station",
    space: "Batting tee area",
    equipment: ["batting tee", "balls"],
    setup: "Hitter chokes up and swings one-handed (top hand only) off a tee, then the other hand.",
    instructions: [
      "Top-hand-only swings focus on driving the barrel through the ball, not slapping at it.",
      "Bottom-hand-only swings focus on directing the barrel path.",
      "Finish with 10 normal two-hand swings, feeling both hands work together.",
    ],
    coachingCue: "Feel what each hand does — then let them work as a team.",
  },
  {
    id: "d-hitting-opposite-field",
    name: "Opposite-field angle tee work",
    category: "hitting",
    positions: [],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 hitter per tee",
    space: "Batting cage or net",
    equipment: ["batting tee", "balls", "cones"],
    setup: "Tee moved slightly deeper in the zone than usual, cones marking the opposite-field gap as a target.",
    instructions: [
      "Hitter lets the ball travel deeper before contact and drives it toward the marked opposite-field gap.",
      "Reward line drives inside the cone lane over pulled or popped-up contact.",
      "10-12 swings, resetting the tee position between rounds.",
    ],
    coachingCue: "Let it get deep, stay inside it, drive it the other way.",
  },
  // ── Throwing ─────────────────────────────────────────────────────────
  {
    id: "d-throwing-arm-care-warmup",
    name: "Progressive arm-care warmup",
    category: "throwing",
    positions: [],
    ageBands: ["8U", "9U", "10U", "11U", "12U"],
    durationMinutes: 8,
    players: "Pairs",
    space: "Any open flat space",
    equipment: ["balls"],
    setup: "Partners start 20 feet apart and step back after each set of throws.",
    instructions: [
      "Start with short, easy-catch tosses focused on a clean grip and a four-seam release.",
      "Step back 10 feet every 5-6 throws, up to a comfortable maximum distance for the age group.",
      "Finish by stepping back in to the original distance for a cool-down set.",
    ],
    coachingCue: "Warm up the arm before you test it — no max-effort first throw.",
  },
  {
    id: "d-throwing-crossover-footwork",
    name: "Crossover step footwork",
    category: "throwing",
    positions: [],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 8,
    players: "Pairs or a line facing a coach",
    space: "Open flat space",
    equipment: ["balls", "cones"],
    setup: "Player stands sideways to their target with feet on a marked line.",
    instructions: [
      "On the catch, player throws the back foot behind the front (crossover step) to gain ground toward the target.",
      "Emphasize a quick, short crossover rather than a long stride that slows the throw down.",
      "Alternate glove-side and throwing-side crossover reps.",
    ],
    coachingCue: "Get your feet moving toward the target before your arm does.",
  },
  {
    id: "d-throwing-accuracy-target",
    name: "Target accuracy ladder",
    category: "throwing",
    positions: [],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "Pairs, or 1 thrower to a wall/net target",
    space: "Open space or a throwing wall",
    equipment: ["balls", "cones", "net"],
    setup: "Set a chest-high target at a fixed distance.",
    instructions: [
      "Thrower gets 5 throws to hit the target zone, counting hits out loud.",
      "Step back 5 feet after every set of 5 to raise the difficulty.",
      "Track each player's best round for a quick, low-pressure competition.",
    ],
    coachingCue: "Aim small — pick a spot on the target, not just the general area.",
  },
  {
    id: "d-throwing-relay-priority",
    name: "Relay decision reps",
    category: "throwing",
    positions: ["SS", "2B", "3B", "1B"],
    ageBands: ["11U", "12U"],
    durationMinutes: 12,
    players: "1 coach, relay player, 2 target players (different bases)",
    space: "Infield with two live base targets",
    equipment: ["balls", "bases"],
    setup: "Relay player stands between the outfield and the infield; two targets stand at different bases.",
    instructions: [
      "Coach calls out a runner situation (e.g. 'runner rounding second') before the throw arrives.",
      "Relay player catches, pivots, and throws to whichever base the coach calls — practicing the decision, not just the mechanics.",
      "Mix in a 'no play, hold the ball' call so players learn that not every relay throws through.",
    ],
    scenarioCategory: "relay",
    coachingCue: "Know the situation before the ball gets to you, not after.",
  },
  {
    id: "d-throwing-run-and-gun",
    name: "Run-and-gun charge throws",
    category: "throwing",
    positions: [],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "Pairs",
    space: "Open flat space, 30-45 feet",
    equipment: ["balls"],
    setup: "One partner rolls the ball out in front of the other, who has to charge it.",
    instructions: [
      "Fielder charges through the ball rather than stopping to field it, then throws on the move.",
      "Focus on a quick, compact arm action rather than a long windup while off balance.",
      "Switch roles every 8-10 reps.",
    ],
    coachingCue: "Field it moving, throw it moving — don't stop your feet.",
  },
  {
    id: "d-throwing-long-toss-buildup",
    name: "Long-toss buildup",
    category: "throwing",
    positions: [],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 12,
    players: "Pairs",
    space: "Open field, up to 120+ feet depending on age and arm strength",
    equipment: ["balls"],
    setup: "Partners start close and back up gradually after a full arm-care warmup.",
    instructions: [
      "Increase distance in 15-foot increments only after 5-6 clean, on-line throws at the current distance.",
      "Keep throws on a line or gentle arc — no bouncing throws to reach distance.",
      "Cap the maximum distance based on age and arm history; when in doubt, stop early.",
    ],
    coachingCue: "Distance is earned with clean throws, not just effort.",
  },
  // ── Baserunning ──────────────────────────────────────────────────────
  {
    id: "d-baserunning-primary-secondary-lead",
    name: "Primary and secondary lead timing",
    category: "baserunning",
    positions: [],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach, runners rotate through first base",
    space: "First base and the baseline toward second",
    equipment: ["balls", "bases"],
    setup: "Runner takes a lead off first; coach simulates a pitcher's motion.",
    instructions: [
      "Runner takes a primary lead, then a shuffle-step secondary lead as the coach's arm comes forward.",
      "On a coach signal for a live ball, runner breaks hard to second; on a pickoff signal, runner gets back safely.",
      "Rotate every 2-3 reps so runners see both outcomes.",
    ],
    coachingCue: "Secondary lead lands as the pitch is released, not before.",
  },
  {
    id: "d-baserunning-tag-up",
    name: "Tag-up reads on a fly ball",
    category: "baserunning",
    positions: [],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach hitting or throwing fly balls, runners at 2nd/3rd, an outfielder",
    space: "Full field with a runner on base and an outfielder",
    equipment: ["balls", "bases"],
    setup: "Runner stands on second or third; an outfielder is positioned to catch a fly ball.",
    instructions: [
      "Coach hits or throws a fly ball to the outfielder; runner reads the depth and decides tag-up or hold.",
      "On a tag-up read, runner returns to the bag, watches the catch, then breaks for the next base.",
      "Debrief immediately: was that read deep enough to go, or too shallow?",
    ],
    coachingCue: "When in doubt on a shallow ball, stay — you can't un-tag a mistake.",
  },
  {
    id: "d-baserunning-first-to-third",
    name: "First-to-third read",
    category: "baserunning",
    positions: [],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach, runner at first, an outfielder fielding a single",
    space: "First base through third base, with a right or center fielder",
    equipment: ["balls", "bases"],
    setup: "Runner takes a lead off first; coach hits or throws a ground ball or single to the outfield.",
    instructions: [
      "Runner rounds second under control while reading the outfielder's angle to the ball and arm.",
      "On a clean read (ball hit hard, outfielder slow to the ball, or bad angle), runner advances to third.",
      "On a tough read, runner rounds and returns to second safely.",
    ],
    coachingCue: "Round hard, then let the ball and the fielder make the decision for you.",
  },
  {
    id: "d-baserunning-sliding-technique",
    name: "Sliding technique on grass",
    category: "baserunning",
    positions: [],
    ageBands: ["8U", "9U", "10U", "11U", "12U"],
    durationMinutes: 8,
    players: "1 coach, runners in a line",
    space: "Soft, dry grass area (never dirt or wet grass for early reps)",
    equipment: ["cones"],
    setup: "Runners jog toward a marked slide zone one at a time.",
    instructions: [
      "Runner starts the slide a body length before the base, bent leg tucked, other leg extended toward the bag.",
      "Hands stay up off the ground to avoid jammed fingers.",
      "Repeat both bent-leg options (left leg tucked, right leg tucked) so runners are comfortable either way.",
    ],
    coachingCue: "Start the slide early — sliding into the bag, not onto it, avoids most injuries.",
  },
  {
    id: "d-baserunning-steal-jump",
    name: "Steal jump and first-step quickness",
    category: "baserunning",
    positions: [],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 10,
    players: "1 coach, runners rotate through first base",
    space: "First base and the baseline toward second",
    equipment: ["bases", "stopwatch (optional)"],
    setup: "Runner takes a lead; coach gives a steal signal at a randomized moment.",
    instructions: [
      "On the signal, runner crosses over and drives hard for 4-5 steps before standing up to run.",
      "Time the first several steps if a stopwatch is available, and compare improvement over the season.",
      "Mix in false signals occasionally so runners learn to wait for the real one, not anticipate blindly.",
    ],
    coachingCue: "First step is a crossover, not a stand-up-and-run.",
  },
  // ── Team defense ─────────────────────────────────────────────────────
  {
    id: "d-team-cutoff-and-relay-live",
    name: "Live cutoff-and-relay team read",
    category: "team-defense",
    positions: ["LF", "CF", "RF", "SS", "2B", "1B", "3B", "C"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 15,
    players: "Full defense",
    space: "Full field",
    equipment: ["balls", "bases"],
    setup: "Defense sets in normal positions; coach hits or throws balls to the outfield with a baserunning situation announced.",
    instructions: [
      "Coach announces the runner situation before the hit (e.g. 'runner on second, ball to left').",
      "Outfielder fields and hits the cutoff; infielders not involved in the relay call out the base to throw to.",
      "Rotate the hit location and runner situation each round so every position sees multiple relay roles.",
    ],
    scenarioCategory: "relay",
    coachingCue: "Everyone not touching the ball has a job — cover a base or call the play.",
  },
  {
    id: "d-team-bunt-coverage",
    name: "Bunt defense team coverage",
    category: "team-defense",
    positions: ["P", "C", "1B", "3B", "SS", "2B"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 15,
    players: "Full infield plus pitcher and catcher",
    space: "Infield",
    equipment: ["balls", "bases"],
    setup: "Infield in bunt-defense alignment (corners in, middle infielders covering) with a coach or player bunting.",
    instructions: [
      "On the bunt, pitcher and corners charge; whichever fielder is closest fields it while the others call out the target base.",
      "Shortstop covers third and second baseman covers first when the corners are charging — call this out loud every rep.",
      "Repeat with runners on first, then first and second, so coverage responsibilities change realistically.",
    ],
    scenarioCategory: "cover",
    coachingCue: "Charge under control — a bunt fielded off-balance beats a fast fielder who can't throw.",
  },
  {
    id: "d-team-pfp",
    name: "Pitcher fielding practice (PFP) circuit",
    category: "team-defense",
    positions: ["P", "1B", "C"],
    ageBands: ["9U", "10U", "11U", "12U"],
    durationMinutes: 12,
    players: "Pitchers rotate through, 1B and C as needed",
    space: "Mound area and first base",
    equipment: ["balls", "bases"],
    setup: "Pitcher on the mound (or simulated mound); coach hits or rolls comebackers and slow rollers toward first.",
    instructions: [
      "Pitcher fields comebackers, squares to first, and makes a firm chest-high throw.",
      "On balls hit to the first baseman, pitcher sprints to cover first, receiving the throw with a foot on the inside edge of the bag.",
      "Rotate every 4-5 reps; every pitcher on the roster gets both looks.",
    ],
    scenarioCategory: "cover",
    coachingCue: "Cover first like you mean it, every single time the ball goes that way.",
  },
  {
    id: "d-team-run-down",
    name: "Rundown execution",
    category: "team-defense",
    positions: ["1B", "2B", "3B", "SS", "P", "C"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 12,
    players: "2 fielders in the rundown, 1 runner, others backing up bases",
    space: "One basepath, e.g. between first and second",
    equipment: ["bases", "balls"],
    setup: "Runner caught between two bases; two fielders execute the rundown while teammates back up both ends.",
    instructions: [
      "Fielder with the ball runs the runner hard toward the other fielder, throwing only once the runner is committed.",
      "The fielder without the ball breaks toward the ball-holder's base only after the throw is released, not before.",
      "Backup players line up behind each base in case of an overthrow.",
    ],
    scenarioCategory: "backup",
    coachingCue: "Run the runner down, don't throw it across — fewer throws means fewer chances to miss.",
  },
  {
    id: "d-team-overthrow-recovery",
    name: "Overthrow rotation and recovery",
    category: "team-defense",
    positions: ["1B", "2B", "3B", "SS", "C", "P", "LF", "CF", "RF"],
    ageBands: ["10U", "11U", "12U"],
    durationMinutes: 12,
    players: "Full defense",
    space: "Full field",
    equipment: ["balls", "bases"],
    setup: "Defense set in normal positions; coach hits a ball and calls 'overthrow' partway through the play to force a live recovery.",
    instructions: [
      "The player who was backing up the intended throw sprints to field the overthrown ball immediately.",
      "Every other fielder rotates to cover the base that's now uncovered because a teammate left it to chase the ball.",
      "After each rep, talk through who covered what and why, so the rotation becomes automatic.",
    ],
    scenarioCategory: "miss-recovery",
    coachingCue: "A miss isn't one player's problem — the whole defense has a job when the ball gets away.",
  },
  {
    id: "d-team-first-and-third-defense",
    name: "First-and-third defensive options",
    category: "team-defense",
    positions: ["P", "C", "1B", "2B", "3B", "SS"],
    ageBands: ["11U", "12U"],
    durationMinutes: 15,
    players: "Full infield, pitcher, catcher, 2 baserunners",
    space: "Infield",
    equipment: ["balls", "bases"],
    setup: "Runners on first and third; defense in a called first-and-third scheme (e.g. throw through to second, hold, or fake-and-check).",
    instructions: [
      "Coach or catcher calls the defensive scheme before the pitch.",
      "On the steal attempt, defense executes the called play, keeping an eye on the runner at third at all times.",
      "Run each scheme several times so players recognize their job without hesitation.",
    ],
    scenarioCategory: "cover",
    coachingCue: "Know the call before the pitch — hesitation is what gives up the run at third.",
  },
  {
    id: "d-team-communication-walkthrough",
    name: "Communication walkthrough (no ball)",
    category: "team-defense",
    positions: ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"],
    ageBands: ["8U", "9U", "10U"],
    durationMinutes: 8,
    players: "Full defense",
    space: "Full field",
    equipment: ["none"],
    setup: "Defense in normal positions; no ball is used, just verbal reps.",
    instructions: [
      "Coach calls out a situation (e.g. 'ball hit to right field, runner on first').",
      "Every player calls out their job out loud — who covers, who backs up, who cuts off — without actually moving the ball.",
      "Great as a quick warmup or a rain-delay activity to build the mental map before live reps.",
    ],
    coachingCue: "If you can't say your job out loud, you won't do it right when the ball's live.",
  },
];

export function getDrill(id: string): Drill | undefined {
  return DRILLS.find((d) => d.id === id);
}

export function drillsByCategory(category: DrillCategory): Drill[] {
  return DRILLS.filter((d) => d.category === category);
}

export function drillsForPosition(position: FieldPosition): Drill[] {
  return DRILLS.filter((d) => d.positions.includes(position));
}

export function drillsForAgeBand(ageBand: AgeBand): Drill[] {
  return DRILLS.filter((d) => d.ageBands.includes(ageBand));
}
