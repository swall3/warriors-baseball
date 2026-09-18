"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface GameEvent {
  batter: string;
  battingTeam: "outlaws" | "opponent";
  result: "single" | "double" | "triple" | "home_run" | "out" | "error" | "fielders_choice" | "strikeout" | "walk" | "foul";
  zone: string;
  x: number;
  y: number;
  inning: number;
}

const DEFAULT_BATTERS = ["#00", "#3", "#6", "#11", "#15", "#18", "#20", "#22", "#31", "#41", "#99"];
const ZONE_COORDS: Record<string, { x: number; y: number }> = {
  left_field: { x: 18, y: 30 },
  left_center: { x: 36, y: 24 },
  center_field: { x: 50, y: 22 },
  right_center: { x: 64, y: 24 },
  right_field: { x: 82, y: 30 },
  third_base: { x: 32, y: 62 },
  shortstop: { x: 42, y: 54 },
  second_base: { x: 58, y: 54 },
  first_base: { x: 68, y: 62 },
  pitcher_zone: { x: 50, y: 65 },
  catcher_zone: { x: 50, y: 83 },
};

export default function GameImportPage() {
  const router = useRouter();
  const [currentGameId, setCurrentGameId] = useState<string>("");
  const [gameLabel, setGameLabel] = useState<string>("");
  const [gameDate, setGameDate] = useState<string>("");
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [outlawsRuns, setOutlawsRuns] = useState<number>(0);
  const [opponentRuns, setOpponentRuns] = useState<number>(0);
  const [opponentTeamName, setOpponentTeamName] = useState<string>("Opponents");
  const [batters, setBatters] = useState<string[]>(DEFAULT_BATTERS);
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);

  // Load existing game IDs
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const HISTORY_KEY = "outlaws-field-app:games:v1";

    const loadExistingGames = async () => {
      try {
        const rawHistory = window.localStorage.getItem(HISTORY_KEY);
        const rawCurrent = window.localStorage.getItem("outlaws-field-app:v1");

        const storedGames = rawHistory ? (JSON.parse(rawHistory) as Array<{ id?: string; label?: string; opponentTeamName?: string; pins?: unknown[] }>) : [];
        const existingIds = storedGames.filter((g) => g.pins && Array.isArray(g.pins) && g.id).map((g) => g.id as string);
        const current = rawCurrent ? JSON.parse(rawCurrent) as { outlawsLineup?: string[]; opponentsLineup?: string[]; opponentTeamName?: string } : null;
        const loadedBatters = [
          ...(Array.isArray(current?.outlawsLineup) ? current.outlawsLineup : []),
          ...(Array.isArray(current?.opponentsLineup) ? current.opponentsLineup : []),
        ].filter(Boolean);
        if (loadedBatters.length > 0) setBatters(Array.from(new Set(loadedBatters)));
        if (current?.opponentTeamName) setOpponentTeamName(current.opponentTeamName);
        
        if (existingIds.length > 0) {
          setCurrentGameId(existingIds[0]);
          setGameLabel(storedGames.find((g) => g.id === existingIds[0])?.label || "");
          setOpponentTeamName(storedGames.find((g) => g.id === existingIds[0])?.opponentTeamName || "Opponents");
        }
      } catch (error) {
        console.error("Failed to load existing games:", error);
      }
    };

    loadExistingGames();
  }, []);

  const handleAddEvent = () => {
    const zone = "center_field";
    setEvents([...events, {
      batter: batters[batters.length - 1] || "#00",
      battingTeam: "opponent",
      result: "single",
      zone,
      x: ZONE_COORDS[zone].x,
      y: ZONE_COORDS[zone].y,
      inning: 1,
    }]);
  };

  const handleRemoveEvent = (index: number) => {
    setEvents(events.filter((_, i) => i !== index));
  };

  const handleUpdateEvent = (index: number, field: keyof GameEvent, value: string | number) => {
    setEvents(events.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const handleSync = async () => {
    const syncGameId = currentGameId || `import-${Date.now()}`;
    const syncDate = gameDate ? new Date(`${gameDate}T12:00:00`).toISOString() : new Date().toISOString();

    setLoading(true);
    try {
      const response = await fetch("/api/coach/sync/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: {
            id: syncGameId,
            label: gameLabel || `${syncDate.slice(0, 10)} vs ${opponentTeamName}`,
            date: syncDate,
            opponentTeamName,
            score: { outlaws: outlawsRuns, opponents: opponentRuns },
            schemaVersion: 2,
            pins: events.map(e => ({
              id: events.indexOf(e),
              batter: e.batter,
              battingTeam: e.battingTeam,
              result: e.result,
              zone: e.zone,
              x: e.x,
              y: e.y,
              inning: e.inning,
            }))
          }
        })
      });

      const result = await response.json();
      if (result.ok) {
        setSynced(true);
        alert(`✅ Synced ${result.syncedEvents} events to ${gameLabel}`);
        
        // Reset form
        setEvents([]);
        setOutlawsRuns(0);
        setOpponentRuns(0);
        setTimeout(() => setSynced(false), 2000);
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Sync error:", error);
      alert("Failed to sync game");
    } finally {
      setLoading(false);
    }
  };

  if (typeof window === "undefined") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <p className="text-xl font-bold text-cyan-100">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-4xl gap-4 p-4 lg:grid-cols-4">
      {/* Left Sidebar - Team Selection */}
      <aside className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-900/78 p-4 shadow-2xl">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Opponent</p>
          <h1 className="text-2xl font-black tracking-tight">Team</h1>
        </header>
        
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setOpponentTeamName("Oregon Park Wahoos")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold text-center touch-manipulation active:scale-95 ${opponentTeamName === "Oregon Park Wahoos" ? "border-cyan-300 bg-cyan-400 text-slate-900" : "border-slate-600 bg-slate-800 text-slate-400"}`}
          >
            Wahoos
          </button>
          <button
            onClick={() => setOpponentTeamName("NYO Bucks")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold text-center touch-manipulation active:scale-95 ${opponentTeamName === "NYO Bucks" ? "border-cyan-300 bg-cyan-400 text-slate-900" : "border-slate-600 bg-slate-800 text-slate-400"}`}
          >
            Bucks
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <label className="mb-2 block text-xs font-bold uppercase text-slate-400">Opponent Name</label>
          <input
            type="text"
            value={opponentTeamName}
            onChange={(e) => setOpponentTeamName(e.target.value)}
            placeholder="Ex: Oregon Park Wahoos"
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-300 focus:outline-none"
          />
        </div>

        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <label className="mb-2 block text-xs font-bold uppercase text-slate-400">Game Label</label>
          <input
            type="text"
            value={gameLabel}
            onChange={(e) => setGameLabel(e.target.value)}
            placeholder="Ex: May 15 vs Wahoos"
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-300 focus:outline-none"
          />
        </div>

        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
          <label className="mb-2 block text-xs font-bold uppercase text-slate-400">Date</label>
          <input
            type="date"
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-300 focus:outline-none"
          />
        </div>

        <div className="mt-3 space-y-3">
          <div className="flex justify-between">
            <label className="text-xs font-bold text-slate-400">Outlaws Runs</label>
            <input
              type="number"
              min="0"
              value={outlawsRuns}
              onChange={(e) => setOutlawsRuns(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-center text-sm text-white focus:border-cyan-300 focus:outline-none"
            />
          </div>
          <div className="flex justify-between">
            <label className="text-xs font-bold text-slate-400">Opponent Runs</label>
            <input
              type="number"
              min="0"
              value={opponentRuns}
              onChange={(e) => setOpponentRuns(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-center text-sm text-white focus:border-cyan-300 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-3">
          <button
            onClick={() => router.push("/coach/dashboard")}
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700"
          >
            Back to Dashboard
          </button>
        </div>
      </aside>

      {/* Main Content - Game Events */}
      <main className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-900/78 p-4 shadow-2xl lg:col-span-3">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Game Events</p>
            <h1 className="text-2xl font-black tracking-tight">{currentGameId.startsWith("current") ? gameLabel || "Current Game" : `#${currentGameId.replace('current-game-', '').replace('game-', '').replace('outlaws-','').replace('-woohoos', '')}`}</h1>
          </div>
          <button
            onClick={() => router.push("/coach/dashboard")}
            className="rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/30"
          >
            Cancel
          </button>
        </header>

        {/* Add Event Button */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={handleAddEvent}
            className="flex items-center gap-2 rounded-lg border border-cyan-300/50 bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Event
          </button>
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event, index) => (
            <div key={index} className="rounded-lg border border-slate-600 bg-slate-800/50 p-3">
              <div className="mb-2 flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-slate-400">Batter</span>
                <button
                  onClick={() => handleRemoveEvent(index)}
                  className="rounded-full bg-rose-500/20 px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-500/30"
                >
                  ×
                </button>
              </div>
              
              <div className="mb-2">
                <label className="mb-1 block text-xs text-slate-400">Team Batting</label>
                <select
                  value={event.battingTeam}
                  onChange={(e) => handleUpdateEvent(index, "battingTeam", e.target.value)}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
                >
                  <option value="opponent">{opponentTeamName}</option>
                  <option value="outlaws">Outlaws</option>
                </select>
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-xs text-slate-400">Inning</label>
                <input
                  type="number"
                  min="1"
                  value={event.inning}
                  onChange={(e) => handleUpdateEvent(index, "inning", Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
                />
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-xs text-slate-400">Batter</label>
                <select
                  value={event.batter}
                  onChange={(e) => handleUpdateEvent(index, "batter", e.target.value)}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
                >
                  {batters.map((batter) => (
                    <option key={batter} value={batter}>{batter}</option>
                  ))}
                </select>
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-xs text-slate-400">Result</label>
                <select
                  value={event.result}
                  onChange={(e) => handleUpdateEvent(index, "result", e.target.value)}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
                >
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="triple">Triple</option>
                  <option value="home_run">Home Run</option>
                  <option value="out">Out</option>
                  <option value="error">Error</option>
                  <option value="fielders_choice">Fielder&apos;s Choice</option>
                  <option value="strikeout">Strikeout</option>
                  <option value="walk">Walk</option>
                  <option value="foul">Foul</option>
                </select>
              </div>

              <div className="mb-2">
                <label className="mb-1 block text-xs text-slate-400">Zone</label>
                <select
                  value={event.zone}
                  onChange={(e) => handleUpdateEvent(index, "zone", e.target.value)}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
                >
                  <option value="center_field">Center Field</option>
                  <option value="left_field">Left Field</option>
                  <option value="right_field">Right Field</option>
                  <option value="left_center">Left Center</option>
                  <option value="right_center">Right Center</option>
                  <option value="third_base">Third Base</option>
                  <option value="second_base">Second Base</option>
                  <option value="first_base">First Base</option>
                  <option value="shortstop">Shortstop</option>
                  <option value="pitcher_zone">Pitcher</option>
                  <option value="catcher_zone">Catcher</option>
                </select>
              </div>

              <button
                type="button"
                className="mb-2 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                onClick={() => {
                  const coords = ZONE_COORDS[event.zone] || ZONE_COORDS.center_field;
                  handleUpdateEvent(index, "x", coords.x);
                  handleUpdateEvent(index, "y", coords.y);
                }}
              >
                Use Zone Coordinates
              </button>

              {event.result !== "strikeout" && event.result !== "walk" && event.result !== "foul" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">X Position</label>
                    <input
                      type="number"
                      value={event.x}
                      onChange={(e) => handleUpdateEvent(index, "x", Number(e.target.value))}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Y Position</label>
                    <input
                      type="number"
                      value={event.y}
                      onChange={(e) => handleUpdateEvent(index, "y", Number(e.target.value))}
                      className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white focus:border-cyan-300 focus:outline-none"
                    />
                  </div>
                </div>
              )}
              
              <div className="mt-2 flex justify-between items-center text-xs">
                <span className="text-slate-400">{event.result}</span>
                <span className="text-slate-500">{event.zone}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Sync Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSync}
            disabled={loading || events.length === 0}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold touch-manipulation active:scale-95 ${events.length > 0 ? "border-cyan-300 bg-cyan-500 text-slate-900 hover:bg-cyan-400" : "border-slate-600 bg-slate-800 text-slate-400"}`}
          >
            {loading ? "Syncing..." : synced ? "✅ Synced!" : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Sync Game
              </>
            )}
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
          <p className="text-xs text-slate-400">
            <strong>Instructions:</strong> Add each play as an event. Fill in the batter, result, zone, and coordinates if applicable. Click &quot;Add Event&quot; for each play. When done, click &quot;Sync Game&quot; to save to the database.
          </p>
        </div>
      </main>
    </div>
  );
}
