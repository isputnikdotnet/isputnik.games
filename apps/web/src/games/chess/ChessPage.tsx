import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, Handshake, History, List, LogOut, Repeat2, RotateCcw, Save, Settings2, Undo2 } from "lucide-react";
import { Chess, chess, type AiLevel, type ChessMove, type PlayerIndex } from "@isputnik/games-engine";
import { Comms } from "../../shared/Comms";
import { useFeed } from "../../shared/useFeed";
import { localSound, useGameSounds } from "../../shared/useGameSounds";
import { useComputerResult } from "../../shared/useComputerResult";
import type { CommsLine } from "../../shared/commsLines";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { GameStage } from "../../shared/GameStage";
import { follow, href, navigate } from "../../router";
import { fetchAdaptiveStrength } from "../../api";
import { chessLines } from "./comms";
import { chessReason } from "./ending";
import { clockLabel } from "./clockText";
import { ChessNewGameForm } from "./NewGameForm";
import { ChessTable } from "./ChessTable";
import { ChessSettingsDialog } from "./SettingsDialog";
import { humanSeat, isComputerSeat, useChessGame } from "./useChessGame";
import { useChessRecord } from "./useChessRecord";
import { ChessRatingLine } from "./RatingLine";
import { ReplayControls, ReplayNote, useReplay } from "./replay";
import { ShelvedGames } from "./ShelvedGames";
import type { ChessSetup } from "./storage";

const LEVEL_LABEL = { easy: "chess.setup.levelEasy", normal: "chess.setup.levelNormal", hard: "chess.setup.levelHard" } as const;

type Pending = "draw" | "resign" | "new" | "exit" | null;

const NO_MOVES: ChessMove[] = [];

