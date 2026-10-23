import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, List, Repeat2, Settings2 } from "lucide-react";
import { Chess, type AiLevel, type ChessMove, type ChessState, type PlayerIndex } from "@isputnik/games-engine";
import { fetchGameRecord, fetchMatch, type ReviewMode } from "../../api";
import { Button } from "../../shared/Button";
import { GameStage } from "../../shared/GameStage";
import { MessageBox } from "../../shared/MessageBox";
import { follow, href } from "../../router";
import { chessReason } from "./ending";
import { localSan } from "./comms";
import { ChessSettingsDialog } from "./SettingsDialog";
import { ChessTable } from "./ChessTable";

// A finished game, to step through: the board at any move, the move list
// beside it (tap a move to go there), and Start / Back / Next / End — the
// arrow keys and Home / End too. It opens at the final position. A game kept
// from one device comes from /records, an online one from its match.

interface ReviewGame {
  names: [string, string];
  moves: ChessMove[];
  winner: PlayerIndex | null;
  reason: string | null;
  finishedAt: string | null;
  mode: ReviewMode;
  level: AiLevel | null;
  /** The seat the board faces: the member's, or White. */
  facing: PlayerIndex;
}

const LEVEL_LABEL = { easy: "chess.setup.levelEasy", normal: "chess.setup.levelNormal", hard: "chess.setup.levelHard" } as const;

