import { Dominoes, type AiLevel, type DominoesMove, type DominoesState, type DominoesTarget, type PlayerIndex } from "@isputnik/games-engine";
import { newGameKey } from "../../shared/gameKey";

// The game in progress on this device, so a refresh or a locked phone does not
// lose it. The setup, the deal's seed and the move list are stored; the
// position is replayed through the rules on load. A local game is always
// against the computer: two hands hidden on one screen would be no game.
const KEY = "isputnik-games.dominoes.local";

/** The person sits at seat 0 and the computer at seat 1; who leads the first
 *  hand is the tiles' business (the lowest double), not a setting. */
export const HUMAN: PlayerIndex = 0;
export const COMPUTER: PlayerIndex = 1;

export interface DominoesSetup {
  target: DominoesTarget;
  level: AiLevel;
}

export interface SavedDominoesGame {
  setup: DominoesSetup;
  key: string;
  seed: number;
  moves: DominoesMove[];
  finished: null | { reason: "agreed" | "resigned"; resigning?: PlayerIndex };
}

export interface LoadedDominoesGame {
  setup: DominoesSetup;
  key: string;
  seed: number;
  moves: DominoesMove[];
  state: DominoesState;
}

export const DEFAULT_SETUP: DominoesSetup = { target: 101, level: "normal" };

function isSetup(value: unknown): value is DominoesSetup {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (Dominoes.TARGETS as readonly unknown[]).includes(s.target)
    && (s.level === "easy" || s.level === "normal" || s.level === "hard");
}

/** A fresh seed for a deal nobody can work out from the moves. */
export function newSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

export function loadDominoesGame(): LoadedDominoesGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedDominoesGame>;
    if (!isSetup(saved.setup) || !Array.isArray(saved.moves) || typeof saved.seed !== "number" || typeof saved.key !== "string") return null;
    const moves = saved.moves.map((move) => Dominoes.parseMove(move));
    let state = Dominoes.replay({ target: saved.setup.target }, saved.seed, moves);
    if (saved.finished) state = Dominoes.finish(state, saved.finished.reason, saved.finished.resigning);
    return { setup: saved.setup, key: saved.key, seed: saved.seed, moves, state };
  } catch {
    return null;
  }
}

export function saveDominoesGame(game: LoadedDominoesGame): void {
  const status = game.state.status;
  const finished = status.kind === "finished" && (status.reason === "agreed" || status.reason === "resigned")
    ? { reason: status.reason, resigning: status.winner === null ? undefined : (status.winner === 0 ? 1 : 0) as PlayerIndex }
    : null;
  const saved: SavedDominoesGame = { setup: game.setup, key: game.key, seed: game.seed, moves: game.moves, finished };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private mode or full */
  }
}

export function clearDominoesGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export function startDominoesGame(setup: DominoesSetup, seed = newSeed()): LoadedDominoesGame {
  return { setup, key: newGameKey(), seed, moves: [], state: Dominoes.createGame({ target: setup.target }, seed) };
}

const SETUP_KEY = "isputnik-games.dominoes.setup";

/** The last settings used, so "New game" starts where the player left off. */
export function loadDominoesSetup(): DominoesSetup {
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

export function saveDominoesSetup(setup: DominoesSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    /* private mode */
  }
}