// A game of chess on this device: against the computer, or two people taking
// turns at one screen (the board turns to face whoever is to move).
export function ChessPage() {
  const { t } = useTranslation();
  const controller = useChessGame();
  const [pending, setPending] = useState<Pending>(null);
  const [flipped, setFlipped] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The result dialog can be put aside to look at the final position; it
  // stays aside for that ending only.
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  const { game } = controller;
  const feed = useFeed(chess, {}, game?.state.moves ?? NO_MOVES);
  const me = game ? humanSeat(game.setup) : null;
  useGameSounds(game && localSound("chess", feed, me, game.state.status));
  const recordId = useChessRecord(game);
  // Looking back over the moves so far; the game stays at its last move.
  const moves = game?.state.moves ?? NO_MOVES;
  const replay = useReplay(moves.length);
  const earlier = useMemo(() => (replay.atEnd ? null : Chess.replay(moves.slice(0, replay.ply))), [moves, replay.atEnd, replay.ply]);
  const chessRating = useComputerResult(game && me !== null && game.state.status.kind === "finished"
    ? { game: "chess", key: game.key, level: game.setup.level, human: me, winner: game.state.status.winner, strength: game.setup.levelMode === "level" ? null : game.setup.strength }
    : null);

  const seatName = (setup: ChessSetup, seat: PlayerIndex) =>
    isComputerSeat(setup, seat) ? t("chess.players.computer") : t(seat === 0 ? "chess.players.white" : "chess.players.black");

  if (!game) {
    return (
      <section className="chess-page">
        <PageHead title={t("games.chess.name")} />
        <ChessNewGameForm onStart={controller.start} />
        <ShelvedGames onResume={controller.resume} />
        <p className="chess-my-games">
          <a className="text-link" href={href("chess/games")} onClick={(event) => follow(event, href("chess/games"))}>
            <List size={16} aria-hidden="true" /> {t("chess.review.myGamesLink")}
          </a>
        </p>
      </section>
    );
  }

  const { state, setup } = game;
  const status = state.status;
  const finished = status.kind === "finished";
  const endingKey = finished ? `${state.moves.length}:${status.reason}` : null;
  const showResult = endingKey !== null && resultDismissed !== endingKey;
  const names: [string, string] = [seatName(setup, 0), seatName(setup, 1)];

  // Against the computer the board faces you; two at one screen, whoever is to move.
  const facing: PlayerIndex = me ?? state.toMove;
  const orientation: PlayerIndex = flipped ? (facing === 0 ? 1 : 0) : facing;

  let statusLine: string;
  if (status.kind === "playing") {
    statusLine = controller.thinking
      ? t("chess.thinking")
      : t(state.check ? "chess.turnCheck" : "chess.turn", { player: names[status.turn] });
  } else {
    statusLine = status.winner === null ? t("chess.end.draw") : t("chess.end.winner", { player: names[status.winner] });
  }
  // The side that lost it: who resigned or ran out — on time with no winner, the side to move.
  const loser: PlayerIndex = status.kind === "finished" && status.winner !== null ? (status.winner === 0 ? 1 : 0) : state.toMove;
  const reason = finished ? chessReason(status.reason, names[loser], t, status.winner === null) : null;

  // "You" in the log is the person against the computer, or White when two share the screen.
  const lines: CommsLine[] = chessLines(feed, me ?? 0, names, t);
  if (status.kind === "finished") {
    lines.push({ key: "end", kind: "system", text: status.winner === null ? t("comms.draw") : t("comms.winner", { name: names[status.winner] }) });
  } else {
    lines.push({ key: "turn", kind: "system", text: status.turn === me ? t("comms.yourMove") : t("comms.toMove", { name: names[status.turn] }) });
  }

  const again = async () => {
    setFlipped(false);
    // Adaptive asks again where the player stands: the game just played has moved their rating.
    if (setup.mode === "computer" && setup.levelMode === "adaptive") {
      const fresh = await fetchAdaptiveStrength().catch(() => null);
      if (fresh) {
        controller.start({ ...setup, strength: fresh.strength, level: Chess.levelOfStrength(fresh.strength) });
        return;
      }
    }
    controller.start(setup);
  };

  // Leaving puts the game down for good, as in Star Battle: the lobby offers a new one.
  const exit = () => {
    controller.abandon();
    navigate(href());
  };

  return (
    <>
      <GameStage
        className="chess-stage"
        title={t("games.chess.name")}
        board={<ChessTable state={earlier ?? state} orientation={orientation} movable={earlier ? null : controller.humanToMove} onMove={controller.move} names={names} clock={controller.clock} />}
        score={
          <div className="chess-status">
            <p className={`chess-status-line${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>
            {reason && <p className="muted chess-reason">{reason}</p>}
            <ReplayNote replay={replay} />
            {finished && chessRating && <ChessRatingLine rating={chessRating} />}
            {setup.mode === "computer" && !finished && (
              <p className="muted chess-reason">{setup.levelMode === "level" || setup.strength === null
                ? t("chess.levelLine", { level: t(LEVEL_LABEL[setup.level]) })
                : t(setup.levelMode === "adaptive" ? "chess.strength.lineAdaptive" : "chess.strength.lineCustom", { strength: setup.strength, elo: Chess.strengthElo(setup.strength) })}</p>
            )}
            {setup.clock && !finished && <p className="muted chess-reason">{t("chess.clock.line", { clock: clockLabel(setup.clock, t) })}</p>}
          </div>
        }
        log={<Comms lines={lines} />}
        actions={
          <>
            <ReplayControls replay={replay} />
            {!finished && (
              <>
                {/* No takebacks on the clock. */}
                {!setup.clock && (
                  <Button variant="secondary" onClick={controller.undo} disabled={state.moves.length === 0 || controller.thinking}>
                    <Undo2 size={16} aria-hidden="true" /> {t("chess.undo")}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setFlipped((f) => !f)}>
                  <Repeat2 size={16} aria-hidden="true" /> {t("chess.flip")}
                </Button>
                <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                  <Settings2 size={16} aria-hidden="true" /> {t("chess.settings.open")}
                </Button>
                {setup.mode === "local" && (
                  <Button variant="secondary" onClick={() => setPending("draw")} disabled={state.moves.length === 0}>
                    <Handshake size={16} aria-hidden="true" /> {t("chess.offerDraw")}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setPending("resign")} disabled={state.moves.length === 0}>
                  <Flag size={16} aria-hidden="true" /> {t("chess.resign")}
                </Button>
                {state.moves.length > 0 && (
                  <Button variant="secondary" onClick={controller.shelve}>
                    <Save size={16} aria-hidden="true" /> {t("chess.saved.saveAndLeave")}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => (state.moves.length === 0 ? controller.abandon() : setPending("new"))}>
                  <RotateCcw size={16} aria-hidden="true" /> {t("chess.newGame")}
                </Button>
                <Button variant="secondary" onClick={() => (state.moves.length === 0 ? exit() : setPending("exit"))}>
                  <LogOut size={16} aria-hidden="true" /> {t("chess.exit")}
                </Button>
              </>
            )}
            {finished && (
              <>
                <Button variant="primary" onClick={() => void again()}>{t("chess.end.again")}</Button>
                <Button variant="secondary" onClick={controller.abandon}>{t("chess.end.change")}</Button>
                {recordId && (
                  <Button variant="secondary" onClick={() => navigate(href(`chess/review/${recordId}`))}>
                    <History size={16} aria-hidden="true" /> {t("chess.review.open")}
                  </Button>
                )}
                <Button variant="secondary" onClick={exit}>
                  <LogOut size={16} aria-hidden="true" /> {t("chess.end.toLobby")}
                </Button>
              </>
            )}
          </>
        }
      />

      {settingsOpen && (
        <ChessSettingsDialog<AiLevel>
          level={setup.mode === "computer" && !finished ? {
            label: t("chess.setup.level"),
            value: setup.level,
            options: (["easy", "normal", "hard"] as const).map((value) => ({ value, label: t(LEVEL_LABEL[value]) })),
            onChange: controller.setLevel
          } : undefined}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {showResult && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={t("chess.end.moves", { count: Math.ceil(state.moves.length / 2) })}
          reason={reason}
          primary={{ label: t("chess.end.again"), onClick: () => void again() }}
          secondary={{ label: t("chess.end.toLobby"), onClick: exit }}
          review={recordId ? { label: t("chess.review.open"), onClick: () => navigate(href(`chess/review/${recordId}`)) } : undefined}
          onClose={() => setResultDismissed(endingKey)}
        />
      )}
      {pending === "draw" && (
        <Dialog
          title={t("chess.confirmDraw.title")}
          confirmLabel={t("chess.confirmDraw.confirm")}
          cancelLabel={t("chess.confirmDraw.cancel")}
          onConfirm={() => { controller.agreeDraw(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("chess.confirmDraw.body")}
        </Dialog>
      )}
      {pending === "resign" && status.kind === "playing" && (
        <Dialog
          title={t("chess.confirmResign.title")}
          confirmLabel={t("chess.confirmResign.confirm")}
          cancelLabel={t("chess.confirmResign.cancel")}
          danger
          onConfirm={() => { controller.resign(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("chess.confirmResign.body", { player: names[(me ?? status.turn) === 0 ? 1 : 0] })}
        </Dialog>
      )}
      {pending === "exit" && (
        <Dialog
          title={t("chess.confirmExit.title")}
          confirmLabel={t("chess.confirmExit.confirm")}
          cancelLabel={t("chess.confirmExit.cancel")}
          danger
          onConfirm={() => { setPending(null); exit(); }}
          onClose={() => setPending(null)}
        >
          {t("chess.confirmExit.body")}
        </Dialog>
      )}
      {pending === "new" && (
        <Dialog
          title={t("chess.confirmNew.title")}
          confirmLabel={t("chess.confirmNew.confirm")}
          cancelLabel={t("chess.confirmNew.cancel")}
          danger
          onConfirm={() => { controller.abandon(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("chess.confirmNew.body")}
        </Dialog>
      )}
    </>
  );
}

function PageHead({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <header className="page-head page-head-row">
      <a className="text-link" href={href()} onClick={(event) => follow(event, href())}>
        <ArrowLeft size={16} aria-hidden="true" /> {t("app.allGames")}
      </a>
      <h1>{title}</h1>
    </header>
  );
}
