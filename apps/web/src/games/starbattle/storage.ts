import { StarBattle, type AiLevel, type FleetKind, type PlayerIndex, type StarBattleMove, type StarBattleState } from "@isputnik/games-engine";

// The game in progress on this device, so a refresh or a locked phone does not
// lose it. Only the setup and the move list are stored (the fleets are the
// first two moves); the position is replayed through the rules on load.
const KEY = "isputnik-games.starbattle.local";

// A local game is always against the computer: two people on one screen would
// have to hide their fleets from each other on it, which is no game at all.
export interface StarBattleSetup {
  fleet: FleetKind;
  /** Which seat the computer takes; seat 0 fires first. */
  computerPlays: PlayerIndex;
  level: AiLevel;
}

export interface SavedStarBattleGame {
  setup: StarBattleSetup;
  moves: StarBattleMove[];
  finished: null | { reason: "agreed" | "resigned"; resigning?: PlayerIndex };
}

export interface LoadedStarBattleGame {
  setup: StarBattleSetup;
  moves: StarBattleMove[];
  state: StarBattleState;
}

export const DEFAULT_SETUP: StarBattleSetup = {
  fleet: "classic",
  computerPlays: 1,
  level: "normal"
};

function isSetup(value: unknown): value is StarBattleSetup {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (StarBattle.FLEET_KINDS as readonly unknown[]).includes(s.fleet)
    && (s.computerPlays === 0 || s.computerPlays === 1)
    && (s.level === "easy" || s.level === "normal" || s.level === "hard");
}

export function loadStarBattleGame(): LoadedStarBattleGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedStarBattleGame>;
    if (!isSetup(saved.setup) || !Array.isArray(saved.moves)) return null;
    const moves = saved.moves.map((move) => StarBattle.parseMove(move));
    let state = StarBattle.replay({ fleet: saved.setup.fleet }, moves);
    if (saved.finished) state = StarBattle.finish(state, saved.finished.reason, saved.finished.resigning);
    return { setup: saved.setup, moves, state };
  } catch {
    return null;
  }
}

export function saveStarBattleGame(game: LoadedStarBattleGame): void {
  const finished = game.state.status.kind === "finished" && (game.state.status.reason === "agreed" || game.state.status.reason === "resigned")
    ? { reason: game.state.status.reason, resigning: game.state.status.winner === null ? undefined : (game.state.status.winner === 0 ? 1 : 0) as PlayerIndex }
    : null;
  const saved: SavedStarBattleGame = { setup: game.setup, moves: game.moves, finished };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private mode or full */
  }
}

export function clearStarBattleGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

const SETUP_KEY = "isputnik-games.starbattle.setup";

/** The last settings used, so "New game" starts where the player left off. */
export function loadStarBattleSetup(): StarBattleSetup {
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

export function saveStarBattleSetup(setup: StarBattleSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    /* private mode */
  }
}
