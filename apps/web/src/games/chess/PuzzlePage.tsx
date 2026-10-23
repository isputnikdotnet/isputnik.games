import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Lightbulb, RotateCcw, Settings2, SkipForward } from "lucide-react";
import { Chess, type ChessMove, type ChessState, type PlayerIndex, type PuzzleLevel } from "@isputnik/games-engine";
import { fetchNextPuzzle, reportPuzzleResult, type PuzzleMe, type PuzzleOffer, type PuzzleResult } from "../../api";
import { Button } from "../../shared/Button";
import { Comms } from "../../shared/Comms";
import type { CommsLine } from "../../shared/commsLines";
import { GameStage } from "../../shared/GameStage";
import { MessageBox } from "../../shared/MessageBox";
import { play } from "../../shared/sound";
import { localSan } from "./comms";
import { ChessSettingsDialog } from "./SettingsDialog";
import { ChessTable } from "./ChessTable";

// Chess puzzles: the server hands over a position and its line, the other
// side's move plays itself, and the solver finds the rest. A wrong move is
// taken back and may be tried again, but the try already counts as missed.
// Hints come in two steps — the piece to move, then where it goes — and each
// costs: the piece halves what a solve earns, the move shown makes it nothing. The first
// try at a puzzle moves the solver's rating (the server does the maths);
// "Try again" and a repeat are practice.

type Phase = "loading" | "error" | "setup" | "solving" | "solved" | "shown";
type Choice = PuzzleLevel | "auto";

const LEVEL_KEY = "isputnik-games.chess.puzzleLevel";
/** How long the other side "thinks" before a move plays itself. */
export const PUZZLE_DELAY = { ms: 600 };

function loadLevel(): Choice {
  try {
    const saved = localStorage.getItem(LEVEL_KEY);
    return saved && (saved === "auto" || (Chess.PUZZLE_LEVELS as readonly string[]).includes(saved)) ? (saved as Choice) : "auto";
  } catch {
    return "auto";
  }
}

function saveLevel(level: Choice) {
  try {
    if (level === "auto") localStorage.removeItem(LEVEL_KEY);
    else localStorage.setItem(LEVEL_KEY, level);
  } catch {
    /* private mode: the level holds for this visit */
  }
}

