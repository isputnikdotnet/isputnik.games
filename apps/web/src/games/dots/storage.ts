import { Dots, type AiLevel, type DotsMove, type DotsState, type PlayerIndex } from "@isputnik/games-engine";

// The game in progress on this device, so a refresh or a locked phone does not
// lose it. Only the setup and the move list are stored; the position is replayed
// through the rules on load, so a stored game can never disagree with them.
const KEY = "isputnik-games.dots.local";

export type DotsMode = "computer" | "local";

export interface DotsSetup {
  size: number;
  targetCaptures: number | null;
  mode: DotsMode;
  /** Which seat the computer takes in computer mode. */
  computerPlays: PlayerIndex;
  level: AiLevel;
}

export interface SavedDotsGame {
  setup: DotsSetup;
  moves: DotsMove[];
  finished: null | { reason: "agreed" | "resigned"; resigning?: PlayerIndex };
}

export interface LoadedDotsGame {
  setup: DotsSetup;
  state: DotsState;
}

export const DEFAULT_SETUP: DotsSetup = {
  size: 15,
  targetCaptures: null,
  mode: "computer",
  computerPlays: 1,
  level: "normal"
};

function isSetup(value: unknown): value is DotsSetup {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return typeof s.size === "number"
    && (s.targetCaptures === null || typeof s.targetCaptures === "number")
    && (s.mode === "computer" || s.mode === "local")
    && (s.computerPlays === 0 || s.computerPlays === 1)
    && (s.level === "easy" || s.level === "normal");
}

export function loadDotsGame(): LoadedDotsGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedDotsGame>;
    if (!isSetup(saved.setup) || !Array.isArray(saved.moves)) return null;
    let state = Dots.replay({ size: saved.setup.size, targetCaptures: saved.setup.targetCaptures }, saved.moves as DotsMove[]);
    if (saved.finished) state = Dots.finish(state, saved.finished.reason, saved.finished.resigning);
    return { setup: saved.setup, state };
  } catch {
    return null;
  }
}

export function saveDotsGame(game: LoadedDotsGame): void {
  const finished = game.state.status.kind === "finished" && (game.state.status.reason === "agreed" || game.state.status.reason === "resigned")
    ? { reason: game.state.status.reason }
    : null;
  const saved: SavedDotsGame = { setup: game.setup, moves: game.state.moves, finished };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private mode or full */
  }
}

export function clearDotsGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

const SETUP_KEY = "isputnik-games.dots.setup";

/** The last settings used, so "New game" starts where the player left off. */
export function loadDotsSetup(): DotsSetup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isSetup(parsed)) return parsed;
    }
  } catch {
    /* private mode */
  }
  return DEFAULT_SETUP;
}

export function saveDotsSetup(setup: DotsSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    /* private mode */
  }
}
