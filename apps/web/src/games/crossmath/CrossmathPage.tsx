import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Lightbulb, RotateCcw, Timer, Undo2 } from "lucide-react";
import { Crossmath, type CrossmathLevel, type CrossmathPlay, type CrossmathPuzzle } from "@isputnik/games-engine";
import { fetchCrossmathMe, reportCrossmathResult, type CrossmathMe, type CrossmathResult } from "../../api";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameStage } from "../../shared/GameStage";
import { MessageBox, type MessageTone } from "../../shared/MessageBox";
import { play as sound } from "../../shared/sound";
import { PHONE, useMediaQuery } from "../../shared/useMediaQuery";
import { CrossmathBoard, type BoardMarks } from "./CrossmathBoard";
import { loadCrossmath, saveCrossmath, type CrossmathSave, type PuzzleProgress } from "./storage";

// Crossmath on screen: the printed board, the tile bank, and Undo · Hint ·
// Check · Restart. The page keeps what lasts (the save: level, puzzle, tiles,
// time; the member's record from the server: rating and solves); the game below
// it, keyed by puzzle, keeps what does not (the undo trail, the chosen tile,
// what Check last marked). Solved puzzles are stepped over when a level opens
// and by Next puzzle; the arrows still go back to one to play it again.

const fresh = (puzzle: CrossmathPuzzle): PuzzleProgress => ({ play: Crossmath.emptyPlay(puzzle), elapsed: 0, hintsUsed: 0, solved: false, reported: false });

/** Solved on this device, or on the member's record from any device. */
const isDone = (save: CrossmathSave, me: CrossmathMe | null, id: string) => save.puzzles[id]?.solved === true || me?.puzzles[id] !== undefined;

/** Moves an opening level off a solved puzzle onto the next one to do. A solved
 *  puzzle being played again keeps its place, and a level with none left stays put. */
function skipDone(save: CrossmathSave, me: CrossmathMe | null, level: CrossmathLevel): CrossmathSave {
  const number = save.current[level] ?? 1;
  const id = `${level}-${number}`;
  const replaying = !save.puzzles[id]?.solved && save.puzzles[id]?.play.cells.some((tile) => tile !== null);
  if (replaying || !isDone(save, me, id)) return save;
  const next = Crossmath.nextUndone(level, number, (each) => isDone(save, me, each));
  return next === null ? save : { ...save, current: { ...save.current, [level]: next } };
}

export function CrossmathPage() {
  const [save, setSave] = useState<CrossmathSave>(() => {
    const loaded = loadCrossmath();
    return skipDone(loaded, null, loaded.level);
  });
  /** The member's record; null for a guest, offline, or until it arrives. */
  const [me, setMe] = useState<CrossmathMe | null>(null);
  const [answers, setAnswers] = useState<Record<string, CrossmathResult>>({});
  const level = save.level;
  const number = save.current[level] ?? 1;
  const puzzle = useMemo(() => Crossmath.puzzleOf(level, number), [level, number]);
  const progress = save.puzzles[puzzle.id] ?? fresh(puzzle);

  useEffect(() => saveCrossmath(save), [save]);

  useEffect(() => {
    let live = true;
    fetchCrossmathMe().then((answer) => {
      if (!live) return;
      setMe(answer);
      setSave((prev) => skipDone(prev, answer, prev.level));
    }, () => {
      /* a guest, or offline: the puzzles still play, on this device */
    });
    return () => {
      live = false;
    };
  }, []);

  // Every solve the server does not have yet goes to it, one at a time so the
  // ratings follow in order: this one, and any left unsent by an earlier visit.
  // One that fails waits for the page's next opening, not the next clock tick.
  const sent = useRef(new Set<string>());
  const sending = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!me) return;
    for (const [id, done] of Object.entries(save.puzzles)) {
      if (!done.solved || done.reported || sent.current.has(id)) continue;
      sent.current.add(id);
      sending.current = sending.current.then(() =>
        reportCrossmathResult(id, { play: done.play, hints: done.hintsUsed, seconds: Math.min(done.elapsed, 86_400) || null }).then((answer) => {
          setMe(answer.me);
          setAnswers((prev) => ({ ...prev, [id]: answer }));
          setSave((prev) => {
            const now = prev.puzzles[id];
            return now?.solved ? { ...prev, puzzles: { ...prev.puzzles, [id]: { ...now, reported: true } } } : prev;
          });
        }, () => undefined)
      );
    }
  }, [me, save.puzzles]);

  // The clock runs while the puzzle is open and unsolved and the page in view, shown or not.
  const running = !progress.solved;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setSave((prev) => {
        const id = puzzle.id;
        const now = prev.puzzles[id] ?? fresh(puzzle);
        return { ...prev, puzzles: { ...prev.puzzles, [id]: { ...now, elapsed: now.elapsed + 1 } } };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, puzzle]);

  const setProgress = (next: PuzzleProgress) => setSave((prev) => ({ ...prev, puzzles: { ...prev.puzzles, [puzzle.id]: { ...next, elapsed: prev.puzzles[puzzle.id]?.elapsed ?? next.elapsed } } }));
  const restart = () => {
    sent.current.delete(puzzle.id);
    setAnswers((prev) => {
      const { [puzzle.id]: _gone, ...rest } = prev;
      return rest;
    });
    setSave((prev) => ({ ...prev, puzzles: { ...prev.puzzles, [puzzle.id]: fresh(puzzle) } }));
  };
  /** A number goes to that puzzle; a level alone opens on its next one to do. */
  const open = (nextLevel: CrossmathLevel, nextNumber?: number) =>
    setSave((prev) => {
      const moved = { ...prev, level: nextLevel };
      return nextNumber === undefined ? skipDone(moved, me, nextLevel) : { ...moved, current: { ...prev.current, [nextLevel]: nextNumber } };
    });

  return (
    <CrossmathGame
      key={puzzle.id}
      puzzle={puzzle}
      number={number}
      progress={progress}
      timer={!save.clockHidden}
      done={isDone(save, me, puzzle.id)}
      nextNumber={Crossmath.nextUndone(level, number, (id) => isDone(save, me, id))}
      me={me}
      answer={answers[puzzle.id] ?? null}
      onProgress={setProgress}
      onRestart={restart}
      onOpen={open}
      onTimer={() => setSave((prev) => ({ ...prev, clockHidden: !prev.clockHidden }))}
    />
  );
}

