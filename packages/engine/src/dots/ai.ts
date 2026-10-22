// The computer opponent for Dots. Heuristic, not a search engine: it plays at the
// level of a casual family game, which is what the game it is modelled on offers.
//
//  easy    plays near the action, takes any capture on offer, avoids walking into
//          a finished house.
//  normal  the same, then looks one reply ahead for its best few candidates and
//          discounts a move by the best capture the opponent could answer with.
//  hard    looks at twice as many candidates, weighs the opponent's best reply in
//          full, and also rewards a move by the capture it sets up for its own
//          next turn — so it builds rings rather than only closing ones that
//          happen to be a move away. Less randomness, too.
//
// Candidates are the playable points within two steps of an existing dot (the
// whole board on an empty one is pointless), which keeps a 30×30 board well under
// a tenth of a second per move at normal and well under a second at hard.
import type { AiLevel, GameAi, PlayerIndex } from "../game.js";
import { otherPlayer } from "../game.js";
import { applyMove, indexOf, isLiveDot, EMPTY, type DotsMove, type DotsState } from "./rules.js";

const NEAR = 2;
/** How many first-pass favourites each level looks a reply ahead for. */
const LOOKAHEAD_WIDTH: Record<AiLevel, number> = { easy: 0, normal: 12, hard: 24 };

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

/** The most `player` could gain with one move from here, in the same units. */
function bestNext(state: DotsState, player: PlayerIndex): number {
  if (state.status.kind !== "playing") return 0;
  let best = 0;
  for (const move of candidates(state)) {
    const after = applyMove(state, move);
    let gain = (after.captures[player] - state.captures[player]) * 10;
    if (after.status.kind === "finished" && after.status.winner === player) gain += 1000;
    if (gain > best) best = gain;
  }
  return best;
}

/** What `player` could capture if it were their move now — the threat a position
 *  holds for them. Measured by handing them the turn without a move in between. */
function threatFor(state: DotsState, player: PlayerIndex): number {
  if (state.status.kind !== "playing") return 0;
  const asTheirs: DotsState = state.status.turn === player ? state : { ...state, status: { kind: "playing", turn: player } };
  return bestNext(asTheirs, player);
}

export function chooseMove(state: DotsState, level: AiLevel, random: () => number): DotsMove | null {
  if (state.status.kind !== "playing") return null;
  const me = state.status.turn;
  const them = otherPlayer(me);
  const options = candidates(state);
  if (options.length === 0) return null;
  if (!state.dots.some((dot) => dot !== EMPTY)) return opening(state, random);

  const noise = level === "hard" ? 0.5 : 1.5;
  const scored = options.map((move) => {
    const after = applyMove(state, move);
    return { move, after, score: immediateScore(state, after, move, me) + random() * noise };
  });
  scored.sort((a, b) => b.score - a.score);

  const width = LOOKAHEAD_WIDTH[level];
  if (width === 0) return scored[0].move;

  const top = scored.slice(0, width);
  for (const entry of top) {
    if (entry.after.status.kind === "finished") continue;
    // What the opponent takes back with their best reply…
    entry.score -= bestNext(entry.after, them) * (level === "hard" ? 1 : 0.9);
    // …and, at hard, what this move sets up for our own next turn.
    if (level === "hard") entry.score += threatFor(entry.after, me) * 0.5;
  }
  top.sort((a, b) => b.score - a.score);
  return top[0].move;
}

export const dotsAi: GameAi<DotsState, DotsMove> = { chooseMove };
