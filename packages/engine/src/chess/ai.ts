// The computer at chess: an alpha-beta search over board.ts, deepened one move
// at a time until its budget of positions runs out, with captures followed to
// the end at the leaves (so it does not stop counting in the middle of an
// exchange). The levels are how far it looks and how much its judgement is
// clouded:
//
//   easy    one move ahead, judgement blurred by a pawn or two either way,
//           and now and then a move picked at random — a beginner can win
//   normal  three moves ahead, a little blur — a club beginner's opponent
//   hard    up to five moves ahead within its budget, no blur
//
// It is meant to be beaten by a family that plays, not to crush it.
import type { AiLevel, GameAi } from "../game.js";
import {
  BISHOP,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  movePromotion,
  moveTo,
  moveFrom,
  type Move,
  type Position
} from "./board.js";
import { positionOf, toChessMove, type ChessMove, type ChessState } from "./rules.js";

const VALUE = [0, 100, 310, 330, 500, 900, 0];

// Where each piece likes to stand, from White's side, drawn as the board is
// seen with White at the bottom (rank 8 first); flipped to a1-first below.
const DRAWN: Record<number, number[]> = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    60, 60, 60, 60, 60, 60, 60, 60,
    15, 15, 25, 35, 35, 25, 15, 15,
    6, 6, 12, 26, 26, 12, 6, 6,
    0, 0, 4, 22, 22, 4, 0, 0,
    4, -4, -8, 2, 2, -8, -4, 4,
    4, 8, 8, -22, -22, 8, 8, 4,
    0, 0, 0, 0, 0, 0, 0, 0
  ],
  [KNIGHT]: [
    -50, -38, -30, -30, -30, -30, -38, -50,
    -38, -18, 0, 2, 2, 0, -18, -38,
    -30, 2, 12, 16, 16, 12, 2, -30,
    -30, 4, 16, 22, 22, 16, 4, -30,
    -30, 0, 16, 22, 22, 16, 0, -30,
    -30, 4, 12, 16, 16, 12, 4, -30,
    -38, -18, 0, 6, 6, 0, -18, -38,
    -50, -38, -30, -30, -30, -30, -38, -50
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 6, 10, 10, 6, 0, -10,
    -10, 6, 6, 10, 10, 6, 6, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 6, 0, 0, 0, 0, 6, -10,
    -20, -10, -12, -10, -10, -12, -10, -20
  ],
  [ROOK]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    6, 12, 12, 12, 12, 12, 12, 6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    0, 0, 2, 6, 6, 4, 0, 0
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20
  ],
  // The king hides behind its pawns while the queens are on…
  [KING]: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    18, 18, -4, -4, -4, -4, 18, 18,
    20, 32, 10, -2, 0, 8, 32, 20
  ]
};

// …and walks to the middle once they are off.
const KING_LATE = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50
];

const flip = (drawn: number[]) => Array.from({ length: 64 }, (_, sq) => drawn[(7 - (sq >> 3)) * 8 + (sq & 7)]);
const TABLE: number[][] = [[], ...[PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING].map((type) => flip(DRAWN[type]))];
const KING_LATE_TABLE = flip(KING_LATE);

/** The position's worth for the side to move, in centipawns. */
export function evaluate(position: Position): number {
  const board = position.board;
  let pieces = 0;
  let queens = 0;
  const bishops = [0, 0];
  for (let sq = 0; sq < 64; sq++) {
    const type = Math.abs(board[sq]);
    if (type === QUEEN) queens++;
    if (type >= KNIGHT && type <= QUEEN) pieces += VALUE[type];
    if (type === BISHOP) bishops[board[sq] > 0 ? 0 : 1]++;
  }
  const late = queens === 0 || pieces <= 2600;
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const piece = board[sq];
    if (piece === 0) continue;
    const type = Math.abs(piece);
    const own = piece > 0 ? sq : sq ^ 56;
    const table = type === KING && late ? KING_LATE_TABLE : TABLE[type];
    const worth = VALUE[type] + table[own];
    score += piece > 0 ? worth : -worth;
  }
  if (bishops[0] >= 2) score += 30;
  if (bishops[1] >= 2) score -= 30;
  return position.turn === 0 ? score : -score;
}

const MATE = 100000;
const INFINITY = 1000000;

interface LevelSpec {
  depth: number;
  /** Positions the search may visit before it settles for the last finished depth. */
  budget: number;
  /** Each root move's score is moved up to this far either way, at random. */
  blur: number;
  /** The chance of a move picked at random instead. */
  wild: number;
}

