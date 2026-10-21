// The shape every game in this project implements. The rules are pure functions
// over plain JSON state, so the same code runs in the browser (local and computer
// games) and on the server (the authority for online matches, phase 2). Nothing
// in here, or in any game, may touch the DOM or Node APIs.

/** Seat at the table: 0 moves first. Every game here is for two. */
export type PlayerIndex = 0 | 1;

export function otherPlayer(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

export type FinishReason =
  /** No legal move remains. */
  | "board-full"
  /** A player reached the game's target (captures, points…). */
  | "target"
  /** Both players agreed to stop and count. */
  | "agreed"
  /** One player gave up; the other wins. */
  | "resigned";

export type GameStatus =
  | { kind: "playing"; turn: PlayerIndex }
  | { kind: "finished"; winner: PlayerIndex | null; reason: FinishReason };

export type AiLevel = "easy" | "normal";
export const AI_LEVELS: readonly AiLevel[] = ["easy", "normal"];

/** A computer opponent. `random` is injected so a test can be deterministic. */
export interface GameAi<S, M> {
  chooseMove(state: S, level: AiLevel, random: () => number): M | null;
}

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalMoveError";
  }
}

export interface GameDefinition<O, S extends { status: GameStatus }, M> {
  /** Stable id, used in URLs and (phase 2) in the database: "dots". */
  id: string;
  defaultOptions: O;
  /** Throws on options outside what the game allows. */
  createGame(options: O): S;
  legalMoves(state: S): M[];
  /** Returns the next state; throws IllegalMoveError. Never mutates `state`. */
  applyMove(state: S, move: M): S;
  /** Ends a game early: by agreement (count the score) or a resignation. */
  finish(state: S, reason: "agreed" | "resigned", resigning?: PlayerIndex): S;
  ai?: GameAi<S, M>;
}
