import { useEffect, useState } from "react";
import { Chess, type ChessMove, type ChessState, type MoveVerdict } from "@isputnik/games-engine";

// The coach on the review page: each move of a finished game weighed against
// the best one the engine finds, a move at a time, between paints — so the
// page stays usable while it works and fills in as it goes.

export type Mark = "inaccuracy" | "mistake" | "blunder";

/** How much a move may give away (centipawns) before it earns each mark. */
const LIMITS: [Mark, number][] = [["blunder", 300], ["mistake", 120], ["inaccuracy", 50]];

/** The mark a move earns, if any. A side that stays clearly winning, or was
 *  already clearly lost, is not nagged over pawns it can spare. */
export function markOf(verdict: MoveVerdict | null | undefined): Mark | null {
  if (!verdict) return null;
  if (verdict.bestScore >= 500 && verdict.playedScore >= 300) return null;
  if (verdict.bestScore <= -500) return null;
  return LIMITS.find(([, limit]) => verdict.loss >= limit)?.[0] ?? null;
}

export const MARK_SIGN: Record<Mark, string> = { inaccuracy: "?!", mistake: "?", blunder: "??" };

/** How long the coach may take per position, so a long game still ends. */
export const COACH = { depth: 3, budget: 120_000, pauseMs: 0 };

export interface Coaching {
  /** One verdict per move as it comes in; undefined while not yet weighed. */
  verdicts: (MoveVerdict | null | undefined)[];
  done: number;
  total: number;
}

export function useCoach(positions: ChessState[], moves: ChessMove[]): Coaching {
  const [verdicts, setVerdicts] = useState<{ moves: ChessMove[]; list: (MoveVerdict | null)[] }>({ moves: [], list: [] });

  useEffect(() => {
    if (moves.length === 0 || positions.length < moves.length) return;
    let live = true;
    const list: (MoveVerdict | null)[] = [];
    let timer = 0;
    const step = () => {
      if (!live) return;
      const index = list.length;
      list.push(Chess.analyseMove(positions[index], moves[index], COACH.depth, COACH.budget));
      setVerdicts({ moves, list: [...list] });
      if (list.length < moves.length) timer = window.setTimeout(step, COACH.pauseMs);
    };
    timer = window.setTimeout(step, COACH.pauseMs);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [positions, moves]);

  const list = verdicts.moves === moves ? verdicts.list : [];
  return { verdicts: moves.map((_move, index) => list[index]), done: list.length, total: moves.length };
}
