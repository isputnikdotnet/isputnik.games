import type { GameDefinition, GameEvent } from "../game.js";
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
  // Deploying says only that it happened; a shot says where and what it did.
  narrate: (before, move, after): GameEvent | null => {
    if (before.status.kind !== "playing") return null;
    const by = before.status.turn;
    if (move.kind === "place") return { by, kind: "deploy" };
    return { by, kind: "fire", x: move.x, y: move.y, result: after.lastShot?.result ?? "miss" };
  },
  ai: starBattleAi
};

export * from "./rules.js";
export { chooseMove as chooseStarBattleMove, chooseShot } from "./ai.js";