export function ChessReviewPage({ source, id }: { source: "record" | "match"; id: string }) {
  const { t, i18n } = useTranslation();
  const [game, setGame] = useState<ReviewGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const load = source === "record"
      ? fetchGameRecord(id).then((record): ReviewGame => {
        const you = t("chess.puzzle.you");
        let names: [string, string];
        if (record.mode === "computer" && record.seat !== null) {
          const computer = record.level ? t("chess.review.computerAt", { level: t(LEVEL_LABEL[record.level]) }) : t("chess.players.computer");
          names = record.seat === 0 ? [you, computer] : [computer, you];
        } else {
          names = [t("chess.players.white"), t("chess.players.black")];
        }
        return { names, moves: record.moves, winner: record.winner, reason: record.reason, finishedAt: record.finishedAt, mode: record.mode, level: record.level, facing: record.seat ?? 0 };
      })
      : fetchMatch(id).then((match): ReviewGame => {
        if (match.game !== "chess" || match.status !== "finished") throw new Error(t("chess.review.notFinished"));
        return {
          names: [match.players[0].name, match.players[1].name],
          moves: (match.state as unknown as ChessState).moves,
          winner: match.winner,
          reason: match.finishReason,
          finishedAt: match.finishedAt,
          mode: "online",
          level: null,
          facing: 0
        };
      });
    load.then((loaded) => {
      if (!live) return;
      setGame(loaded);
      setPly(loaded.moves.length);
    }, (failure: unknown) => live && setError(failure instanceof Error ? failure.message : String(failure)));
    return () => {
      live = false;
    };
  }, [source, id, t]);

  // Every position in the game, once: stepping is then only an index.
  const positions = useMemo(() => {
    if (!game) return [];
    const out: ChessState[] = [Chess.createGame()];
    for (const move of game.moves) out.push(Chess.applyMove(out[out.length - 1], move));
    return out;
  }, [game]);

  const last = game ? game.moves.length : 0;
  const go = (to: number) => setPly(Math.max(0, Math.min(last, to)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (settingsOpen || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const moves: Record<string, (current: number) => number> = {
        ArrowLeft: (current) => current - 1,
        ArrowRight: (current) => current + 1,
        Home: () => 0,
        End: () => last
      };
      const step = moves[event.key];
      if (!step) return;
      event.preventDefault();
      setPly((current) => Math.max(0, Math.min(last, step(current))));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, settingsOpen]);

  if (error) {
    return (
      <GameStage
        className="chess-stage"
        title={t("chess.review.title")}
        board={<div className="puzzle-board-wait" />}
        notices={<MessageBox tone="error" title={t("chess.review.errorTitle")}>{error}</MessageBox>}
        actions={<a className="secondary-button" href={href("chess/games")} onClick={(event) => follow(event, href("chess/games"))}>{t("chess.review.myGames")}</a>}
      />
    );
  }
  if (!game || positions.length === 0) {
    return <GameStage className="chess-stage" title={t("chess.review.title")} board={<div className="puzzle-board-wait" />} score={<p className="muted">{t("chess.review.loading")}</p>} />;
  }

  const shown = positions[ply];
  const orientation: PlayerIndex = flipped ? (game.facing === 0 ? 1 : 0) : game.facing;
  const result = game.winner === null ? t("chess.end.draw") : t("chess.end.winner", { player: game.names[game.winner] });
  const reason = chessReason(game.reason, game.names[game.winner === 0 ? 1 : 0], t);
  const when = game.finishedAt ? new Date(game.finishedAt).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" }) : null;
  const kind = game.mode === "online" ? t("chess.review.online") : game.mode === "local" ? t("chess.review.local") : t("chess.review.computer");

  return (
    <>
      <GameStage
        className="chess-stage review-stage"
        title={t("chess.review.title")}
        board={<ChessTable state={shown} orientation={orientation} movable={null} onMove={() => undefined} names={game.names} />}
        score={
          <div className="chess-status">
            <p className="chess-status-line is-finished">{result}</p>
            {reason && <p className="muted chess-reason">{reason}</p>}
            <p className="muted chess-reason">{[t("chess.review.players", { white: game.names[0], black: game.names[1] }), kind, when].filter(Boolean).join(" · ")}</p>
          </div>
        }
        log={<MoveList game={game} positions={positions} ply={ply} onGo={go} />}
        actions={
          <>
            <div className="review-steps" role="group" aria-label={t("chess.review.steps")}>
              <Button variant="secondary" onClick={() => go(0)} disabled={ply === 0} aria-label={t("chess.review.start")} title={t("chess.review.start")}>
                <ChevronsLeft size={18} aria-hidden="true" />
              </Button>
              <Button variant="secondary" onClick={() => go(ply - 1)} disabled={ply === 0} aria-label={t("chess.review.back")} title={t("chess.review.back")}>
                <ChevronLeft size={18} aria-hidden="true" />
              </Button>
              <Button variant="secondary" onClick={() => go(ply + 1)} disabled={ply === last} aria-label={t("chess.review.next")} title={t("chess.review.next")}>
                <ChevronRight size={18} aria-hidden="true" />
              </Button>
              <Button variant="secondary" onClick={() => go(last)} disabled={ply === last} aria-label={t("chess.review.end")} title={t("chess.review.end")}>
                <ChevronsRight size={18} aria-hidden="true" />
              </Button>
            </div>
            <Button variant="secondary" onClick={() => setFlipped((f) => !f)}>
              <Repeat2 size={16} aria-hidden="true" /> {t("chess.flip")}
            </Button>
            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={16} aria-hidden="true" /> {t("chess.settings.open")}
            </Button>
            <a className="secondary-button" href={href("chess/games")} onClick={(event) => follow(event, href("chess/games"))}>
              <List size={16} aria-hidden="true" /> {t("chess.review.myGames")}
            </a>
          </>
        }
      />
      {settingsOpen && <ChessSettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

/** The moves in pairs, "12. Nf3 Nc6", each one a button to that position. */
function MoveList({ game, positions, ply, onGo }: { game: ReviewGame; positions: ChessState[]; ply: number; onGo: (ply: number) => void }) {
  const { t } = useTranslation();
  const letters = t("chess.sanLetters");
  const current = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    current.current?.scrollIntoView?.({ block: "nearest" });
  }, [ply]);

  const sans = game.moves.map((move, index) => localSan(Chess.describeMove(positions[index], move)?.san ?? "?", letters));
  const rows: { number: number; white: number | null; black: number | null }[] = [];
  sans.forEach((_san, index) => {
    if (index % 2 === 0) rows.push({ number: index / 2 + 1, white: index, black: null });
    else rows[rows.length - 1].black = index;
  });
  const cell = (index: number | null) => index === null ? <span /> : (
    <Button
      variant="bare"
      ref={index + 1 === ply ? current : undefined}
      className={`review-move${index + 1 === ply ? " is-current" : ""}`}
      aria-current={index + 1 === ply ? "step" : undefined}
      onClick={() => onGo(index + 1)}
    >
      {sans[index]}
    </Button>
  );

  return (
    <div className="review-moves" aria-label={t("chess.review.moves")}>
      <div className="review-moves-head">
        <span>{t("chess.review.moves")}</span>
        <span className="muted">{t("chess.review.at", { ply, count: game.moves.length })}</span>
      </div>
      {rows.length === 0 && <p className="muted">{t("chess.review.noMoves")}</p>}
      <ol className="review-move-list">
        {rows.map((row) => (
          <li key={row.number} className="review-move-row">
            <span className="review-move-number muted">{row.number}.</span>
            {cell(row.white)}
            {cell(row.black)}
          </li>
        ))}
      </ol>
    </div>
  );
}
