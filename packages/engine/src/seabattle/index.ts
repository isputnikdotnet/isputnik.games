import type { GameDefinition } from "../game.js";
import { seaBattleAi } from "./ai.js";
import {
  DEFAULT_OPTIONS,
  applyMove,
  createGame,
  finish,
  legalMoves,
  parseMove,
  parseOptions,
  viewFor,
  type SeaBattleMove,
  type SeaBattleOptions,
  type SeaBattleState
} from "./rules.js";

export const seabattle: GameDefinition<SeaBattleOptions, SeaBattleState, SeaBattleMove> = {
  id: "seabattle",
  defaultOptions: DEFAULT_OPTIONS,
  parseOptions,
  parseMove,
  createGame,
  legalMoves,
  applyMove,
  finish,
  viewFor,
  scoreOf: (state) => state.sunk,
  ai: seaBattleAi
};

export * from "./rules.js";
export { chooseMove as chooseSeaBattleMove, chooseShot } from "./ai.js";
