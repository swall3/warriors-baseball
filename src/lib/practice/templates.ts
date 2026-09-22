// Suggested practice-plan templates (Decision 2). Preloaded, code-shipped
// content — same posture as drills.ts and bundles.ts. Coaches clone one of
// these into a team-owned practice_plans row (src/lib/practice/plans.ts) or
// build a plan from scratch; the template itself never changes.
//
// A template is a named list of blocks ("stations") — a label, a planned
// duration, and the drill ids that run during that block. This mirrors the
// deep dive's P1 practice-execution shape (saved plan → stations → planned
// duration → equipment checklist) without building the run/execution mode,
// which is explicitly out of MVP scope (see PRACTICE-ASSIGNMENT-AND-DRILLS.md
// Decision 2 and docs/DUGOUT-MASTER-DEEP-DIVE.md's P1 row).
import { DRILLS, type AgeBand, type Drill } from "./drills.ts";

export type PracticeBlock = {
  id: string;
  label: string;
  durationMinutes: number;
  drillIds: string[];
};

export type PracticeTemplate = {
  id: string;
  name: string;
  description: string;
  ageBands: AgeBand[];
  blocks: PracticeBlock[];
};

export const PRACTICE_TEMPLATES: PracticeTemplate[] = [
  {
    id: "tpl-90-infield-fundamentals",
    name: "90-minute infield fundamentals",
    description:
      "A full infield-focused session: arm care, individual reactions, and a live team-defense finish.",
    ageBands: ["10U", "11U", "12U"],
    blocks: [
      {
        id: "blk-arm-care",
        label: "Arm care warmup",
        durationMinutes: 10,
        drillIds: ["d-throwing-arm-care-warmup"],
      },
      {
        id: "blk-individual-infield",
        label: "Individual infield reps",
        durationMinutes: 30,
        drillIds: [
          "d-infield-forehand-shuffle",
          "d-infield-backhand-drop-step",
          "d-infield-slow-roller-charge",
        ],
      },
      {
        id: "blk-double-plays",
        label: "Double-play work",
        durationMinutes: 20,
        drillIds: ["d-infield-double-play-pivot", "d-throwing-crossover-footwork"],
      },
      {
        id: "blk-live-defense",
        label: "Live team defense",
        durationMinutes: 30,
        drillIds: ["d-team-pfp", "d-team-overthrow-recovery"],
      },
    ],
  },
  {
    id: "tpl-pregame-day",
    name: "Pre-game day",
    description:
      "Short, sharp, and low-fatigue — timing and communication the day before or the morning of a game.",
    ageBands: ["9U", "10U", "11U", "12U"],
    blocks: [
      {
        id: "blk-warmup",
        label: "Arm care warmup",
        durationMinutes: 8,
        drillIds: ["d-throwing-arm-care-warmup"],
      },
      {
        id: "blk-timing",
        label: "Hitting timing",
        durationMinutes: 15,
        drillIds: ["d-hitting-front-toss-timing"],
      },
      {
        id: "blk-comm",
        label: "Communication walkthrough",
        durationMinutes: 8,
        drillIds: ["d-team-communication-walkthrough"],
      },
      {
        id: "blk-sharp-defense",
        label: "Sharp defensive reps",
        durationMinutes: 12,
        drillIds: ["d-infield-5-star", "d-outfield-drop-step-read"],
      },
    ],
  },
  {
    id: "tpl-first-practice-of-season",
    name: "First practice of the season",
    description:
      "Introduce arm-care habits, basic fielding stances, sliding technique, and team communication for a group just getting started together.",
    ageBands: ["8U", "9U", "10U"],
    blocks: [
      {
        id: "blk-arm-care",
        label: "Arm care warmup",
        durationMinutes: 10,
        drillIds: ["d-throwing-arm-care-warmup"],
      },
      {
        id: "blk-fielding-basics",
        label: "Fielding basics stations",
        durationMinutes: 20,
        drillIds: ["d-infield-forehand-shuffle", "d-outfield-drop-step-read"],
      },
      {
        id: "blk-hitting-basics",
        label: "Tee hitting basics",
        durationMinutes: 20,
        drillIds: ["d-hitting-tee-load", "d-hitting-two-hand-drill"],
      },
      {
        id: "blk-sliding",
        label: "Sliding technique",
        durationMinutes: 10,
        drillIds: ["d-baserunning-sliding-technique"],
      },
      {
        id: "blk-comm",
        label: "Team communication walkthrough",
        durationMinutes: 10,
        drillIds: ["d-team-communication-walkthrough"],
      },
    ],
  },
  {
    id: "tpl-outfield-focus",
    name: "60-minute outfield focus",
    description: "Reads, communication, and throwing mechanics for the outfield group.",
    ageBands: ["10U", "11U", "12U"],
    blocks: [
      {
        id: "blk-oa-warmup",
        label: "Arm care warmup",
        durationMinutes: 8,
        drillIds: ["d-throwing-arm-care-warmup"],
      },
      {
        id: "blk-reads",
        label: "Fly-ball reads",
        durationMinutes: 15,
        drillIds: ["d-outfield-drop-step-read", "d-outfield-sun-drop-recovery"],
      },
      {
        id: "blk-gaps",
        label: "Gap communication",
        durationMinutes: 15,
        drillIds: ["d-outfield-gap-communication"],
      },
      {
        id: "blk-relay",
        label: "Cutoff and relay",
        durationMinutes: 22,
        drillIds: ["d-outfield-cutoff-relay", "d-outfield-crow-hop-throw"],
      },
    ],
  },
  {
    id: "tpl-hitting-heavy",
    name: "75-minute hitting-heavy session",
    description: "Multiple hitting stations rotating small groups through tee, soft toss, and live front toss.",
    ageBands: ["9U", "10U", "11U", "12U"],
    blocks: [
      {
        id: "blk-tee",
        label: "Tee station",
        durationMinutes: 20,
        drillIds: ["d-hitting-tee-load", "d-hitting-opposite-field"],
      },
      {
        id: "blk-soft-toss",
        label: "Soft toss station",
        durationMinutes: 20,
        drillIds: ["d-hitting-soft-toss-inside-out"],
      },
      {
        id: "blk-bunt",
        label: "Bunt mechanics station",
        durationMinutes: 15,
        drillIds: ["d-hitting-bunt-mechanics"],
      },
      {
        id: "blk-live-bp",
        label: "Live BP",
        durationMinutes: 20,
        drillIds: ["d-hitting-live-bp-approach"],
      },
    ],
  },
  {
    id: "tpl-baserunning-and-situations",
    name: "60-minute baserunning and situations",
    description: "Leads, tag-ups, first-to-third reads, and steal jumps in one focused session.",
    ageBands: ["10U", "11U", "12U"],
    blocks: [
      {
        id: "blk-leads",
        label: "Lead timing",
        durationMinutes: 12,
        drillIds: ["d-baserunning-primary-secondary-lead"],
      },
      {
        id: "blk-steal-jump",
        label: "Steal jump quickness",
        durationMinutes: 12,
        drillIds: ["d-baserunning-steal-jump"],
      },
      {
        id: "blk-tag-up",
        label: "Tag-up reads",
        durationMinutes: 18,
        drillIds: ["d-baserunning-tag-up"],
      },
      {
        id: "blk-first-third",
        label: "First-to-third reads",
        durationMinutes: 18,
        drillIds: ["d-baserunning-first-to-third"],
      },
    ],
  },
  {
    id: "tpl-bunt-and-small-ball",
    name: "50-minute bunt defense and small ball",
    description: "Team bunt coverage paired with the hitting side of bunting.",
    ageBands: ["10U", "11U", "12U"],
    blocks: [
      {
        id: "blk-bunt-hit",
        label: "Bunt mechanics (hitting)",
        durationMinutes: 15,
        drillIds: ["d-hitting-bunt-mechanics"],
      },
      {
        id: "blk-pfp",
        label: "Pitcher fielding practice",
        durationMinutes: 15,
        drillIds: ["d-team-pfp"],
      },
      {
        id: "blk-bunt-coverage",
        label: "Team bunt coverage",
        durationMinutes: 20,
        drillIds: ["d-team-bunt-coverage"],
      },
    ],
  },
  {
    id: "tpl-first-and-third-and-rundowns",
    name: "60-minute first-and-third and rundowns",
    description: "Advanced situational defense for older, more experienced groups.",
    ageBands: ["11U", "12U"],
    blocks: [
      {
        id: "blk-relay-decision",
        label: "Relay decision reps",
        durationMinutes: 15,
        drillIds: ["d-throwing-relay-priority"],
      },
      {
        id: "blk-first-third-d",
        label: "First-and-third defense",
        durationMinutes: 20,
        drillIds: ["d-team-first-and-third-defense"],
      },
      {
        id: "blk-rundown",
        label: "Rundown execution",
        durationMinutes: 15,
        drillIds: ["d-team-run-down"],
      },
      {
        id: "blk-overthrow",
        label: "Overthrow rotation",
        durationMinutes: 10,
        drillIds: ["d-team-overthrow-recovery"],
      },
    ],
  },
];

export function getPracticeTemplate(id: string): PracticeTemplate | undefined {
  return PRACTICE_TEMPLATES.find((t) => t.id === id);
}

export function templateDrills(template: PracticeTemplate): Drill[] {
  const ids = new Set(template.blocks.flatMap((b) => b.drillIds));
  return DRILLS.filter((d) => ids.has(d.id));
}
