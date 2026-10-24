import { ChessKnight, CircleDot, RectangleVertical, Satellite, type LucideIcon } from "lucide-react";
import { loadDotsGame } from "./dots/storage";
import { loadStarBattleGame } from "./starbattle/storage";
import { loadChessGame } from "./chess/storage";
import { loadDominoesGame } from "./dominoes/storage";

// What the lobby and the invite dialog show for each game in the engine's
// registry: an icon and the keys of its name and summary, the ways it can be
// played, and whether a local game of it is in progress on this device. A game
// without an entry here is not offered, whatever the engine knows.
export type GameNameKey = "games.dots.name" | "games.starbattle.name" | "games.chess.name" | "games.dominoes.name";
export type GameSummaryKey = "games.dots.summary" | "games.starbattle.summary" | "games.chess.summary" | "games.dominoes.summary";

/** Against the computer, two people at one screen, two people online. */
export type GameMode = "computer" | "local" | "online";

export interface CatalogEntry {
  icon: LucideIcon;
  name: GameNameKey;
  summary: GameSummaryKey;
  modes: GameMode[];
  /** The lobby calls the game new until this day (YYYY-MM-DD). */
  newUntil?: string;
  /** A way into the game besides a game of it (Chess puzzles): its label and address under /games. */
  extra?: { label: "lobby.puzzles"; path: string };
  inProgress: () => boolean;
}

export const CATALOG: Record<string, CatalogEntry> = {
  dots: {
    icon: CircleDot,
    name: "games.dots.name",
    summary: "games.dots.summary",
    modes: ["computer", "local", "online"],
    inProgress: () => loadDotsGame()?.state.status.kind === "playing"
  },
  starbattle: {
    icon: Satellite,
    name: "games.starbattle.name",
    summary: "games.starbattle.summary",
    // Two fleets hidden on one screen would be no game: no hot seat.
    modes: ["computer", "online"],
    inProgress: () => loadStarBattleGame()?.state.status.kind === "playing"
  },
  chess: {
    icon: ChessKnight,
    name: "games.chess.name",
    summary: "games.chess.summary",
    modes: ["computer", "local", "online"],
    newUntil: "2026-11-23",
    extra: { label: "lobby.puzzles", path: "chess/puzzles" },
    inProgress: () => loadChessGame()?.state.status.kind === "playing"
  },
  dominoes: {
    icon: RectangleVertical,
    name: "games.dominoes.name",
    summary: "games.dominoes.summary",
    // Hands are hidden, so no hot seat; online play comes with the server's seed.
    modes: ["computer"],
    newUntil: "2026-11-24",
    inProgress: () => loadDominoesGame()?.state.status.kind === "playing"
  }
};

export function isNew(entry: CatalogEntry, today = new Date()): boolean {
  return entry.newUntil !== undefined && today.toISOString().slice(0, 10) < entry.newUntil;
}
