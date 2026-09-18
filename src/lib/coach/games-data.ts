import type { Game } from "@/lib/coach/types";

let games: Game[] = [];

/**
 * Initialize games data from database
 */
export async function initGamesData() {
  const res = await fetch("/api/coach/games");
  if (res.ok) {
    const data = await res.json();
    if (data.ok && data.games) {
      games = data.games;
    }
  }
}

/**
 * Get all games
 */
export function getAllGames() {
  return games;
}

/**
 * Get a game by ID
 */
export function getGame(gameId: string) {
  return games.find(g => g.id === gameId);
}

/**
 * Get all game labels
 */
export function getAllGameLabels() {
  return games.map(g => g.label);
}

/**
 * Check if a game exists
 */
export function hasGame(gameId: string) {
  return games.some(g => g.id === gameId);
}
