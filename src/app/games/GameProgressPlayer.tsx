"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { setGameProgressPlayer } from "@/lib/gameStorage";

// Sets the per-kid progress context for /games from the ?player=<id> param a
// parent arrives with (from the family view's "Play as [Kid]" link). Once set,
// it persists in sessionStorage across the sub-game routes until the tab
// closes. Coaches / kids with no parent context never carry the param, so this
// is inert for them and localStorage stays the only store.
export default function GameProgressPlayer() {
  const params = useSearchParams();
  useEffect(() => {
    const player = params.get("player");
    // Only ever SET from an explicit param; never clear here, so navigating to
    // a sub-game (which drops the query) keeps the parent's selection.
    if (player) setGameProgressPlayer(player);
  }, [params]);
  return null;
}
