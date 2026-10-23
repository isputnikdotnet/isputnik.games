import { otherPlayer, type GameDefinition, type GameEvent } from "../game.js";
import { dotsAi } from "./ai.js";
import { DEFAULT_OPTIONS, applyMove, createGame, finish, legalMoves, parseMove, parseOptions, type DotsMove, type DotsOptions, type DotsState } from "./rules.js";

export const dots: GameDefinition<DotsOptions, DotsState, DotsMove> = {
  id: "dots",
  defaultOptions: DEFAULT_OPTIONS,
  parseOptions,
  parseMove,
  createGame,
  legalMoves,
  applyMove,
  finish,
  scoreOf: (state) => state.captures,
  // A dot, with what it captured — or that it was lost at once in a house.
  narrate: (before, move, after): GameEvent | null => {
    if (before.status.kind !== "playing") return null;
    const by = before.status.turn;
    const captured = after.captures[by] - before.captures[by];
    const lost = after.territory[move.y * after.size + move.x] === otherPlayer(by) + 1;
    return { by, kind: "dot", x: move.x, y: move.y, captured, lost };
  },
  ai: dotsAi
};

export * from "./rules.js";
export { chooseMove as chooseDotsMove } from "./ai.js";
