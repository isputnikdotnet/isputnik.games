import { Chess, parseTimeControl, type AiLevel, type ChessMove, type ChessState, type PlayerIndex, type PuzzleLevel, type PuzzleType, type TimeControl } from "@isputnik/games-engine";
import { newGameKey } from "../../shared/gameKey";

// The game in progress on this device, so a refresh or a locked phone does not
// lose it. Only the setup and the move list are stored; the position is replayed
// through the rules on load, so a stored game can never disagree with them.
const KEY = "isputnik-games.chess.local";
const SETUP_KEY = "isputnik-games.chess.setup";
const PLAY_KEY = "isputnik-games.chess.play";
const PUZZLE_LEVEL_KEY = "isputnik-games.chess.puzzleLevel";
const PUZZLE_TYPE_KEY = "isputnik-games.chess.puzzleType";
const SAVED_KEY = "isputnik-games.chess.saved";

/** How many put-aside games a device keeps; the oldest goes past this. */
export const SAVED_MAX = 20;

export type ChessMode = "computer" | "local";

export interface ChessSetup {
  mode: ChessMode;
  /** Which seat the computer takes in computer mode: 1 when you play White. */
  computerPlays: PlayerIndex;
  level: AiLevel;
  /** A clock (blitz), or null for a game at leisure. */
  clock: TimeControl | null;
  /** How the computer's strength was chosen: a named level, a strength picked
   *  on the 0-100 scale, or adaptive (the player's own rating, asked when the
   *  game starts). `level` stays the nearest named level, for results. */
  levelMode: LevelMode;
  /** The strength, 0-100, for custom and adaptive; null for a named level. */
  strength: number | null;
}

export type LevelMode = "level" | "custom" | "adaptive";

/** How a game the rules did not end was ended: a draw agreed, a resignation,
 *  or a clock run out — `resigning` is then the side that lost it. */
export interface ChessFinish {
  reason: "agreed" | "resigned" | "timeout";
  resigning?: PlayerIndex;
}

export interface SavedChessGame {
  setup: ChessSetup;
  /** The game's own id (shared/gameKey); a save from before 0.12.0 has none. */
  key?: string;
  moves: ChessMove[];
  /** How long each move took, in ms, for the clock; absent in a game without one. */
  spent?: number[];
  finished: null | ChessFinish;
}

export interface LoadedChessGame {
  setup: ChessSetup;
  key: string;
  state: ChessState;
  /** How long each move took, in ms (one per move). */
  spent: number[];
  /** When the move now awaited began (Date.now()); never stored — a reload
   *  starts it afresh, so the clock of a game on this device stops while the
   *  page is gone. */
  turnStartedAt: number;
}

export const DEFAULT_SETUP: ChessSetup = { mode: "computer", computerPlays: 1, level: "normal", clock: null, levelMode: "level", strength: null };

/** A stored setup, checked; one from before the clock gets none. */
function setupOf(value: unknown): ChessSetup | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const valid = (s.mode === "computer" || s.mode === "local")
    && (s.computerPlays === 0 || s.computerPlays === 1)
    && (s.level === "easy" || s.level === "normal" || s.level === "hard");
  if (!valid) return null;
  let clock: TimeControl | null = null;
  try {
    clock = parseTimeControl(s.clock);
  } catch {
    clock = null;
  }
  const strength = typeof s.strength === "number" && Number.isFinite(s.strength) ? Chess.clampStrength(s.strength) : null;
  const levelMode: LevelMode = (s.levelMode === "custom" || s.levelMode === "adaptive") && strength !== null ? s.levelMode : "level";
  return {
    mode: s.mode as ChessSetup["mode"],
    computerPlays: s.computerPlays as PlayerIndex,
    level: levelMode === "level" ? (s.level as AiLevel) : Chess.levelOfStrength(strength!),
    clock,
    levelMode,
    strength: levelMode === "level" ? null : strength
  };
}

/** A save's key, or a new one for a save from before games had keys. */
function savedKey(key: unknown): string {
  return typeof key === "string" && key.length >= 8 ? key : newGameKey();
}

