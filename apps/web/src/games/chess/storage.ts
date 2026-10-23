import { Chess, type AiLevel, type ChessMove, type ChessState, type PlayerIndex } from "@isputnik/games-engine";
import { newGameKey } from "../../shared/gameKey";

// The game in progress on this device, so a refresh or a locked phone does not
// lose it. Only the setup and the move list are stored; the position is replayed
// through the rules on load, so a stored game can never disagree with them.
const KEY = "isputnik-games.chess.local";
const SETUP_KEY = "isputnik-games.chess.setup";

export type ChessMode = "computer" | "local";

export interface ChessSetup {
  mode: ChessMode;
  /** Which seat the computer takes in computer mode: 1 when you play White. */
  computerPlays: PlayerIndex;
  level: AiLevel;
}

export interface SavedChessGame {
  setup: ChessSetup;
  /** The game's own id (shared/gameKey); a save from before 0.12.0 has none. */
  key?: string;
  moves: ChessMove[];
  finished: null | { reason: "agreed" | "resigned"; resigning?: PlayerIndex };
}

export interface LoadedChessGame {
  setup: ChessSetup;
  key: string;
  state: ChessState;
}

export const DEFAULT_SETUP: ChessSetup = { mode: "computer", computerPlays: 1, level: "normal" };

function isSetup(value: unknown): value is ChessSetup {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (s.mode === "computer" || s.mode === "local")
    && (s.computerPlays === 0 || s.computerPlays === 1)
    && (s.level === "easy" || s.level === "normal" || s.level === "hard");
}

/** A save's key, or a new one for a save from before games had keys. */
function savedKey(key: unknown): string {
  return typeof key === "string" && key.length >= 8 ? key : newGameKey();
}

export function loadChessGame(): LoadedChessGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedChessGame>;
    if (!isSetup(saved.setup) || !Array.isArray(saved.moves)) return null;
    let state = Chess.replay(saved.moves.map((move) => Chess.parseMove(move)));
    if (saved.finished) state = Chess.finish(state, saved.finished.reason, saved.finished.resigning);
    return { setup: saved.setup, key: savedKey(saved.key), state };
  } catch {
    return null;
  }
}

export function saveChessGame(game: LoadedChessGame): void {
  const status = game.state.status;
  const finished = status.kind === "finished" && (status.reason === "agreed" || status.reason === "resigned")
    ? { reason: status.reason, resigning: status.winner === null ? undefined : (status.winner === 0 ? 1 : 0) as PlayerIndex }
    : null;
  const saved: SavedChessGame = { setup: game.setup, key: game.key, moves: game.state.moves, finished };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private mode or full */
  }
}

export function clearChessGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

/** The last settings used, so "New game" starts where the player left off. */
export function loadChessSetup(): ChessSetup {
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

export function saveChessSetup(setup: ChessSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    /* private mode */
  }
}
