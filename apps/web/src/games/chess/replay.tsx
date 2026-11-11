import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, Square } from "lucide-react";
import { Button } from "../../shared/Button";

// Looking back over a game, on every chess page: which position is on the
// board, and the row of buttons that moves it — Start · Back · Play / Stop ·
// Forward · End. It only looks: the game itself stays where it is, and a page
// lets a move be made only at the end. The end is followed, so a move played
// while you are there (yours, the computer's, the other player's) stays in view.

/** How long each move stays on the board while the game plays itself back. */
export const REPLAY_STEP = { ms: 900 };

export interface Replay {
  /** How many moves have been played in the position shown. */
  ply: number;
  last: number;
  /** The board shows the game as it stands now. */
  atEnd: boolean;
  playing: boolean;
  go(to: number): void;
  /** Plays the moves one after another from here — from the start when at the end. */
  play(): void;
  stop(): void;
}

export function useReplay(last: number): Replay {
  // null is the end, wherever that is by now.
  const [at, setAt] = useState<number | null>(null);
  const [wanted, setWanted] = useState(false);
  const ply = at === null ? last : Math.min(at, last);
  const atEnd = ply === last;
  const playing = wanted && !atEnd;

  const go = useCallback((to: number) => {
    setWanted(false);
    setAt(to >= last ? null : Math.max(0, to));
  }, [last]);

  const play = useCallback(() => {
    if (last === 0) return;
    setAt((current) => (current === null || current >= last ? 0 : current));
    setWanted(true);
  }, [last]);

  const stop = useCallback(() => setWanted(false), []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setAt((current) => (current === null || current + 1 >= last ? null : current + 1));
    }, REPLAY_STEP.ms);
    return () => window.clearInterval(timer);
  }, [playing, last]);

  return { ply, last, atEnd, playing, go, play, stop };
}

export function ReplayControls({ replay }: { replay: Replay }) {
  const { t } = useTranslation();
  const { ply, last, playing } = replay;
  const step = (label: string, to: number, disabled: boolean, icon: React.ReactNode) => (
    <Button variant="secondary" onClick={() => replay.go(to)} disabled={disabled} aria-label={label} title={label}>
      {icon}
    </Button>
  );
  const toggle = playing ? t("chess.review.stop") : t("chess.review.play");
  return (
    <div className="review-steps" role="group" aria-label={t("chess.review.steps")}>
      {step(t("chess.review.start"), 0, ply === 0, <ChevronsLeft size={18} aria-hidden="true" />)}
      {step(t("chess.review.back"), ply - 1, ply === 0, <ChevronLeft size={18} aria-hidden="true" />)}
      <Button variant="secondary" onClick={playing ? replay.stop : replay.play} disabled={last === 0} aria-label={toggle} title={toggle}>
        {playing ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </Button>
      {step(t("chess.review.next"), ply + 1, ply === last, <ChevronRight size={18} aria-hidden="true" />)}
      {step(t("chess.review.end"), last, ply === last, <ChevronsRight size={18} aria-hidden="true" />)}
    </div>
  );
}

/** The line a live game shows while the board is on an earlier position. */
export function ReplayNote({ replay }: { replay: Replay }) {
  const { t } = useTranslation();
  if (replay.atEnd) return null;
  return <p className="muted chess-reason">{t("chess.review.viewing", { ply: replay.ply, count: replay.last })}</p>;
}
