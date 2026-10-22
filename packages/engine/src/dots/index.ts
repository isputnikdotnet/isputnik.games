import type { GameDefinition } from "../game.js";
import { dotsAi } from "./ai.js";
import { DEFAULT_OPTIONS, applyMove, createGame, finish, legalMoves, type DotsMove, type DotsOptions, type DotsState } from "./rules.js";

export const dots: GameDefinition<DotsOptions, DotsState, DotsMove> = {
  id: "dots",
  defaultOptions: DEFAULT_OPTIONS,
  createGame,
  legalMoves,
  applyMove,
  finish,
  scoreOf: (state) => state.captures,
  ai: dotsAi
};

export * from "./rules.js";
export { chooseMove as chooseDotsMove } from "./ai.js";
