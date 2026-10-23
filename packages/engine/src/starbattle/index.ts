import type { GameDefinition } from "../game.js";
import { starBattleAi } from "./ai.js";
import {
  DEFAULT_OPTIONS,
  applyMove,
  createGame,
  finish,
  legalMoves,
  parseMove,
  parseOptions,
  viewFor,
  type StarBattleMove,
  type StarBattleOptions,
  type StarBattleState
} from "./rules.js";

export const starbattle: GameDefinition<StarBattleOptions, StarBattleState, StarBattleMove> = {
  id: "starbattle",
  defaultOptions: DEFAULT_OPTIONS,
  parseOptions,
  parseMove,
  createGame,
  legalMoves,
  applyMove,
  finish,
  viewFor,
  scoreOf: (state) => state.destroyed,
  ai: starBattleAi
};

export * from "./rules.js";
export { chooseMove as chooseStarBattleMove, chooseShot } from "./ai.js";
