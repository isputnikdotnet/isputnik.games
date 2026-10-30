import type { AiLevel, PlayerIndex } from "../game.js";
import { applyMove, legalMoves, type CheckersMove, type CheckersState } from "./rules.js";

function evaluate(state: CheckersState, me: PlayerIndex): number {
  if (state.status.kind === "finished")
    return state.status.winner === null ? 0 : state.status.winner === me ? 100000 : -100000;
  return state.board.reduce((score, p, sq) => {
    if (!p) return score;
    const advance = p.player === 0 ? 7 - Math.floor(sq / 8) : Math.floor(sq / 8);
    const center = 3.5 - Math.abs(3.5 - (sq % 8));
    return score + (p.player === me ? 1 : -1) * (p.king ? 330 : 100 + advance * 5 + center * 3);
  }, 0);
}
export function chooseMove(state: CheckersState, level: AiLevel, random: () => number): CheckersMove | null {
  const moves = legalMoves(state);
  if (!moves.length || state.status.kind !== "playing") return null;
  if (level === "easy") return moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))]!;
  const me = state.status.turn;
  let nodes = 0;
  const search = (s: CheckersState, depth: number, alpha: number, beta: number): number => {
    if (depth === 0 || s.status.kind !== "playing" || ++nodes > 6000) return evaluate(s, me);
    const maximizing = s.status.turn === me;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of legalMoves(s)) {
      const score = search(applyMove(s, move), depth - 1, alpha, beta);
      best = maximizing ? Math.max(best, score) : Math.min(best, score);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  };
  let best = -Infinity,
    choices: CheckersMove[] = [];
  for (const move of moves) {
    const score = search(applyMove(state, move), level === "hard" ? 4 : 2, -Infinity, Infinity);
    if (score > best) {
      best = score;
      choices = [move];
    } else if (score === best) choices.push(move);
  }
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]!;
}
