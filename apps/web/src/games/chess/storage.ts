import { Chess, type AiLevel, type ChessMove, type ChessState, type PlayerIndex, type PuzzleLevel, type PuzzleType } from "@isputnik/games-engine";
import { newGameKey } from "../../shared/gameKey";

// The game in progress on this device, so a refresh or a locked phone does not
// lose it. Only the setup and the move list are stored; the position is replayed
// through the rules on load, so a stored game can never disagree with them.
const KEY = "isputnik-games.chess.local";
const SETUP_KEY = "isputnik-games.chess.setup";
const PLAY_KEY = "isputnik-games.chess.play";
const PUZZLE_LEVEL_KEY = "isputnik-games.chess.puzzleLevel";
const PUZZLE_TYPE_KEY = "isputnik-games.chess.puzzleType";

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

/** How a game the rules did not end was ended (a draw agreed, a resignation), to replay it later. */
export function finishOf(state: ChessState): SavedChessGame["finished"] {
  const status = state.status;
  return status.kind === "finished" && (status.reason === "agreed" || status.reason === "resigned")
    ? { reason: status.reason, resigning: status.winner === null ? undefined : (status.winner === 0 ? 1 : 0) as PlayerIndex }
    : null;
}

export function saveChessGame(game: LoadedChessGame): void {
  const finished = finishOf(game.state);
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

/** What the Play form offers first: a game (its setup says which) or puzzles. */
export function loadPlaysPuzzles(): boolean {
  try {
    return localStorage.getItem(PLAY_KEY) === "puzzles";
  } catch {
    return false;
  }
}

export function savePlaysPuzzles(puzzles: boolean): void {
  try {
    if (puzzles) localStorage.setItem(PLAY_KEY, "puzzles");
    else localStorage.removeItem(PLAY_KEY);
  } catch {
    /* private mode */
  }
}

/** The puzzles asked for: a level ("auto" = near your rating) and a kind. */
export interface PuzzleChoice {
  level: PuzzleLevel | "auto";
  type: PuzzleType | "any";
}

export function loadPuzzleChoice(): PuzzleChoice {
  try {
    const level = localStorage.getItem(PUZZLE_LEVEL_KEY);
    const type = localStorage.getItem(PUZZLE_TYPE_KEY);
    return {
      level: level && (Chess.PUZZLE_LEVELS as readonly string[]).includes(level) ? (level as PuzzleLevel) : "auto",
      type: type && Chess.isPuzzleType(type) ? type : "any"
    };
  } catch {
    return { level: "auto", type: "any" };
  }
}

export function savePuzzleChoice(choice: PuzzleChoice): void {
  try {
    if (choice.level === "auto") localStorage.removeItem(PUZZLE_LEVEL_KEY);
    else localStorage.setItem(PUZZLE_LEVEL_KEY, choice.level);
    if (choice.type === "any") localStorage.removeItem(PUZZLE_TYPE_KEY);
    else localStorage.setItem(PUZZLE_TYPE_KEY, choice.type);
  } catch {
    /* private mode: the choice holds for this visit */
  }
}
