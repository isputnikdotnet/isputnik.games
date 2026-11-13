import type { GameDefinition, GameEvent } from "../game.js";
import { chessAi } from "./ai.js";
import {
  DEFAULT_OPTIONS,
  applyMove,
  clockOf,
  createGame,
  describeMove,
  finish,
  legalMoves,
  parseMove,
  parseOptions,
  timeout,
  type ChessMove,
  type ChessOptions,
  type ChessState
} from "./rules.js";

export const chess: GameDefinition<ChessOptions, ChessState, ChessMove> = {
  id: "chess",
  defaultOptions: DEFAULT_OPTIONS,
  parseOptions,
  parseMove,
  createGame,
  legalMoves,
  applyMove,
  finish,
  // A move in standard notation, with what kind of move it was for the sounds
  // and the log's colour; the web app writes the piece letters in the reader's language.
  narrate: (before, move): GameEvent | null => {
    if (before.status.kind !== "playing") return null;
    const note = describeMove(before, move);
    if (!note) return null;
    return { by: before.status.turn, kind: "move", number: before.fullmove, ...note };
  },
  ai: chessAi,
  clockOf,
  timeout
};

export * from "./rules.js";
export {
  analyseMove,
  chooseMove as chooseChessMove,
  chooseMoveAt as chooseChessMoveAt,
  clampStrength,
  COACH_CAP,
  evaluate,
  LEVELS as CHESS_LEVELS,
  levelOfStrength,
  STRENGTH_MAX,
  STRENGTH_MIN,
  strengthElo,
  strengthFor,
  strengthSpec,
  type MoveVerdict
} from "./ai.js";
export { Position, START_FEN, perft } from "./board.js";
export * from "./puzzles.js";