export const LEVELS: Record<AiLevel, LevelSpec> = {
  easy: { depth: 1, budget: 20000, blur: 160, wild: 0.15 },
  normal: { depth: 3, budget: 80000, blur: 25, wild: 0 },
  hard: { depth: 5, budget: 1200000, blur: 0, wild: 0 }
};

// ── Strength: the computer on a scale of 0 to 100 ───────────────────────────
// Between and beyond the three levels, for a player who wants it a notch
// harder, or for the adaptive computer that plays at the player's own rating.
// Each step of strength is about 14 rating points: 0 plays like a beginner
// (~400), 50 like Normal (~1100), 100 at the engine's full depth (~1800).
// The named levels sit on the scale too: Easy ~15, Normal 50, Hard ~80.

export const STRENGTH_MIN = 0;
export const STRENGTH_MAX = 100;
const ELO_AT_ZERO = 400;
const ELO_PER_STEP = 14;

/** The rating the computer plays at, at a strength. */
export function strengthElo(strength: number): number {
  return Math.round(ELO_AT_ZERO + clampStrength(strength) * ELO_PER_STEP);
}

/** The strength that plays at a rating. */
export function strengthFor(elo: number): number {
  return clampStrength(Math.round((elo - ELO_AT_ZERO) / ELO_PER_STEP));
}

export function clampStrength(strength: number): number {
  return Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, Math.round(strength)));
}

/** Which named level a strength is nearest, for results kept by level (the
 *  leaderboard's vs Computer scores Easy 1, Normal 2, Hard 3). */
export function levelOfStrength(strength: number): AiLevel {
  const s = clampStrength(strength);
  return s < 33 ? "easy" : s < 66 ? "normal" : "hard";
}

/** The search at a strength: deeper with strength, and less blurred — at the
 *  bottom it also plays the odd move at random, as a beginner does. */
export function strengthSpec(strength: number): LevelSpec {
  const s = clampStrength(strength);
  const depth = s < 20 ? 1 : s < 40 ? 2 : s < 65 ? 3 : s < 85 ? 4 : 5;
  const budget = [20_000, 40_000, 80_000, 400_000, 1_200_000][depth - 1];
  const blur = Math.round(160 * (1 - s / 100) ** 1.5);
  const wild = s < 30 ? Math.round(150 * (1 - s / 30)) / 1000 : 0;
  return { depth, budget, blur, wild };
}

class Search {
  nodes = 0;
  stopped = false;
  private killers: Move[][] = [];

  constructor(private position: Position, private budget: number) {}

  private ordered(moves: Move[], ply: number, first: Move | null = null): Move[] {
    const board = this.position.board;
    const killers = this.killers[ply] ?? [];
    const keyed = moves.map((move) => {
      let key = 0;
      if (move === first) key = 1e7;
      else {
        const victim = Math.abs(board[moveTo(move)]);
        if (victim) key = 1e6 + VALUE[victim] * 10 - VALUE[Math.abs(board[moveFrom(move)])] / 10;
        else if (movePromotion(move)) key = 9e5 + VALUE[movePromotion(move)];
        else if (killers.includes(move)) key = 8e5;
      }
      return { move, key };
    });
    keyed.sort((a, b) => b.key - a.key);
    return keyed.map((entry) => entry.move);
  }

  private tick(): boolean {
    if (++this.nodes > this.budget) this.stopped = true;
    return this.stopped;
  }

