import { SeaBattle, type AiLevel, type FleetKind, type PlayerIndex, type SeaBattleMove, type SeaBattleState } from "@isputnik/games-engine";

// The game in progress on this device, so a refresh or a locked phone does not
// lose it. Only the setup and the move list are stored (the fleets are the
// first two moves); the position is replayed through the rules on load.
const KEY = "isputnik-games.seabattle.local";

export type SeaBattleMode = "computer" | "local";

export interface SeaBattleSetup {
  fleet: FleetKind;
  mode: SeaBattleMode;
  /** Which seat the computer takes in computer mode; seat 0 fires first. */
  computerPlays: PlayerIndex;
  level: AiLevel;
}

export interface SavedSeaBattleGame {
  setup: SeaBattleSetup;
  moves: SeaBattleMove[];
  finished: null | { reason: "agreed" | "resigned"; resigning?: PlayerIndex };
}

export interface LoadedSeaBattleGame {
  setup: SeaBattleSetup;
  moves: SeaBattleMove[];
  state: SeaBattleState;
}

export const DEFAULT_SETUP: SeaBattleSetup = {
  fleet: "classic",
  mode: "computer",
  computerPlays: 1,
  level: "normal"
};

function isSetup(value: unknown): value is SeaBattleSetup {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (SeaBattle.FLEET_KINDS as readonly unknown[]).includes(s.fleet)
    && (s.mode === "computer" || s.mode === "local")
    && (s.computerPlays === 0 || s.computerPlays === 1)
    && (s.level === "easy" || s.level === "normal" || s.level === "hard");
}

export function loadSeaBattleGame(): LoadedSeaBattleGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedSeaBattleGame>;
    if (!isSetup(saved.setup) || !Array.isArray(saved.moves)) return null;
    const moves = saved.moves.map((move) => SeaBattle.parseMove(move));
    let state = SeaBattle.replay({ fleet: saved.setup.fleet }, moves);
    if (saved.finished) state = SeaBattle.finish(state, saved.finished.reason, saved.finished.resigning);
    return { setup: saved.setup, moves, state };
  } catch {
    return null;
  }
}

export function saveSeaBattleGame(game: LoadedSeaBattleGame): void {
  const finished = game.state.status.kind === "finished" && (game.state.status.reason === "agreed" || game.state.status.reason === "resigned")
    ? { reason: game.state.status.reason, resigning: game.state.status.winner === null ? undefined : (game.state.status.winner === 0 ? 1 : 0) as PlayerIndex }
    : null;
  const saved: SavedSeaBattleGame = { setup: game.setup, moves: game.moves, finished };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private mode or full */
  }
}

export function clearSeaBattleGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

const SETUP_KEY = "isputnik-games.seabattle.setup";

/** The last settings used, so "New game" starts where the player left off. */
export function loadSeaBattleSetup(): SeaBattleSetup {
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

export function saveSeaBattleSetup(setup: SeaBattleSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    /* private mode */
  }
}
