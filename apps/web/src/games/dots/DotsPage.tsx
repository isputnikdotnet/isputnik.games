import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, RotateCcw, Undo2 } from "lucide-react";
import type { PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { follow, href } from "../../router";
import { DotsBoard } from "./DotsBoard";
import { GameOverDialog } from "./GameOverDialog";
import { NewGameForm } from "./NewGameForm";
import { isComputerSeat, useDotsGame } from "./useDotsGame";
import type { DotsSetup } from "./storage";

type Pending = "end" | "new" | null;

export function DotsPage() {
  const { t } = useTranslation();
  const controller = useDotsGame();
  const [pending, setPending] = useState<Pending>(null);
  // The result dialog can be put aside to look at the final board; it stays
  // aside for that ending only (a new game's end shows it again).
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  const { game } = controller;

  const seatName = (setup: DotsSetup, player: PlayerIndex) =>
    isComputerSeat(setup, player) ? t("dots.players.computer") : t(player === 0 ? "dots.players.blue" : "dots.players.red");

  if (!game) {
    return (
      <section className="dots-page">
        <PageHead title={t("games.dots.name")} />
        <NewGameForm onStart={controller.start} />
      </section>
    );
  }

  const { state, setup } = game;
  const status = state.status;
  const finished = status.kind === "finished";
  const endingKey = finished ? `${state.moves.length}:${status.reason}` : null;
  const showResult = endingKey !== null && resultDismissed !== endingKey;

  let statusLine: string;
  if (status.kind === "playing") {
    statusLine = controller.thinking ? t("dots.thinking") : t("dots.turn", { player: seatName(setup, status.turn) });
  } else {
    statusLine = status.winner === null ? t("dots.end.draw") : t("dots.end.winner", { player: seatName(setup, status.winner) });
  }

  const reason = (() => {
    if (status.kind !== "finished") return null;
    switch (status.reason) {
      case "target": return t("dots.end.reasonTarget", { count: state.targetCaptures ?? 0 });
      case "board-full": return t("dots.end.reasonBoardFull");
      case "agreed": return t("dots.end.reasonAgreed");
      case "resigned": return t("dots.end.reasonResigned", { player: seatName(setup, status.winner === 0 ? 1 : 0) });
    }
  })();

  return (
    <section className="dots-page">
      <PageHead title={t("games.dots.name")} />
      <div className="dots-layout">
        <div className="dots-board-wrap">
          <DotsBoard state={state} onPlace={controller.place} disabled={!controller.humanToMove} />
        </div>
        <aside className="dots-side">
          <div className="dots-score" aria-label={t("dots.captures")}>
            <ScoreCell player={0} name={seatName(setup, 0)} captures={state.captures[0]} active={status.kind === "playing" && status.turn === 0} />
            <span className="dots-score-colon">:</span>
            <ScoreCell player={1} name={seatName(setup, 1)} captures={state.captures[1]} active={status.kind === "playing" && status.turn === 1} />
          </div>
          <p className={`dots-status${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>
          {reason && <p className="muted dots-reason">{reason}</p>}
          <div className="dots-actions">
            {!finished && (
              <>
                <Button variant="secondary" onClick={controller.undo} disabled={state.moves.length === 0 || controller.thinking}>
                  <Undo2 size={16} aria-hidden="true" /> {t("dots.undo")}
                </Button>
                <Button variant="secondary" onClick={() => setPending("end")} disabled={state.moves.length === 0}>
                  <Flag size={16} aria-hidden="true" /> {t("dots.endGame")}
                </Button>
                <Button variant="secondary" onClick={() => (state.moves.length === 0 ? controller.abandon() : setPending("new"))}>
                  <RotateCcw size={16} aria-hidden="true" /> {t("dots.newGame")}
                </Button>
              </>
            )}
            {finished && (
              <>
                <Button variant="primary" onClick={() => controller.start(setup)}>{t("dots.end.again")}</Button>
                <Button variant="secondary" onClick={controller.abandon}>{t("dots.end.change")}</Button>
              </>
            )}
          </div>
        </aside>
      </div>

      {showResult && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={t("dots.end.scoreLine", {
            blueName: seatName(setup, 0), blue: state.captures[0], red: state.captures[1], redName: seatName(setup, 1)
          })}
          reason={reason}
          primary={{ label: t("dots.end.again"), onClick: () => controller.start(setup) }}
          secondary={{ label: t("dots.end.change"), onClick: controller.abandon }}
          onClose={() => setResultDismissed(endingKey)}
        />
      )}
      {pending === "end" && (
        <Dialog
          title={t("dots.confirmEnd.title")}
          confirmLabel={t("dots.confirmEnd.confirm")}
          cancelLabel={t("dots.confirmEnd.cancel")}
          onConfirm={() => { controller.end(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("dots.confirmEnd.body")}
        </Dialog>
      )}
      {pending === "new" && (
        <Dialog
          title={t("dots.confirmNew.title")}
          confirmLabel={t("dots.confirmNew.confirm")}
          cancelLabel={t("dots.confirmNew.cancel")}
          danger
          onConfirm={() => { controller.abandon(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("dots.confirmNew.body")}
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

function ScoreCell({ player, name, captures, active }: { player: PlayerIndex; name: string; captures: number; active: boolean }) {
  return (
    <div className={`dots-score-cell is-p${player + 1}${active ? " is-active" : ""}`}>
      <span className="dots-score-dot" aria-hidden="true" />
      <span className="dots-score-name">{name}</span>
      <strong className="dots-score-count">{captures}</strong>
    </div>
  );
}