export function loadChessGame(): LoadedChessGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return gameOf(JSON.parse(raw) as Partial<SavedChessGame>);
  } catch {
    return null;
  }
}

/** A stored game, replayed through the rules; null when it is not a game. */
function gameOf(saved: Partial<SavedChessGame>): LoadedChessGame | null {
  try {
    const setup = setupOf(saved.setup);
    if (!setup || !Array.isArray(saved.moves)) return null;
    let state = Chess.replay(saved.moves.map((move) => Chess.parseMove(move)));
    if (saved.finished?.reason === "timeout") state = Chess.timeout(state, saved.finished.resigning ?? state.toMove);
    else if (saved.finished) state = Chess.finish(state, saved.finished.reason, saved.finished.resigning);
    const spent = Array.isArray(saved.spent) && saved.spent.length === state.moves.length && saved.spent.every((ms) => typeof ms === "number" && ms >= 0)
      ? saved.spent
      : state.moves.map(() => 0);
    return { setup, key: savedKey(saved.key), state, spent, turnStartedAt: Date.now() };
  } catch {
    return null;
  }
}

/** How a game the rules did not end was ended (a draw agreed, a resignation,
 *  a clock run out), to replay it later. */
export function finishOf(state: ChessState): SavedChessGame["finished"] {
  const status = state.status;
  if (status.kind !== "finished") return null;
  // On time, the side that ran out is the side to move: no move was made.
  if (status.reason === "timeout") return { reason: "timeout", resigning: state.toMove };
  return status.reason === "agreed" || status.reason === "resigned"
    ? { reason: status.reason, resigning: status.winner === null ? undefined : (status.winner === 0 ? 1 : 0) as PlayerIndex }
    : null;
}

function storedOf(game: LoadedChessGame): SavedChessGame {
  const finished = finishOf(game.state);
  return { setup: game.setup, key: game.key, moves: game.state.moves, finished, ...(game.setup.clock ? { spent: game.spent } : {}) };
}

export function saveChessGame(game: LoadedChessGame): void {
  const saved = storedOf(game);
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private mode or full */
  }
}

// ── Games put aside ─────────────────────────────────────────────────────────
// "Save and leave" puts the game in progress on a shelf on this device, so
// another can be started; any of them is taken up again where it was left,
// its clock (if it has one) stopped meanwhile.

export interface ShelvedGame {
  id: string;
  savedAt: string;
  game: LoadedChessGame;
}

function readShelf(): { id: string; savedAt: string; game: SavedChessGame }[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.id === "string" && entry.game) : [];
  } catch {
    return [];
  }
}

function writeShelf(list: { id: string; savedAt: string; game: SavedChessGame }[]): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, SAVED_MAX)));
  } catch {
    /* private mode or full */
  }
}

/** The games put aside here, newest first; one that no longer replays is left out. */
export function listShelvedGames(): ShelvedGame[] {
  return readShelf().flatMap((entry) => {
    const game = gameOf(entry.game);
    return game && game.state.status.kind === "playing" ? [{ id: entry.id, savedAt: entry.savedAt, game }] : [];
  });
}

/** Puts a game in progress aside; answers its id on the shelf. */
export function shelveChessGame(game: LoadedChessGame, now = new Date()): string {
  const id = game.key;
  writeShelf([{ id, savedAt: now.toISOString(), game: storedOf(game) }, ...readShelf().filter((entry) => entry.id !== id)]);
  return id;
}

/** Takes a game off the shelf, to be played again; null if it is gone. */
export function takeShelvedGame(id: string): LoadedChessGame | null {
  const list = readShelf();
  const entry = list.find((item) => item.id === id);
  if (!entry) return null;
  writeShelf(list.filter((item) => item.id !== id));
  return gameOf(entry.game);
}

export function deleteShelvedGame(id: string): void {
  writeShelf(readShelf().filter((entry) => entry.id !== id));
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
      const parsed = setupOf(JSON.parse(raw) as unknown);
      if (parsed) return parsed;
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
