import { Disc3, ChessKnight, CircleDot, Orbit, RectangleVertical, Satellite, Ship, type LucideIcon } from "lucide-react";
import { ARCADE_GAMES, GAMES } from "@isputnik/games-engine";
import { loadDotsGame } from "./dots/storage";
import { loadStarBattleGame } from "./starbattle/storage";
import { loadChessGame } from "./chess/storage";
import { loadDominoesGame } from "./dominoes/storage";

import { loadCheckersGame } from "./checkers/storage";

// What the lobby and the invite dialog show for each game in the engine's
// registries: an icon and the keys of its name and summary, the ways it can be
// played, and whether a local game of it is in progress on this device. A game
// without an entry here is not offered, whatever the engine knows.
export type GameNameKey = "games.checkers.name" | "games.dots.name" | "games.starbattle.name" | "games.chess.name" | "games.dominoes.name" | "games.sputnik.name" | "games.torpedo.name";
export type GameSummaryKey = "games.checkers.summary" | "games.dots.summary" | "games.starbattle.summary" | "games.chess.summary" | "games.dominoes.summary" | "games.sputnik.summary" | "games.torpedo.summary";

/** Against the computer, two people at one screen, two people online, or an
 *  arcade game: one person against the clock. */
export type GameMode = "computer" | "local" | "online" | "arcade";

/** The lobby's games in order: the two-player ones, then the arcade. */
export const LOBBY_GAME_IDS: readonly string[] = [...GAMES, ...ARCADE_GAMES].map((game) => game.id);

export interface CatalogEntry {
  icon: LucideIcon;
  name: GameNameKey;
  summary: GameSummaryKey;
  modes: GameMode[];
  /** The lobby calls the game new until this day (YYYY-MM-DD). */
  newUntil?: string;
  inProgress: () => boolean;
}

export const CATALOG: Record<string, CatalogEntry> = {
  checkers: { icon: Disc3, name: "games.checkers.name", summary: "games.checkers.summary", modes: ["computer", "local", "online"], newUntil: "2026-11-29", inProgress: () => loadCheckersGame()?.state.status.kind === "playing" },
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
    inProgress: () => loadChessGame()?.state.status.kind === "playing"
  },
  dominoes: {
    icon: RectangleVertical,
    name: "games.dominoes.name",
    summary: "games.dominoes.summary",
    // Hands are hidden, so no hot seat.
    modes: ["computer", "online"],
    newUntil: "2026-11-24",
    inProgress: () => loadDominoesGame()?.state.status.kind === "playing"
  },
  sputnik: {
    icon: Orbit,
    name: "games.sputnik.name",
    summary: "games.sputnik.summary",
    modes: ["arcade"],
    newUntil: "2026-11-30",
    // A run is not kept between visits: the handheld starts afresh.
    inProgress: () => false
  },
  torpedo: {
    icon: Ship,
    name: "games.torpedo.name",
    summary: "games.torpedo.summary",
    modes: ["arcade"],
    newUntil: "2026-12-01",
    // Nor is a torpedo run: the periscope starts afresh.
    inProgress: () => false
  }
};

export function isNew(entry: CatalogEntry, today = new Date()): boolean {
  return entry.newUntil !== undefined && today.toISOString().slice(0, 10) < entry.newUntil;
}
