import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, RotateCcw } from "lucide-react";
import { SeaBattle, otherPlayer, type PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { follow, href } from "../../router";
import { FleetEditor } from "./FleetEditor";
import { NewGameForm } from "./NewGameForm";
import { SeaBattleBoards, lastShotLine } from "./SeaBattleBoards";
import { isComputerSeat, useSeaBattleGame } from "./useSeaBattleGame";
import type { SeaBattleSetup } from "./storage";

type Pending = "end" | "new" | null;

// A local game: against the computer, or two people passing one device. The
// whole position is on this screen, so with two people a curtain goes up
// between turns and only the player whose turn it is sees their sea.
export function SeaBattlePage() {
  const { t } = useTranslation();
  const controller = useSeaBattleGame();
  const [pending, setPending] = useState<Pending>(null);
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  /** In a two-player game: the seat the screen is showing to. */
  const [revealed, setRevealed] = useState<PlayerIndex | null>(null);
  const { game } = controller;

  const seatName = (setup: SeaBattleSetup, player: PlayerIndex) => {
    if (isComputerSeat(setup, player)) return t("seabattle.players.computer");
    if (setup.mode === "computer") return t("seabattle.players.you");
    return t(player === 0 ? "seabattle.players.p1" : "seabattle.players.p2");
  };

  const begin = (setup: SeaBattleSetup) => {
    setRevealed(null);
    controller.start(setup);
  };

  if (!game) {
    return (
      <section className="sea-page">
        <PageHead title={t("games.seabattle.name")} />
        <NewGameForm onStart={begin} />
      </section>
    );
  }

  const { state, setup } = game;
  const status = state.status;
  const phase = SeaBattle.phaseOf(state);
  const finished = status.kind === "finished";
  const actor = status.kind === "playing" ? status.turn : null;
  const humanSeat: PlayerIndex | null = setup.mode === "computer" ? otherPlayer(setup.computerPlays) : null;
  const viewer: PlayerIndex = humanSeat ?? revealed ?? 0;
  const names: [string, string] = [seatName(setup, 0), seatName(setup, 1)];
  const columns = t("seabattle.columns");
  const needsHandover = setup.mode === "local" && actor !== null && revealed !== actor;
  const endingKey = finished ? `${state.moveCount}:${status.reason}` : null;
  const showResult = endingKey !== null && resultDismissed !== endingKey;

  let statusLine: string;
  if (status.kind === "finished") {
    statusLine = status.winner === null ? t("seabattle.end.draw") : t("seabattle.end.winner", { player: names[status.winner] });
  } else if (controller.thinking) {
    statusLine = phase === "placing" ? t("seabattle.status.computerLaying") : t("seabattle.status.aiming");
  } else if (phase === "placing") {
    statusLine = t("seabattle.place.title", { player: names[status.turn] });
  } else if (state.lastShot && state.lastShot.by === status.turn && state.lastShot.result !== "miss") {
    statusLine = state.lastShot.result === "sunk" ? t("seabattle.status.sunkAgain") : t("seabattle.status.hitAgain");
  } else {
    statusLine = setup.mode === "computer" ? t("seabattle.status.yourShot") : t("seabattle.status.fire", { player: names[status.turn] });
  }

  const reason = (() => {
    if (status.kind !== "finished") return null;
    switch (status.reason) {
      case "target": return t("seabattle.end.reasonTarget", { player: names[otherPlayer(status.winner ?? 0)] });
      case "agreed": return t("seabattle.end.reasonAgreed");
      case "resigned": return t("seabattle.end.reasonResigned", { player: names[otherPlayer(status.winner ?? 0)] });
      default: return null;
    }
  })();
  const lastLine = state.lastShot ? lastShotLine(t, columns, state.lastShot, names[state.lastShot.by]) : null;
  const scoreLine = t("seabattle.end.scoreLine", { p1Name: names[0], p1: state.sunk[0], p2: state.sunk[1], p2Name: names[1] });

  let body: React.ReactNode;
  if (needsHandover) {
    body = (
      <section className="sea-curtain">
        <h2>{t("seabattle.handover.title", { player: names[actor] })}</h2>
        {lastLine && <p className="sea-curtain-last">{lastLine}</p>}
        <p className="muted">{t("seabattle.handover.body", { player: names[actor] })}</p>
        <Button variant="primary" onClick={() => setRevealed(actor)}>{t("seabattle.handover.ready", { player: names[actor] })}</Button>
      </section>
    );
  } else if (phase === "placing" && controller.humanToMove && actor !== null) {
    body = (
      <FleetEditor
        key={actor}
        fleet={state.fleet}
        size={state.size}
        title={t("seabattle.place.title", { player: names[actor] })}
        readyLabel={t("seabattle.place.ready")}
        onReady={(ships) => controller.play({ kind: "place", ships })}
      />
    );
  } else {
    body = (
      <div className="sea-layout">
        {phase === "placing"
          ? <p className="app-status muted" role="status">{statusLine}</p>
          : (
            <SeaBattleBoards
              state={state}
              viewer={viewer}
              names={names}
              canFire={controller.humanToMove && actor === viewer}
              onFire={(x, y) => controller.play({ kind: "shoot", x, y })}
              revealEnemy={finished}
            />
          )}
        <aside className="sea-side">
          {phase !== "placing" && <p className={`sea-status${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>}
          {lastLine && !finished && <p className="muted sea-last-line">{lastLine}</p>}
          {reason && <p className="muted sea-reason">{reason}</p>}
          <div className="sea-actions">
            {!finished && (
              <>
                <Button variant="secondary" onClick={() => setPending("end")} disabled={phase === "placing"}>
                  <Flag size={16} aria-hidden="true" /> {t("seabattle.endGame")}
                </Button>
                <Button variant="secondary" onClick={() => (state.moveCount === 0 ? controller.abandon() : setPending("new"))}>
                  <RotateCcw size={16} aria-hidden="true" /> {t("seabattle.newGame")}
                </Button>
              </>
            )}
            {finished && (
              <>
                <Button variant="primary" onClick={() => begin(setup)}>{t("seabattle.end.again")}</Button>
                <Button variant="secondary" onClick={controller.abandon}>{t("seabattle.end.change")}</Button>
              </>
            )}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <section className="sea-page">
      <PageHead title={t("games.seabattle.name")} />
      {body}

      {showResult && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={scoreLine}
          reason={reason}
          primary={{ label: t("seabattle.end.again"), onClick: () => begin(setup) }}
          secondary={{ label: t("seabattle.end.change"), onClick: controller.abandon }}
          onClose={() => setResultDismissed(endingKey)}
        />
      )}
      {pending === "end" && (
        <Dialog
          title={t("seabattle.confirmEnd.title")}
          confirmLabel={t("seabattle.confirmEnd.confirm")}
          cancelLabel={t("seabattle.confirmEnd.cancel")}
          onConfirm={() => { controller.end(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("seabattle.confirmEnd.body")}
        </Dialog>
      )}
      {pending === "new" && (
        <Dialog
          title={t("seabattle.confirmNew.title")}
          confirmLabel={t("seabattle.confirmNew.confirm")}
          cancelLabel={t("seabattle.confirmNew.cancel")}
          danger
          onConfirm={() => { controller.abandon(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("seabattle.confirmNew.body")}
        </Dialog>
      )}
    </section>
  );
}

export function PageHead({ title }: { title: string }) {
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
