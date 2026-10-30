import type { GameDefinition } from "../game.js";
import { chooseMove } from "./ai.js";
import {
  applyMove,
  createGame,
  finish,
  legalMoves,
  notation,
  parseMove,
  parseOptions,
  type CheckersOptions,
  type CheckersState,
  type CheckersMove
} from "./rules.js";
export const checkers: GameDefinition<CheckersOptions, CheckersState, CheckersMove> = {
  id: "checkers",
  defaultOptions: {},
  parseOptions,
  parseMove,
  createGame,
  legalMoves,
  applyMove,
  finish,
  ai: { chooseMove },
  narrate: (before, move, after) =>
    before.status.kind === "playing"
      ? {
          by: before.status.turn,
          kind: "move",
          notation: notation(move, before.board.filter(Boolean).length > after.board.filter(Boolean).length),
          captured: before.board.filter(Boolean).length - after.board.filter(Boolean).length
        }
      : null
};
export * from "./rules.js";
export { chooseMove } from "./ai.js";
