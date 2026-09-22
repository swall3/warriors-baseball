import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sharedReport,
  historicalReports,
  mergeReportGames,
} from "../src/lib/coach/reports.ts";
test("unified contact reports respect undo, inning side, and missing context", () => {
  const config = {
    teamName: "Warriors",
    opponent: "Visitors",
    date: "2026-09-22",
    usAreHome: true,
    roster: [],
  };
  const game = {
    id: "g1",
    config,
    status: "final",
    pitchers: {},
    pitchCounts: {},
    score: { us: 2, them: 1 },
  };
  const before = {
    config,
    half: "top",
    inning: 2,
    pending: { batter: { name: "Batter" } },
    pitchers: {},
  };
  const rows = [
    {
      id: "a",
      command: { type: "result", zone: "LF", result: "single" },
      before_state: before,
    },
    {
      id: "b",
      command: { type: "result", zone: "RF", result: "double" },
      before_state: before,
    },
    { id: "c", command: { type: "undo", targetId: "b" } },
    {
      id: "d",
      command: { type: "result", zone: "SS", result: "out" },
      before_state: null,
    },
  ];
  const report = sharedReport(game, rows);
  assert.equal(report.pinCount, 1);
  assert.equal(report.pins[0].battingTeam, "them");
  assert.equal(report.pins[0].zone, "left_field");
  assert.equal(report.pins[0].inning, 2);
  assert.equal(report.missingContext, 1);
  assert.match(report.href, /live/);
  assert.equal(report.id, "shared:g1");
});
test("server historical copies replace device duplicates without hiding shared games", () => {
  const result = mergeReportGames(
    [{ id: "same", label: "stale" }, { id: "unsynced" }],
    [
      { id: "historical:same", sourceId: "same", source: "historical" },
      { id: "shared:same", sourceId: "same", source: "shared" },
    ],
  );
  assert.equal(result.length, 3);
  assert.ok(!result.some((g) => g.label === "stale"));
});
test("historical contacts keep source identity and exclude pitch events", () => {
  const db = {
    teams: [{ id: "t", name: "Opponent" }],
    games: [{ id: "g", clientGameId: "client", opponentTeamId: "t" }],
    playEvents: [
      { id: "p", gameId: "g", eventType: "pitch" },
      { id: "c", gameId: "g", eventType: "ball_in_play", eventIndex: 1 },
    ],
  };
  const report = historicalReports(db)[0];
  assert.equal(report.pinCount, 1);
  assert.equal(report.sourceId, "client");
  assert.equal(report.id, "historical:client");
});

test("walks and strikeouts contribute once to batting reports, not contact locations",()=>{
 const config={teamName:"Warriors",opponent:"Visitors",date:"2026-09-22",usAreHome:false,format:"kid_pitch",roster:[{id:"p",name:"Player"}],order:["p"],opponentOrder:[]};
 const game={id:"g",config,status:"live",pitchers:{},pitchCounts:{},score:{us:0,them:0}};
 const before={config,half:"top",inning:1,balls:3,strikes:2,pitchers:{},battingIndex:{us:0,them:0}};
 const rows=[{id:"ball",command:{type:"pitch",outcome:"ball"},before_state:before},{id:"foul",command:{type:"pitch",outcome:"foul"},before_state:before},{id:"strike",command:{type:"pitch",outcome:"called_strike"},before_state:before}];
 const report=sharedReport(game,rows);assert.deepEqual(report.pins.map(p=>p.result),["walk","strikeout"]);assert.ok(report.pins.every(p=>p.batter==="Player"));
});