  negamax(depth: number, alpha: number, beta: number, ply: number): number {
    if (this.tick()) return 0;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    const position = this.position;
    if (position.halfmove >= 100) return 0;
    let legal = 0;
    let best = -INFINITY;
    for (const move of this.ordered(position.pseudoMoves(), ply)) {
      if (!position.make(move)) continue;
      legal++;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      position.unmake();
      if (this.stopped) return 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (position.board[moveTo(move)] === 0) {
          const killers = (this.killers[ply] ??= []);
          if (!killers.includes(move)) {
            killers.unshift(move);
            killers.length = Math.min(killers.length, 2);
          }
        }
        break;
      }
    }
    if (legal === 0) return position.inCheck() ? -MATE + ply : 0;
    return best;
  }

  quiesce(alpha: number, beta: number, ply: number): number {
    if (this.tick()) return 0;
    const position = this.position;
    const standing = evaluate(position);
    if (standing >= beta) return standing;
    if (standing > alpha) alpha = standing;
    for (const move of this.ordered(position.pseudoMoves(true), ply)) {
      if (!position.make(move)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      position.unmake();
      if (this.stopped) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Every legal root move with its score at `depth`. `exact` searches each
   *  one with a full window, so a blurred level compares true scores; without
   *  it only the best is exact and the rest are bounds below it. */
  root(moves: Move[], depth: number, first: Move | null, exact: boolean, judge: () => number | null): { move: Move; score: number }[] | null {
    const out: { move: Move; score: number }[] = [];
    let alpha = -INFINITY;
    for (const move of this.ordered(moves, 0, first)) {
      this.position.make(move);
      // A root move that repeats the position into a draw is worth exactly that.
      const fixed = judge();
      const score = fixed ?? -this.negamax(depth - 1, -INFINITY, exact ? INFINITY : -alpha, 1);
      this.position.unmake();
      if (this.stopped) return null;
      out.push({ move, score });
      if (score > alpha) alpha = score;
    }
    return out;
  }
}

export function chooseMove(state: ChessState, level: AiLevel, random: () => number): ChessMove | null {
  return chooseWith(state, LEVELS[level], random);
}

/** The computer's move at a strength from 0 to 100 (strengthSpec). */
export function chooseMoveAt(state: ChessState, strength: number, random: () => number): ChessMove | null {
  return chooseWith(state, strengthSpec(strength), random);
}

function chooseWith(state: ChessState, spec: LevelSpec, random: () => number): ChessMove | null {
  if (state.status.kind !== "playing") return null;
  const position = positionOf(state);
  const moves = position.legalMoves();
  if (moves.length === 0) return null;
  if (moves.length === 1) return toChessMove(moves[0]);
  if (spec.wild > 0 && random() < spec.wild) return toChessMove(moves[Math.floor(random() * moves.length)]);

  const seen = new Map<string, number>();
  for (const key of state.history) seen.set(key, (seen.get(key) ?? 0) + 1);
  const judge = () => ((seen.get(position.repetitionKey()) ?? 0) >= 2 ? 0 : null);

  const search = new Search(position, spec.budget);
  let scored: { move: Move; score: number }[] | null = null;
  for (let depth = 1; depth <= spec.depth; depth++) {
    const best = scored ? scored.reduce((a, b) => (b.score > a.score ? b : a)).move : null;
    const result = search.root(moves, depth, best, spec.blur > 0, judge);
    if (!result) break;
    scored = result;
    // A forced mate found needs no deeper look.
    if (result.some((entry) => entry.score > MATE - 100)) break;
  }
  if (!scored) scored = moves.map((move) => ({ move, score: 0 }));

  // The blur, where the level has one; without it the first best move (its
  // scores below the best are only bounds, so no noise to choose among them).
  let pick = scored[0];
  let pickScore = -INFINITY;
  for (const entry of scored) {
    const blurred = spec.blur > 0 ? entry.score + (random() * 2 - 1) * spec.blur : entry.score;
    if (blurred > pickScore) {
      pickScore = blurred;
      pick = entry;
    }
  }
  return toChessMove(pick.move);
}

export const chessAi: GameAi<ChessState, ChessMove> = { chooseMove };

// ── The coach (game review) ─────────────────────────────────────────────────
// How good a move was: every legal move in the position before it is searched
// with a full window, so the move played and the best one have true scores to
// compare. Scores are centipawns for the side that moved; a mate counts as
// COACH_CAP, so a missed mate reads as a big loss without dwarfing the rest.

/** The coach's view of one move. */
export interface MoveVerdict {
  /** The move the search liked best (the played one when nothing beat it). */
  best: ChessMove;
  bestScore: number;
  playedScore: number;
  /** What the move played gave away against the best, in centipawns (0 or more). */
  loss: number;
}

export const COACH_CAP = 1500;
const capped = (score: number) => Math.max(-COACH_CAP, Math.min(COACH_CAP, score));

export function analyseMove(state: ChessState, played: ChessMove, depth = 3, budget = 120_000): MoveVerdict | null {
  if (state.status.kind !== "playing") return null;
  const position = positionOf(state);
  const moves = position.legalMoves();
  if (moves.length === 0) return null;
  const search = new Search(position, budget);
  let scored: { move: Move; score: number }[] | null = null;
  for (let d = 1; d <= depth; d++) {
    const first = scored ? scored.reduce((a, b) => (b.score > a.score ? b : a)).move : null;
    const result = search.root(moves, d, first, true, () => null);
    if (!result) break;
    scored = result;
  }
  if (!scored) return null;
  const same = (move: ChessMove) => move.from === played.from && move.to === played.to && (move.promotion ?? "q") === (played.promotion ?? "q");
  const mine = scored.find((entry) => same(toChessMove(entry.move)));
  if (!mine) return null;
  const top = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const bestScore = capped(top.score);
  const playedScore = capped(mine.score);
  return { best: toChessMove(top.move), bestScore, playedScore, loss: Math.max(0, bestScore - playedScore) };
}