interface Message {
  tone: MessageTone;
  title: string;
  body?: string;
  /** Offer the next puzzle under it. */
  next?: boolean;
}

const lineKey = (line: Crossmath.Line) => `${line.kind}${line.index}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const signed = (change: number) => (change > 0 ? `+${change}` : change < 0 ? `−${-change}` : "±0");

function CrossmathGame({
  puzzle,
  number,
  progress,
  timer,
  done: alreadyDone,
  nextNumber,
  me,
  answer,
  onProgress,
  onRestart,
  onOpen,
  onTimer
}: {
  puzzle: CrossmathPuzzle;
  number: number;
  progress: PuzzleProgress;
  timer: boolean;
  done: boolean;
  /** The next puzzle to do in this level; null when none is left. */
  nextNumber: number | null;
  me: CrossmathMe | null;
  /** What the server made of this solve, once it has answered. */
  answer: CrossmathResult | null;
  onProgress: (next: PuzzleProgress) => void;
  onRestart: () => void;
  onOpen: (level: CrossmathLevel, number?: number) => void;
  onTimer: () => void;
}) {
  const { t } = useTranslation();
  const phone = useMediaQuery(PHONE);
  const { play, solved } = progress;
  const tiles = useMemo(() => Crossmath.tilesOf(puzzle), [puzzle]);
  const blanks = useMemo(() => Crossmath.blankCells(puzzle), [puzzle]);
  const firstEmpty = (cells: CrossmathPlay["cells"]) => blanks.find((cell) => cells[cell] == null) ?? null;

  const [undo, setUndo] = useState<CrossmathPlay[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  // The empty square the player chose, if any. None is chosen for them: a tile
  // tapped first is picked up, and the square tapped next is where it goes.
  const [target, setTarget] = useState<number | null>(null);
  const [focus, setFocus] = useState<number>(() => firstEmpty(play.cells) ?? 0);
  const [marks, setMarks] = useState<BoardMarks>({});
  const [dropped, setDropped] = useState<number | null>(null);
  const [message, setMessage] = useState<Message | null>(() => (solved ? solvedMessage(progress) : null));
  const [spoken, setSpoken] = useState("");
  const [confirming, setConfirming] = useState(false);
  const typed = useRef({ text: "", at: 0 });
  const used = Crossmath.usedTiles(play);
  const n = puzzle.n;
  const where = (cell: number) => ({ row: Math.floor(cell / n) + 1, col: (cell % n) + 1 });
  const level = puzzle.level;
  const count = Crossmath.puzzleCount(level);

  function solvedMessage(done: PuzzleProgress): Message {
    const hints = done.hintsUsed;
    const body = [hints ? t("crossmath.solved.hints", { count: hints }) : t("crossmath.solved.noHints")];
    if (done.elapsed) body.push(t("crossmath.solved.time", { time: clock(done.elapsed) }));
    return { tone: "success", title: t("crossmath.solved.title"), body: body.join(" "), next: true };
  }

  /** Every change of tiles goes through here: the undo trail, the save, and the solved check. */
  const commit = (next: CrossmathPlay, note: Message | null = null, byHint = false) => {
    setUndo((trail) => [...trail, play].slice(-200));
    const done = Crossmath.isSolved(puzzle, next);
    const nextProgress = { ...progress, play: next, solved: done, hintsUsed: progress.hintsUsed + (byHint ? 1 : 0) };
    onProgress(nextProgress);
    setMarks({});
    if (done) {
      setTarget(null);
      setSelected(null);
      setMessage(solvedMessage(nextProgress));
      setSpoken(t("crossmath.solved.title"));
      sound("win");
    } else setMessage(note);
  };

  const place = (tile: number, cell: number, byHint = false, note: Message | null = null) => {
    const next = Crossmath.placeTile(puzzle, play, tile, cell, byHint);
    setSelected(null);
    setDropped(cell);
    setTarget(null);
    setFocus(cell);
    sound("tilePlace");
    setSpoken(t("crossmath.placed", { value: tiles[tile], ...where(cell) }));
    commit(next, note, byHint);
  };

  const sendBack = (cell: number) => {
    const tile = play.cells[cell];
    if (tile == null) return;
    setTarget(cell);
    setFocus(cell);
    sound("tileReturn");
    setSpoken(t("crossmath.returned", { value: tiles[tile] }));
    commit(Crossmath.takeBack(play, cell));
  };

  const onCell = (cell: number) => {
    if (solved) return;
    setFocus(cell);
    if (Crossmath.isGiven(puzzle, cell)) return;
    if (play.cells[cell] != null) sendBack(cell);
    else if (selected != null) place(selected, cell);
    else setTarget(cell);
  };

  const onTile = (tile: number) => {
    if (solved || used.has(tile)) return;
    if (target != null && play.cells[target] == null) place(tile, target);
    else setSelected(selected === tile ? null : tile);
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, cell: number, focusCell: (cell: number) => void) => {
    const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
    if (step) {
      event.preventDefault();
      const r = Math.min(n - 1, Math.max(0, Math.floor(cell / n) + step[0]));
      const c = Math.min(n - 1, Math.max(0, (cell % n) + step[1]));
      const next = r * n + c;
      setFocus(next);
      if (!solved && !Crossmath.isGiven(puzzle, next) && play.cells[next] == null) setTarget(next);
      focusCell(next);
      return;
    }
    if (solved || Crossmath.isGiven(puzzle, cell)) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      // Two digits typed close together make one number: 1 then 0 is a 10.
      const now = Date.now();
      let text = now - typed.current.at < 800 ? typed.current.text + event.key : event.key;
      const mine = play.cells[cell];
      const find = (value: number) => tiles.findIndex((v, index) => v === value && (!used.has(index) || index === mine));
      let tile = find(Number(text));
      if (tile < 0 && text.length > 1) {
        text = event.key;
        tile = find(Number(text));
      }
      typed.current = { text, at: now };
      if (tile >= 0) place(tile, cell);
      else setMessage({ tone: "info", title: t("crossmath.noTile", { value: text }) });
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      sendBack(cell);
    } else if (event.key === "Escape") setSelected(null);
  };

  const doUndo = () => {
    const previous = undo.at(-1);
    if (!previous || solved) return;
    setUndo(undo.slice(0, -1));
    onProgress({ ...progress, play: previous });
    setMarks({});
    setSelected(null);
    setMessage(null);
    setTarget(null);
    setSpoken(t("crossmath.undone"));
  };

  // Ctrl+Z (⌘Z) undoes from anywhere on the page, except while a dialog is open.
  const undoRef = useRef(doUndo);
  useEffect(() => {
    undoRef.current = doUndo;
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !confirming) {
        event.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  const lineName = (line: Crossmath.Line) => t(line.kind === "row" ? "crossmath.rowLower" : "crossmath.colLower", { number: line.index + 1 });

  const doCheck = () => {
    const verdict = Crossmath.verdictOf(puzzle, play);
    const results = Crossmath.lineResults(puzzle, play);
    if (verdict.kind === "incorrect") {
      setMarks({ bad: new Set(verdict.wrong.map(lineKey)), good: new Set(results.filter((r) => r.holds).map((r) => lineKey(r.line))) });
      setMessage({ tone: "error", title: t("crossmath.check.incorrect"), body: t("crossmath.check.wrongLines", { count: verdict.wrong.length, lines: verdict.wrong.map(lineName).join(", ") }) });
    } else if (verdict.kind === "incomplete") {
      setMarks({ good: new Set(results.filter((r) => r.holds).map((r) => lineKey(r.line))) });
      setMessage({ tone: "info", title: t("crossmath.check.incomplete"), body: t("crossmath.check.empty", { count: verdict.empty }) });
    }
  };

  const doHint = () => {
    const hint = Crossmath.hintFor(puzzle, play, target);
    if (!hint) return;
    if (hint.kind === "wrong") {
      setMarks({ flag: hint.cell });
      setFocus(hint.cell);
      setMessage({ tone: "warning", title: t("crossmath.hint.wrongTitle"), body: t("crossmath.hint.wrongBody", { value: tiles[play.cells[hint.cell]!], ...where(hint.cell) }) });
      return;
    }
    place(hint.tile, hint.cell, true, { tone: "info", title: t("crossmath.hint.placedTitle"), body: t("crossmath.hint.placedBody", { value: tiles[hint.tile], ...where(hint.cell) }) });
  };

  const levelName = t(`crossmath.levels.${level}`);
  const left = tiles.length - used.size;
  const standing = me?.levels[level];
  const harder = Crossmath.harderLevel(level);
  const offerHarder = harder !== null && standing?.ready === true;

  // A phone has no room for four chips beside the puzzle number: a menu there.
  const levels = phone ? (
    <label className="crossmath-level-menu">
      <span className="visually-hidden">{t("crossmath.level")}</span>
      <select value={level} onChange={(event) => onOpen(event.target.value as CrossmathLevel)}>
        {Crossmath.LEVELS.map((each) => <option key={each} value={each}>{t(`crossmath.levels.${each}`)}</option>)}
      </select>
    </label>
  ) : (
    <div className="crossmath-levels" role="group" aria-label={t("crossmath.level")}>
      {Crossmath.LEVELS.map((each) => (
        <Button key={each} variant="chip" selected={each === level} onClick={() => onOpen(each)} title={t(`crossmath.levelHint.${each}`)}>
          {t(`crossmath.levels.${each}`)}
        </Button>
      ))}
    </div>
  );

  const header = (
    <div className="crossmath-head">
      {!phone && levels}
      <div className="crossmath-edition">
        {phone && levels}
        <Button variant="icon" aria-label={t("crossmath.previous")} title={t("crossmath.previous")} disabled={number <= 1} onClick={() => onOpen(level, number - 1)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <span className="crossmath-number">
          {t("crossmath.number", { number, count })}
          {alreadyDone && <Check size={14} className="crossmath-solved-mark" aria-label={t("crossmath.solvedMark")} />}
        </span>
        <Button variant="icon" aria-label={t("crossmath.next")} title={t("crossmath.next")} disabled={number >= count} onClick={() => onOpen(level, number + 1)}>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        <span className="crossmath-spacer" />
        {timer && <span className="crossmath-clock" aria-label={t("crossmath.time")}>{clock(progress.elapsed)}</span>}
        <Button variant="chip" selected={timer} onClick={onTimer} aria-label={t("crossmath.timer")} title={t("crossmath.timer")}>
          <Timer size={14} aria-hidden="true" />
        </Button>
      </div>
      {!phone && <p className="crossmath-size">{t(`crossmath.levelHint.${level}`)}</p>}
      {me && standing && (
        <p className="crossmath-stats">
          <strong>{t("crossmath.stats.rating", { rating: me.rating })}</strong>
          <span>{t("crossmath.stats.solved", { solved: standing.solved, total: standing.count })}</span>
          {standing.bestSeconds !== null && <span>{t("crossmath.stats.best", { time: clock(standing.bestSeconds) })}</span>}
        </p>
      )}
    </div>
  );

  const bank = (
    <div className="crossmath-bank-wrap">
      <div className="crossmath-bank-label">
        <span id={`crossmath-bank-${puzzle.id}`}>{t("crossmath.tiles")}</span>
        <span>{solved ? t("crossmath.allPlaced") : t("crossmath.tilesLeft", { count: left })}</span>
      </div>
      <div
        className="crossmath-bank"
        role="group"
        aria-labelledby={`crossmath-bank-${puzzle.id}`}
        style={{ ["--cols-wide" as string]: Math.ceil(tiles.length / Math.ceil(tiles.length / 6)), ["--cols-narrow" as string]: Math.ceil(tiles.length / Math.ceil(tiles.length / 8)) }}
      >
        {tiles.map((value, index) => {
          const isUsed = used.has(index);
          return (
            <Button
              key={index}
              variant="bare"
              className={`crossmath-bank-tile${isUsed ? " is-used" : ""}${selected === index ? " is-selected" : ""}`}
              aria-pressed={selected === index}
              aria-label={isUsed ? t("crossmath.tilePlaced", { value }) : t("crossmath.tile", { value })}
              disabled={isUsed || solved}
              onClick={() => onTile(index)}
            >
              <span className="crossmath-tile">{value}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  const notice = message && (
    <div className="crossmath-message">
      <MessageBox tone={message.tone} title={message.title}>{message.body}</MessageBox>
      {message.next && (
        <>
          {answer && (
            <p className="crossmath-result">
              {answer.recorded ? t("crossmath.result.rated", { after: answer.after, change: signed(answer.after - answer.before) }) : t("crossmath.result.practice", { rating: answer.after })}
              {answer.newBest && ` ${t("crossmath.result.newBest")}`}
            </p>
          )}
          {nextNumber === null && <p className="crossmath-result">{t("crossmath.result.levelDone")}</p>}
          {offerHarder && harder && <p className="crossmath-result">{t("crossmath.result.offer", { level: levelName, harder: t(`crossmath.levels.${harder}`) })}</p>}
          <div className="crossmath-next">
            {nextNumber !== null && <Button variant="primary" onClick={() => onOpen(level, nextNumber)}>{t("crossmath.nextPuzzle")}</Button>}
            {harder && (offerHarder || nextNumber === null) && (
              <Button variant={nextNumber === null ? "primary" : "secondary"} onClick={() => onOpen(harder)}>
                {t("crossmath.result.tryLevel", { level: t(`crossmath.levels.${harder}`) })}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const board = (
    <CrossmathBoard
      puzzle={puzzle}
      play={play}
      solved={solved}
      target={target}
      focus={focus}
      marks={marks}
      dropped={dropped}
      onCell={onCell}
      onKey={onKey}
    />
  );

  const actions = (
    <>
      <Button variant="secondary" onClick={doUndo} disabled={!undo.length || solved}><Undo2 size={16} aria-hidden="true" /> {t("crossmath.actions.undo")}</Button>
      <Button variant="secondary" onClick={doHint} disabled={solved}><Lightbulb size={16} aria-hidden="true" /> {t("crossmath.actions.hint")}</Button>
      <Button variant="primary" onClick={doCheck} disabled={solved}><Check size={16} aria-hidden="true" /> {t("crossmath.actions.check")}</Button>
      <Button variant="secondary" onClick={() => setConfirming(true)}><RotateCcw size={16} aria-hidden="true" /> {t("crossmath.actions.restart")}</Button>
    </>
  );

  const rules = (
    <details className="crossmath-rules" open={!phone}>
      <summary>{t("crossmath.rules.title")}</summary>
      <ul>
        <li>{t("crossmath.rules.goal")}</li>
        <li><strong>{t("crossmath.rules.precedence")}</strong> {t("crossmath.rules.whole")}</li>
        <li>{t("crossmath.rules.givens")}</li>
        <li>{t("crossmath.rules.taps")}</li>
        <li className="crossmath-keys">{t("crossmath.rules.keys")}</li>
        <li>{t("crossmath.rules.rating")}</li>
      </ul>
    </details>
  );

  return (
    <>
      {/* A phone: the board and the bank, then the actions under the thumb, then what Check or Hint said. */}
      <GameStage
        className="crossmath"
        title={t("games.crossmath.name")}
        score={header}
        board={phone ? <>{board}{bank}</> : board}
        notices={phone ? notice : <>{bank}{notice}</>}
        log={message?.next ? undefined : rules}
        actions={actions}
      />
      <div className="visually-hidden" aria-live="polite">{spoken}</div>
      {confirming && (
        <Dialog
          title={t("crossmath.restart.title", { level: levelName, number })}
          onClose={() => setConfirming(false)}
          cancelLabel={t("crossmath.restart.cancel")}
          confirmLabel={t("crossmath.restart.confirm")}
          danger
          onConfirm={() => {
            setConfirming(false);
            setUndo([]);
            setMarks({});
            setSelected(null);
            setMessage(null);
            setTarget(null);
            onRestart();
          }}
        >
          {t("crossmath.restart.body")}
        </Dialog>
      )}
    </>
  );
}
