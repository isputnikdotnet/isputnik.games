import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, Handshake, Repeat2, RotateCcw, Undo2 } from "lucide-react";
import { chess, type ChessMove, type PlayerIndex } from "@isputnik/games-engine";
import { Comms } from "../../shared/Comms";
import { useFeed } from "../../shared/useFeed";
import { localSound, useGameSounds } from "../../shared/useGameSounds";
import type { CommsLine } from "../../shared/commsLines";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { follow, href } from "../../router";
import { chessLines } from "./comms";
import { chessReason } from "./ending";
import { ChessNewGameForm } from "./NewGameForm";
import { ChessTable } from "./ChessTable";
import { humanSeat, isComputerSeat, useChessGame } from "./useChessGame";
import type { ChessSetup } from "./storage";

type Pending = "draw" | "resign" | "new" | null;

const NO_MOVES: ChessMove[] = [];

// A game of chess on this device: against the computer, or two people taking
// turns at one screen (the board turns to face whoever is to move).
export function ChessPage() {
  const { t } = useTranslation();
  const controller = useChessGame();
  const [pending, setPending] = useState<Pending>(null);
  const [flipped, setFlipped] = useState(false);
  // The result dialog can be put aside to look at the final position; it
  // stays aside for that ending only.
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  const { game } = controller;
  const feed = useFeed(chess, {}, game?.state.moves ?? NO_MOVES);
  const me = game ? humanSeat(game.setup) : null;
  useGameSounds(game && localSound("chess", feed, me, game.state.status));

  const seatName = (setup: ChessSetup, seat: PlayerIndex) =>
    isComputerSeat(setup, seat) ? t("chess.players.computer") : t(seat === 0 ? "chess.players.white" : "chess.players.black");

  if (!game) {
    return (
      <section className="chess-page">
        <PageHead title={t("games.chess.name")} />
        <ChessNewGameForm onStart={controller.start} />
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
  const reason = finished ? chessReason(status.reason, names[status.winner === 0 ? 1 : 0], t) : null;

  // "You" in the log is the person against the computer, or White when two share the screen.
  const lines: CommsLine[] = chessLines(feed, me ?? 0, names, t);
  if (status.kind === "finished") {
    lines.push({ key: "end", kind: "system", text: status.winner === null ? t("comms.draw") : t("comms.winner", { name: names[status.winner] }) });
  } else {
    lines.push({ key: "turn", kind: "system", text: status.turn === me ? t("comms.yourMove") : t("comms.toMove", { name: names[status.turn] }) });
  }

  const again = () => {
    setFlipped(false);
    controller.start(setup);
  };

  return (
    <section className="chess-page">
      <PageHead title={t("games.chess.name")} />
      <ChessTable state={state} orientation={orientation} movable={controller.humanToMove} onMove={controller.move} names={names}>
        <div className="chess-status">
          <p className={`chess-status-line${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>
          {reason && <p className="muted chess-reason">{reason}</p>}
        </div>
        <div className="chess-actions">
          {!finished && (
            <>
              <Button variant="secondary" onClick={controller.undo} disabled={state.moves.length === 0 || controller.thinking}>
                <Undo2 size={16} aria-hidden="true" /> {t("chess.undo")}
              </Button>
              <Button variant="secondary" onClick={() => setFlipped((f) => !f)}>
                <Repeat2 size={16} aria-hidden="true" /> {t("chess.flip")}
              </Button>
              {setup.mode === "local" && (
                <Button variant="secondary" onClick={() => setPending("draw")} disabled={state.moves.length === 0}>
                  <Handshake size={16} aria-hidden="true" /> {t("chess.offerDraw")}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setPending("resign")} disabled={state.moves.length === 0}>
                <Flag size={16} aria-hidden="true" /> {t("chess.resign")}
              </Button>
              <Button variant="secondary" onClick={() => (state.moves.length === 0 ? controller.abandon() : setPending("new"))}>
                <RotateCcw size={16} aria-hidden="true" /> {t("chess.newGame")}
              </Button>
            </>
          )}
          {finished && (
            <>
              <Button variant="primary" onClick={again}>{t("chess.end.again")}</Button>
              <Button variant="secondary" onClick={controller.abandon}>{t("chess.end.change")}</Button>
            </>
          )}
        </div>
        <Comms lines={lines} />
      </ChessTable>

      {showResult && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={t("chess.end.moves", { count: Math.ceil(state.moves.length / 2) })}
          reason={reason}
          primary={{ label: t("chess.end.again"), onClick: again }}
          secondary={{ label: t("chess.end.change"), onClick: controller.abandon }}
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
    </section>
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
