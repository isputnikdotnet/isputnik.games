// The shape of a game for one player against the clock (docs/plan.md → Sputnik
// Catch). It is not a GameDefinition: there are no seats and no turns, only a
// run that ticks until it is over. A run is a pure function of its variant, its
// seed and what the player did at each tick, so the server can replay one from
// an input log and keep the score it computes, never one a browser sends.
// Wall-clock time is the web app's business (periodOf says how long to wait);
// it plays no part in the rules.

/** Something a tick did, for the web app to sound and show: a catch, a crash. */
export type ArcadeCue = { kind: string } & Record<string, unknown>;

export interface ArcadeTick<S> {
  state: S;
  cues: ArcadeCue[];
}

export interface ArcadeState {
  /** Ticks played so far. */
  tick: number;
  over: boolean;
}

/** What the player did, as [tick, input]: the input holds from that tick on.
 *  Ticks never go down; of two entries for one tick the later wins. */
export type InputLog<I> = ReadonlyArray<readonly [tick: number, input: I]>;

export interface ArcadeDefinition<V extends string, S extends ArcadeState, I> {
  /** Stable id, used in URLs and in the scores table: "sputnik". */
  id: string;
  variants: readonly V[];
  /** The input a run starts with, before the player has touched anything. */
  initialInput: I;
  /** Throws on anything but one of `variants`. */
  parseVariant(input: unknown): V;
  /** Throws on a malformed input. */
  parseInput(input: unknown): I;
  createRun(variant: V, seed: number): S;
  /** The next state and what happened on the way. Never mutates `state`;
   *  throws ArcadeOverError on a run that is over. */
  tick(state: S, input: I): ArcadeTick<S>;
  /** How long to wait before the next tick, in milliseconds. */
  periodOf(state: S): number;
  /** The score of record: what the leaderboard keeps. */
  scoreOf(state: S): number;
}

export class ArcadeOverError extends Error {
  constructor() {
    super("The run is over");
    this.name = "ArcadeOverError";
  }
}

export class ArcadeReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArcadeReplayError";
  }
}

/** A seed as it came off the wire: a whole number that fits 32 bits. */
export function parseSeed(input: unknown): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0 || input > 0xffffffff) {
    throw new ArcadeReplayError("A seed is a whole number from 0 to 4294967295");
  }
  return input;
}

/** An input log as it came off the wire, checked entry by entry. */
export function parseInputLog<I>(parseInput: (input: unknown) => I, input: unknown, maxEntries: number): [number, I][] {
  if (!Array.isArray(input)) throw new ArcadeReplayError("The input log is not a list");
  if (input.length > maxEntries) throw new ArcadeReplayError("The input log is too long");
  let last = 0;
  return input.map((entry: unknown) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new ArcadeReplayError("An input log entry is not [tick, input]");
    const [tick, value] = entry as [unknown, unknown];
    if (typeof tick !== "number" || !Number.isInteger(tick) || tick < last) {
      throw new ArcadeReplayError("Input log ticks must be whole numbers that never go down");
    }
    last = tick;
    try {
      return [tick, parseInput(value)];
    } catch (error) {
      throw new ArcadeReplayError(`A bad input at tick ${tick}: ${(error as Error).message}`);
    }
  });
}

/** Plays a run from its seed and input log until it is over. Entries after the
 *  end change nothing. Throws ArcadeReplayError past `maxTicks`, so a log that
 *  keeps a run alive for ever cannot keep the server busy. */
export function replayRun<V extends string, S extends ArcadeState, I>(
  game: ArcadeDefinition<V, S, I>,
  variant: V,
  seed: number,
  log: InputLog<I>,
  maxTicks: number
): S {
  let state = game.createRun(variant, seed);
  let input = game.initialInput;
  let next = 0;
  while (!state.over) {
    if (state.tick >= maxTicks) throw new ArcadeReplayError(`The run went past ${maxTicks} ticks`);
    while (next < log.length && log[next][0] <= state.tick) input = log[next++][1];
    state = game.tick(state, input).state;
  }
  return state;
}
