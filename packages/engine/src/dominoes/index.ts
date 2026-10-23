import type { GameDefinition, GameEvent } from "../game.js";
import { dominoesAi } from "./ai.js";
import {
  DEFAULT_OPTIONS,
  applyMove,
  createGame,
  finish,
  legalMoves,
  parseMove,
  parseOptions,
  viewFor,
  type DominoesMove,
  type DominoesOptions,
  type DominoesState
} from "./rules.js";

export const dominoes: GameDefinition<DominoesOptions, DominoesState, DominoesMove> = {
  id: "dominoes",
  defaultOptions: DEFAULT_OPTIONS,
  parseOptions,
  parseMove,
  createGame,
  legalMoves,
  applyMove,
  finish,
  viewFor,
  scoreOf: (state) => state.totals,
  // Points collected towards «козёл»: the lower total leads.
  scoreSense: "penalty",
  // Both seats read the same feed, so a draw never says what was drawn. A play
  // that ended a hand carries the hand's result, which is public.
  narrate: (before, move, after): GameEvent | null => {
    if (before.status.kind !== "playing") return null;
    const by = before.status.turn;
    if (move.kind !== "play") return { by, kind: move.kind };
    const ended = after.history.length > before.history.length ? after.history[after.history.length - 1] : null;
    const event: GameEvent = { by, kind: "play", tile: move.tile, end: before.line.length === 0 ? null : move.end };
    if (ended) {
      event.hand = {
        hand: ended.hand,
        winner: ended.winner,
        fish: ended.fish,
        pips: ended.pips,
        points: ended.points,
        totals: ended.totals
      };
    }
    return event;
  },
  ai: dominoesAi
};

export * from "./rules.js";
export { chooseMove as chooseDominoesMove, sampleWorld, scorePlay } from "./ai.js";
