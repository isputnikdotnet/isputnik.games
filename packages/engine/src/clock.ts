// A chess clock, as pure arithmetic over the time each move took — so the
// browser (a game on one device) and the server (an online match, where the
// server's own timestamps are the only ones believed) count the same way.
//
// The rules of the clock, as on the big chess sites: each side has `minutes`,
// and gains `increment` seconds after every move it makes. The first move of
// each side is free — the clock starts once both have moved — so nobody loses
// time to finding the board, or to the other player opening the match a day
// later. Moves alternate, seat 0 first (the clock is only offered for chess).
import type { PlayerIndex } from "./game.js";

export interface TimeControl {
  /** Each side's time, in minutes. */
  minutes: number;
  /** Seconds added after each move. */
  increment: number;
}

/** The time controls offered: bullet, blitz with increment, blitz, rapid. */
export const TIME_CONTROLS: readonly TimeControl[] = [
  { minutes: 1, increment: 0 },
  { minutes: 3, increment: 2 },
  { minutes: 5, increment: 0 },
  { minutes: 10, increment: 0 }
];

/** "3+2": a time control as one short key. */
export function timeControlKey(control: TimeControl): string {
  return `${control.minutes}+${control.increment}`;
}

/** A time control as it came off the wire: absent means no clock; anything
 *  but one of TIME_CONTROLS is refused. */
export function parseTimeControl(input: unknown): TimeControl | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "object") throw new Error("A clock is minutes and an increment");
  const { minutes, increment } = input as Record<string, unknown>;
  const found = TIME_CONTROLS.find((c) => c.minutes === minutes && c.increment === increment);
  if (!found) throw new Error("That clock is not offered");
  return { minutes: found.minutes, increment: found.increment };
}

/** Moves played before the clock runs: one each. */
export const FREE_MOVES = 2;

/** Whether the clock is running in a game that has had `moveCount` moves. */
export function clockRunning(moveCount: number): boolean {
  return moveCount >= FREE_MOVES;
}

/**
 * Each side's time left, in milliseconds, after the moves that took `spent`
 * milliseconds each (in order, seat 0 first), with `thinking` ms used so far
 * on the move now being considered. Can go below zero: that side has lost on
 * time, and the caller says so.
 */
export function timeLeft(control: TimeControl, spent: readonly number[], thinking = 0): [number, number] {
  const base = control.minutes * 60_000;
  const increment = control.increment * 1000;
  const left: [number, number] = [base, base];
  spent.forEach((ms, index) => {
    const seat = (index % 2) as PlayerIndex;
    left[seat] += increment - (index < FREE_MOVES ? 0 : Math.max(0, ms));
  });
  if (clockRunning(spent.length)) left[(spent.length % 2) as PlayerIndex] -= Math.max(0, thinking);
  return left;
}

/** The seat whose time is out, if either: only the side to move can run out. */
export function flagged(control: TimeControl, spent: readonly number[], thinking: number): PlayerIndex | null {
  if (!clockRunning(spent.length)) return null;
  const mover = (spent.length % 2) as PlayerIndex;
  return timeLeft(control, spent, thinking)[mover] <= 0 ? mover : null;
}
