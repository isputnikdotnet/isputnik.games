// The computer opponent for Dots. Heuristic, not a search engine: it plays at the
// level of a casual family game, which is what the game it is modelled on offers.
//
//  easy    plays near the action, takes any capture on offer, avoids walking into
//          a finished house.
//  normal  the same, then looks one reply ahead for its best few candidates and
//          discounts a move by the best capture the opponent could answer with.
//
// Candidates are the playable points within two steps of an existing dot (the
// whole board on an empty one is pointless), which keeps a 30×30 board well under
// a tenth of a second per move.
import type { AiLevel, GameAi, PlayerIndex } from "../game.js";
import { otherPlayer } from "../game.js";
import { applyMove, indexOf, isLiveDot, EMPTY, type DotsMove, type DotsState } from "./rules.js";

const NEAR = 2;
/** How many first-pass favourites the normal level looks a reply ahead for. */
const LOOKAHEAD_WIDTH = 12;

function candidates(state: DotsState): DotsMove[] {
  const size = state.size;
  const near = new Uint8Array(size * size);
  let anyDot = false;
  for (let i = 0; i < state.dots.length; i++) {
    if (state.dots[i] === EMPTY) continue;
    anyDot = true;
    const x = i % size;
    const y = (i - x) / size;
    for (let dy = -NEAR; dy <= NEAR; dy++) {
      for (let dx = -NEAR; dx <= NEAR; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        near[ny * size + nx] = 1;
      }
    }
  }
  const out: DotsMove[] = [];
  for (let i = 0; i < state.dots.length; i++) {
    if (state.dots[i] !== EMPTY || state.territory[i] !== 0) continue;
    if (anyDot && !near[i]) continue;
    out.push({ x: i % size, y: Math.floor(i / size) });
  }
  return out;
}

/** An opening move: around the middle, not dead centre every game. */
function opening(state: DotsState, random: () => number): DotsMove {
  const mid = Math.floor(state.size / 2);
  const spread = Math.max(1, Math.floor(state.size / 6));
  const x = mid + Math.floor(random() * (2 * spread + 1)) - spread;
  const y = mid + Math.floor(random() * (2 * spread + 1)) - spread;
  return { x: Math.min(state.size - 1, Math.max(0, x)), y: Math.min(state.size - 1, Math.max(0, y)) };
}

/** Score of a move for `me` with no look-ahead: captures gained, proximity to
 *  the fight, a nudge off the edge, and a heavy penalty for a dot lost at once. */
function immediateScore(before: DotsState, after: DotsState, move: DotsMove, me: PlayerIndex): number {
  const them = otherPlayer(me);
  const gained = after.captures[me] - before.captures[me];
  let score = gained * 10;
  if (after.status.kind === "finished") {
    if (after.status.winner === me) score += 1000;
    else if (after.status.winner === them) score -= 1000;
  }
  const c = indexOf(after, move.x, move.y);
  // Captured on arrival: a dot thrown into a house.
  if (after.territory[c] === them + 1) score -= 8;

  const size = before.size;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = move.x + dx;
      const ny = move.y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      if (isLiveDot(before, n, me)) score += ring === 1 ? 2 : 0.4;
      else if (isLiveDot(before, n, them)) score += ring === 1 ? 1.5 : 0.3;
    }
  }
  if (move.x === 0 || move.y === 0 || move.x === size - 1 || move.y === size - 1) score -= 1;
  return score;
}

/** The most the opponent can gain with one reply, in the same units. */
function bestReply(state: DotsState, them: PlayerIndex): number {
  if (state.status.kind !== "playing") return 0;
  let best = 0;
  for (const reply of candidates(state)) {
    const after = applyMove(state, reply);
    let gain = (after.captures[them] - state.captures[them]) * 10;
    if (after.status.kind === "finished" && after.status.winner === them) gain += 1000;
    if (gain > best) best = gain;
  }
  return best;
}

export function chooseMove(state: DotsState, level: AiLevel, random: () => number): DotsMove | null {
  if (state.status.kind !== "playing") return null;
  const me = state.status.turn;
  const them = otherPlayer(me);
  const options = candidates(state);
  if (options.length === 0) return null;
  if (!state.dots.some((dot) => dot !== EMPTY)) return opening(state, random);

  const scored = options.map((move) => {
    const after = applyMove(state, move);
    return { move, after, score: immediateScore(state, after, move, me) + random() * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);

  if (level === "normal") {
    const top = scored.slice(0, LOOKAHEAD_WIDTH);
    for (const entry of top) {
      if (entry.after.status.kind === "finished") continue;
      entry.score -= bestReply(entry.after, them) * 0.9;
    }
    top.sort((a, b) => b.score - a.score);
    return top[0].move;
  }
  return scored[0].move;
}

export const dotsAi: GameAi<DotsState, DotsMove> = { chooseMove };
