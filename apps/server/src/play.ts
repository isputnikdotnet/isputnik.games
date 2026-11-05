// Games played on a screen that holds no rules (docs/plan.md → The TV app).
// The TV app draws the board and keeps the move list; for every position it
// asks here what the position is, which moves are legal in it, and — against
// the computer — what the computer plays. Nothing is stored: the client sends
// the options and the moves so far, and the answer is a pure function of them.
// A finished game against the computer is then reported through
// /computer-results like the browser's, and a chess game kept through /records.
//
// Only games without hidden information are played this way: the client holds
// the whole move list, so a game with a hand or a fleet (Dominoes, Star Battle)
// would show the computer's to whoever looked. Those stay online-only on a TV.
import { getGame, type AiLevel, type AnyGame, type GameEvent, type GameStatus, type PlayerIndex } from "@isputnik/games-engine";
import { MatchError } from "./matches.js";

/** Moves a position may carry: longer than any real game of chess or checkers. */
export const PLAY_MAX_MOVES = 1000;
/** The request body those moves need. */
export const PLAY_BODY_LIMIT = 128 * 1024;

export interface PlayInput {
  game: string;
  options: unknown;
  moves: unknown[];
  /** The computer's seat and level; absent when two people share the screen. */
  computer?: { seat: PlayerIndex; level: AiLevel };
}

export interface PlayAnswer {
  /** The moves as the rules read them, the computer's reply included when it made one. */
  moves: unknown[];
  state: { status: GameStatus };
  /** The legal moves for the side to move, when that side is a person. */
  legalMoves: unknown[];
  /** What each move did (GameDefinition.narrate), for the log. */
  feed: GameEvent[];
  /** The computer's move, when it made one in this answer. */
  computerMove: unknown | null;
}

/** The games a screen without rules may play against the computer or at one screen. */
export function playableGame(id: string): AnyGame | undefined {
  const game = getGame(id);
  return game && !game.viewFor ? game : undefined;
}

export function play(input: PlayInput, random: () => number = Math.random): PlayAnswer {
  const game = playableGame(input.game);
  if (!game) throw new MatchError(400, "That game is not played this way");
  if (input.moves.length > PLAY_MAX_MOVES) throw new MatchError(400, "Too many moves");
  if (input.computer && !game.ai) throw new MatchError(400, "That game has no computer opponent");

  let options: unknown;
  let state: { status: GameStatus };
  try {
    options = game.parseOptions(input.options);
    state = game.createGame(options);
  } catch (err) {
    throw new MatchError(400, err instanceof Error ? err.message : "Invalid options");
  }
  const moves: unknown[] = [];
  const feed: GameEvent[] = [];
  const apply = (raw: unknown) => {
    const move = game.parseMove(raw);
    const next = game.applyMove(state, move);
    const event = game.narrate?.(state, move, next);
    if (event) feed.push(event);
    moves.push(move);
    state = next;
  };
  for (const raw of input.moves) {
    try {
      apply(raw);
    } catch (err) {
      throw new MatchError(400, `Move ${moves.length + 1}: ${err instanceof Error ? err.message : "illegal"}`, "move.illegal");
    }
  }

  let computerMove: unknown | null = null;
  const computer = input.computer;
  if (computer && state.status.kind === "playing" && state.status.turn === computer.seat) {
    const chosen = game.ai!.chooseMove(state, computer.level, random);
    if (chosen !== null) {
      apply(chosen);
      computerMove = chosen;
    }
  }

  const personToMove = state.status.kind === "playing" && (!computer || state.status.turn !== computer.seat);
  return { moves, state, legalMoves: personToMove ? game.legalMoves(state) : [], feed, computerMove };
}
