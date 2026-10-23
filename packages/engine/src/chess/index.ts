import type { GameDefinition, GameEvent } from "../game.js";
import { chessAi } from "./ai.js";
import {
  DEFAULT_OPTIONS,
  applyMove,
  createGame,
  describeMove,
  finish,
  legalMoves,
  parseMove,
  parseOptions,
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
  ai: chessAi
};

export * from "./rules.js";
export { chooseMove as chooseChessMove, evaluate, LEVELS as CHESS_LEVELS } from "./ai.js";
export { Position, START_FEN, perft } from "./board.js";
export * from "./puzzles.js";
