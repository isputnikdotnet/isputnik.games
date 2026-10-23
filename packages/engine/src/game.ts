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

export type AiLevel = "easy" | "normal" | "hard";
export const AI_LEVELS: readonly AiLevel[] = ["easy", "normal", "hard"];

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
  /** Options as they came off the wire (a request body, a saved game): checked
   *  and reduced to exactly the fields the game reads, so nothing else is ever
   *  stored or sent to the other player. Throws on what the game does not allow. */
  parseOptions(input: unknown): O;
  /** The same for a move. Throws on a malformed one; whether it is legal in the
   *  position is applyMove's question. */
  parseMove(input: unknown): M;
  /** Throws on options outside what the game allows. */
  createGame(options: O): S;
  legalMoves(state: S): M[];
  /** Returns the next state; throws IllegalMoveError. Never mutates `state`. */
  applyMove(state: S, move: M): S;
  /** Ends a game early: by agreement (count the score) or a resignation. */
  finish(state: S, reason: "agreed" | "resigned", resigning?: PlayerIndex): S;
  /** The running score per seat, for match lists that know nothing of the game
   *  (captures in Dots). Omitted when the game keeps no score. */
  scoreOf?(state: S): [number, number];
  /** The state as one seat may see it, for games with hidden information (a
   *  fleet in Sea Battle). The server sends each player their view and never
   *  the whole state; a game without secrets omits it. */
  viewFor?(state: S, seat: PlayerIndex): S;
  ai?: GameAi<S, M>;
}
