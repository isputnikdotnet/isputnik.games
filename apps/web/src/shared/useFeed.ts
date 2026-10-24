import { useMemo } from "react";
import { narrateMoves, type GameDefinition, type GameEvent, type GameStatus } from "@isputnik/games-engine";

// The events of a local game, kept up with its move list. The position and
// the events reached after each move are remembered against that move, so a
// move added since the last render is narrated from where the game already
// was and a long game of Dots never replays from the start on every dot.
// Anything else (an undo rebuilds the list with new move objects, a new game)
// narrates the whole list again.
interface Reached {
  state: unknown;
  events: GameEvent[];
}

const reachedAfter = new WeakMap<object, Reached>();

export function feedFor<O, S extends { status: GameStatus }, M extends object>(
  game: GameDefinition<O, S, M>,
  options: O,
  moves: readonly M[],
  seed?: number
): GameEvent[] {
  if (moves.length === 0) return [];
  const known = reachedAfter.get(moves[moves.length - 1]);
  if (known) return known.events;

  // The longest prefix already reached, then the rest from there.
  let from = moves.length - 1;
  let state: S | null = null;
  let events: GameEvent[] = [];
  for (; from > 0; from--) {
    const prior = reachedAfter.get(moves[from - 1]);
    if (prior) {
      state = prior.state as S;
      events = prior.events;
      break;
    }
  }
  if (state === null) {
    const start = narrateMoves(game, options, [], seed);
    state = start.state;
    events = [];
    from = 0;
  }
  for (let i = from; i < moves.length; i++) {
    const move = moves[i];
    const next = game.applyMove(state, move);
    const event = game.narrate?.(state, move, next);
    events = event ? [...events, event] : events;
    state = next;
    reachedAfter.set(move, { state, events });
  }
  return events;
}

export function useFeed<O, S extends { status: GameStatus }, M extends object>(
  game: GameDefinition<O, S, M>,
  options: O,
  moves: readonly M[],
  /** The deal's seed, for a game dealt at random (Dominoes). */
  seed?: number
): GameEvent[] {
  // Options and the seed change only with a new game, which starts from an empty list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => feedFor(game, options, moves, seed), [game, moves]);
}