export function ChessPuzzlePage() {
  const { t } = useTranslation();
  const [level, setLevel] = useState<Choice>(loadLevel);
  const [offer, setOffer] = useState<PuzzleOffer | null>(null);
  const [me, setMe] = useState<PuzzleMe | null>(null);
  const [state, setState] = useState<ChessState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState(0);
  const [hints, setHints] = useState(0);
  const [hintNow, setHintNow] = useState(0);
  const [missed, setMissed] = useState(false);
  /** Tried again after the first go: practice. */
  const [again, setAgain] = useState(false);
  const [result, setResult] = useState<PuzzleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Each puzzle (and each restart) gets a turn number; a timer from an older
  // one finds it changed and does nothing.
  const turn = useRef(0);
  const reported = useRef(false);

  const later = useCallback((fn: () => void, ms = PUZZLE_DELAY.ms) => {
    const mine = turn.current;
    window.setTimeout(() => {
      if (turn.current === mine) fn();
    }, ms);
  }, []);

  /** Puts the puzzle on the board as it was before the other side's move, then plays that. */
  const begin = useCallback((next: PuzzleOffer) => {
    turn.current++;
    const start = Chess.puzzleStart(next.puzzle);
    setState(start.before);
    setStep(0);
    setHintNow(0);
    setPhase("setup");
    later(() => {
      setState(start.state);
      setPhase("solving");
    });
  }, [later]);

  const load = useCallback((choice: Choice) => {
    turn.current++;
    setPhase("loading");
    setError(null);
    fetchNextPuzzle(choice).then((next) => {
      reported.current = false;
      setOffer(next);
      setMe(next.me);
      setHints(0);
      setMissed(false);
      setAgain(false);
      setResult(null);
      begin(next);
    }, (failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
      setPhase("error");
    });
  }, [begin]);

  useEffect(() => {
    load(loadLevel());
  }, [load]);

  const report = (solved: boolean) => {
    if (!offer || reported.current) return;
    reported.current = true;
    reportPuzzleResult(offer.puzzle.id, { solved, hints }).then((answer) => {
      setResult(answer);
      setMe(answer.me);
    }, (failure: unknown) => setError(failure instanceof Error ? failure.message : String(failure)));
  };

  if (phase === "loading" && !offer) {
    return <GameStage className="chess-stage" title={t("chess.puzzle.title")} board={<div className="puzzle-board-wait" />} score={<p className="muted">{t("chess.puzzle.loading")}</p>} />;
  }
  if (phase === "error" && !offer) {
    return (
      <GameStage
        className="chess-stage"
        title={t("chess.puzzle.title")}
        board={<div className="puzzle-board-wait" />}
        notices={<MessageBox tone="error" title={t("chess.puzzle.errorTitle")}>{error}</MessageBox>}
        actions={<Button variant="primary" onClick={() => load(level)}>{t("chess.puzzle.next")}</Button>}
      />
    );
  }
  if (!offer || !state) return null;

  const puzzle = offer.puzzle;
  const start = Chess.puzzleStart(puzzle);
  const solver = start.solver;
  const side = (seat: PlayerIndex) => t(seat === 0 ? "chess.players.white" : "chess.players.black");
  const names: [string, string] = solver === 0 ? [t("chess.puzzle.you"), side(1)] : [side(0), t("chess.puzzle.you")];
  const expected = Chess.uciMove(puzzle.moves[1 + step * 2] ?? puzzle.moves[1]);
  const hint = phase === "solving" && hintNow > 0 ? { from: expected.from, to: hintNow > 1 ? expected.to : undefined } : null;

  const onMove = (move: ChessMove) => {
    if (phase !== "solving") return;
    const answer = Chess.checkPuzzleMove(puzzle, step, state, move);
    const played = Chess.applyMove(state, move);
    if (answer.kind === "wrong") {
      // Show the move, then take it back: the solver may try again, but the
      // first try is a miss.
      setState(played);
      setPhase("setup");
      setMissed(true);
      play("lose");
      report(false);
      later(() => {
        setState(state);
        setPhase("solving");
      });
      return;
    }
    setState(played);
    setHintNow(0);
    if (answer.kind === "solved") {
      setPhase("solved");
      play("win");
      report(!missed);
      return;
    }
    setPhase("setup");
    setStep(step + 1);
    later(() => {
      setState(Chess.applyMove(played, answer.reply));
      setPhase("solving");
    });
  };

  const askHint = () => {
    const next = Math.min(2, hintNow + 1);
    setHintNow(next);
    setHints((used) => Math.max(used, next));
  };

  // The line from here to the end, one move at a time.
  const showSolution = () => {
    if (phase !== "solving") return;
    report(false);
    setPhase("shown");
    setHintNow(0);
    const rest = puzzle.moves.slice(1 + step * 2).map(Chess.uciMove);
    let position = state;
    rest.forEach((move, index) => {
      position = Chess.applyMove(position, move);
      const at = position;
      later(() => setState(at), index === 0 ? 0 : PUZZLE_DELAY.ms * index);
    });
  };

  const retry = () => {
    setMissed(false);
    setHints(0);
    setAgain(true);
    begin(offer);
  };

  const changeLevel = (choice: Choice) => {
    setLevel(choice);
    saveLevel(choice);
    setSettingsOpen(false);
    load(choice);
  };

  const levelName = (choice: Choice) => t(`chess.puzzle.levels.${choice}`);
  const practice = offer.repeat || again || (result !== null && !result.recorded);
  let statusLine: string;
  if (phase === "solved") statusLine = missed ? t("chess.puzzle.solvedAfterMiss") : t("chess.puzzle.solved");
  else if (phase === "shown") statusLine = t("chess.puzzle.shown");
  else if (phase === "setup" && step === 0 && state.moves.length === 0) statusLine = t("chess.puzzle.watch", { side: side(solver === 0 ? 1 : 0) });
  else statusLine = t("chess.puzzle.find", { side: side(solver) });
  const change = result && result.recorded ? result.after - result.before : null;

  const letters = t("chess.sanLetters");
  const lines: CommsLine[] = [];
  let replay = start.before;
  state.moves.forEach((move, index) => {
    const san = Chess.describeMove(replay, move)?.san ?? "?";
    const mover = replay.toMove;
    lines.push({
      key: `m${index}`,
      kind: "event",
      who: mover === solver ? "you" : "them",
      name: mover === solver ? t("chess.puzzle.you") : side(mover),
      text: `${replay.fullmove}${mover === 0 ? "." : "…"} ${localSan(san, letters)}`
    });
    replay = Chess.applyMove(replay, move);
  });
  if (missed && phase === "solving") lines.push({ key: "missed", kind: "system", text: t("chess.puzzle.wrong") });
  if (hint) lines.push({ key: "hint", kind: "system", text: hint.to ? t("chess.puzzle.hintSquare") : t("chess.puzzle.hintPiece") });

  const done = phase === "solved" || phase === "shown";

  return (
    <>
      <GameStage
        className="chess-stage puzzle-stage"
        title={t("chess.puzzle.title")}
        board={<ChessTable state={state} orientation={solver} movable={phase === "solving" ? solver : null} onMove={onMove} names={names} hint={hint} />}
        score={
          <div className="chess-status">
            <p className={`chess-status-line${done ? " is-finished" : ""}`} role="status">{statusLine}</p>
            {puzzle.mateIn && !done && <p className="chess-reason puzzle-goal">{t("chess.puzzle.mateIn", { count: puzzle.mateIn })}</p>}
            <p className="muted chess-reason">{t("chess.puzzle.about", { level: levelName(puzzle.level), rating: puzzle.rating })}</p>
            {me && (
              <p className="puzzle-rating">
                <span className="muted">{t("chess.puzzle.yourRating")}</span>{" "}
                <strong>{me.rating}</strong>
                {change !== null && (
                  <span className={`puzzle-change ${change > 0 ? "is-up" : change < 0 ? "is-down" : ""}`}>
                    {change > 0 ? `+${change}` : change < 0 ? `−${-change}` : "±0"}
                  </span>
                )}
              </p>
            )}
            {me && me.streak > 1 && <p className="muted chess-reason">{t("chess.puzzle.streak", { count: me.streak })}</p>}
          </div>
        }
        notices={
          <>
            {practice && <MessageBox tone="info" title={t("chess.puzzle.practiceTitle")}>{offer.repeat ? t("chess.puzzle.repeat") : t("chess.puzzle.practice")}</MessageBox>}
            {error && <MessageBox tone="error" title={t("chess.puzzle.saveError")}>{error}</MessageBox>}
          </>
        }
        log={<Comms lines={lines} />}
        actions={
          done ? (
            <>
              <Button variant="primary" onClick={() => load(level)}>
                <SkipForward size={16} aria-hidden="true" /> {t("chess.puzzle.next")}
              </Button>
              <Button variant="secondary" onClick={retry}>
                <RotateCcw size={16} aria-hidden="true" /> {t("chess.puzzle.retry")}
              </Button>
              <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={16} aria-hidden="true" /> {t("chess.settings.open")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={askHint} disabled={phase !== "solving" || hintNow >= 2}>
                <Lightbulb size={16} aria-hidden="true" /> {hintNow === 0 ? t("chess.puzzle.hint") : t("chess.puzzle.hintMore")}
              </Button>
              <Button variant="secondary" onClick={showSolution} disabled={phase !== "solving"}>
                <Eye size={16} aria-hidden="true" /> {t("chess.puzzle.solution")}
              </Button>
              <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={16} aria-hidden="true" /> {t("chess.settings.open")}
              </Button>
              <Button variant="secondary" onClick={() => load(level)}>
                <SkipForward size={16} aria-hidden="true" /> {t("chess.puzzle.skip")}
              </Button>
            </>
          )
        }
      />
      {settingsOpen && (
        <ChessSettingsDialog<Choice>
          level={{
            label: t("chess.puzzle.levelLabel"),
            value: level,
            options: (["auto", ...Chess.PUZZLE_LEVELS] as Choice[]).map((value) => ({ value, label: levelName(value) })),
            onChange: changeLevel
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
