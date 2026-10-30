import { Checkers, type AiLevel, type CheckersState, type PlayerIndex } from "@isputnik/games-engine";
import { newGameKey } from "../../shared/gameKey";
export interface CheckersSetup {
  mode: "computer" | "local";
  computerPlays: PlayerIndex;
  level: AiLevel;
}
export interface SavedGame {
  setup: CheckersSetup;
  state: CheckersState;
  key: string;
}
const KEY = "isputnik-games.checkers.local";
const SETUP_KEY = "isputnik-games.checkers.setup";
export const DEFAULT_SETUP: CheckersSetup = {
  mode: "computer",
  computerPlays: 1,
  level: "normal"
};
export function loadCheckersSetup(): CheckersSetup {
  try {
    const value = JSON.parse(localStorage.getItem(SETUP_KEY) ?? "null") as CheckersSetup | null;
    if (
      value &&
      ["computer", "local"].includes(value.mode) &&
      [0, 1].includes(value.computerPlays) &&
      ["easy", "normal", "hard"].includes(value.level)
    )
      return value;
  } catch {
    /* private mode or invalid saved setup */
  }
  return DEFAULT_SETUP;
}
export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(game.setup));
    localStorage.setItem(
      KEY,
      JSON.stringify({
        setup: game.setup,
        key: game.key,
        moves: game.state.moves,
        finish: game.state.status
      })
    );
  } catch {
    /* private mode */
  }
}
export function loadCheckersGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const setup = saved.setup as CheckersSetup;
    if (
      !setup ||
      !["computer", "local"].includes(setup.mode) ||
      ![0, 1].includes(setup.computerPlays) ||
      !["easy", "normal", "hard"].includes(setup.level) ||
      !Array.isArray(saved.moves) ||
      saved.moves.length > 1000
    )
      return null;
    let state = Checkers.replay(saved.moves.map(Checkers.parseMove));
    if (saved.finish?.kind === "finished" && ["agreed", "resigned"].includes(saved.finish.reason))
      state = Checkers.finish(state, saved.finish.reason, saved.finish.winner === 0 ? 1 : 0);
    return {
      setup,
      state,
      key: typeof saved.key === "string" ? saved.key : newGameKey()
    };
  } catch {
    return null;
  }
}
