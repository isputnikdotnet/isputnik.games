import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, RotateCcw } from "lucide-react";
import { StarBattle, otherPlayer, type PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { follow, href } from "../../router";
import { FleetEditor } from "./FleetEditor";
import { NewGameForm } from "./NewGameForm";
import { StarBattleBoards, lastShotLine } from "./StarBattleBoards";
import { isComputerSeat, useStarBattleGame } from "./useStarBattleGame";
import type { StarBattleSetup } from "./storage";

type Pending = "end" | "new" | null;

// A local game: against the computer, or two people passing one device. The
// whole position is on this screen, so with two people a curtain goes up
// between turns and only the player whose turn it is sees their sector.
export function StarBattlePage() {
  const { t } = useTranslation();
  const controller = useStarBattleGame();
  const [pending, setPending] = useState<Pending>(null);
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  /** In a two-player game: the seat the screen is showing to. */
  const [revealed, setRevealed] = useState<PlayerIndex | null>(null);
  const { game } = controller;

  const seatName = (setup: StarBattleSetup, player: PlayerIndex) => {
    if (isComputerSeat(setup, player)) return t("starbattle.players.computer");
    if (setup.mode === "computer") return t("starbattle.players.you");
    return t(player === 0 ? "starbattle.players.p1" : "starbattle.players.p2");
  };

  const begin = (setup: StarBattleSetup) => {
    setRevealed(null);
    controller.start(setup);
  };

  if (!game) {
    return (
      <section className="star-page">
        <PageHead title={t("games.starbattle.name")} />
        <NewGameForm onStart={begin} />
      </section>
    );
  }

  const { state, setup } = game;
  const status = state.status;
  const phase = StarBattle.phaseOf(state);
  const finished = status.kind === "finished";
  const actor = status.kind === "playing" ? status.turn : null;
  const humanSeat: PlayerIndex | null = setup.mode === "computer" ? otherPlayer(setup.computerPlays) : null;
  const viewer: PlayerIndex = humanSeat ?? revealed ?? 0;
  const names: [string, string] = [seatName(setup, 0), seatName(setup, 1)];
  const columns = t("starbattle.columns");
  const needsHandover = setup.mode === "local" && actor !== null && revealed !== actor;
  const endingKey = finished ? `${state.moveCount}:${status.reason}` : null;
  const showResult = endingKey !== null && resultDismissed !== endingKey;

  let statusLine: string;
  if (status.kind === "finished") {
    statusLine = status.winner === null ? t("starbattle.end.draw") : t("starbattle.end.winner", { player: names[status.winner] });
  } else if (controller.thinking) {
    statusLine = phase === "placing" ? t("starbattle.status.computerDeploying") : t("starbattle.status.aiming");
  } else if (phase === "placing") {
    statusLine = t("starbattle.place.title", { player: names[status.turn] });
  } else if (state.lastShot && state.lastShot.by === status.turn && state.lastShot.result !== "miss") {
    statusLine = state.lastShot.result === "destroyed" ? t("starbattle.status.destroyedAgain") : t("starbattle.status.hitAgain");
  } else {
    statusLine = setup.mode === "computer" ? t("starbattle.status.yourShot") : t("starbattle.status.fire", { player: names[status.turn] });
  }

  const reason = (() => {
    if (status.kind !== "finished") return null;
    switch (status.reason) {
      case "target": return t("starbattle.end.reasonTarget", { player: names[otherPlayer(status.winner ?? 0)] });
      case "agreed": return t("starbattle.end.reasonAgreed");
      case "resigned": return t("starbattle.end.reasonResigned", { player: names[otherPlayer(status.winner ?? 0)] });
      default: return null;
    }
  })();
  const lastLine = state.lastShot ? lastShotLine(t, columns, state.lastShot, names[state.lastShot.by]) : null;
  const scoreLine = t("starbattle.end.scoreLine", { p1Name: names[0], p1: state.destroyed[0], p2: state.destroyed[1], p2Name: names[1] });

  let body: React.ReactNode;
  if (needsHandover) {
    body = (
      <section className="star-curtain">
        <h2>{t("starbattle.handover.title", { player: names[actor] })}</h2>
        {lastLine && <p className="star-curtain-last">{lastLine}</p>}
        <p className="muted">{t("starbattle.handover.body", { player: names[actor] })}</p>
        <Button variant="primary" onClick={() => setRevealed(actor)}>{t("starbattle.handover.ready", { player: names[actor] })}</Button>
      </section>
    );
  } else if (phase === "placing" && controller.humanToMove && actor !== null) {
    body = (
      <FleetEditor
        key={actor}
        fleet={state.fleet}
        size={state.size}
        title={t("starbattle.place.title", { player: names[actor] })}
        readyLabel={t("starbattle.place.ready")}
        onReady={(vessels) => controller.play({ kind: "place", vessels })}
      />
    );
  } else {
    body = (
      <div className="star-layout">
        {phase === "placing"
          ? <p className="app-status muted" role="status">{statusLine}</p>
          : (
            <StarBattleBoards
              state={state}
              viewer={viewer}
              names={names}
              canFire={controller.humanToMove && actor === viewer}
              onFire={(x, y) => controller.play({ kind: "shoot", x, y })}
              revealEnemy={finished}
            />
          )}
        <aside className="star-side">
          {phase !== "placing" && <p className={`star-status${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>}
          {lastLine && !finished && <p className="muted star-last-line">{lastLine}</p>}
          {reason && <p className="muted star-reason">{reason}</p>}
          <div className="star-actions">
            {!finished && (
              <>
                <Button variant="secondary" onClick={() => setPending("end")} disabled={phase === "placing"}>
                  <Flag size={16} aria-hidden="true" /> {t("starbattle.endGame")}
                </Button>
                <Button variant="secondary" onClick={() => (state.moveCount === 0 ? controller.abandon() : setPending("new"))}>
                  <RotateCcw size={16} aria-hidden="true" /> {t("starbattle.newGame")}
                </Button>
              </>
            )}
            {finished && (
              <>
                <Button variant="primary" onClick={() => begin(setup)}>{t("starbattle.end.again")}</Button>
                <Button variant="secondary" onClick={controller.abandon}>{t("starbattle.end.change")}</Button>
              </>
            )}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <section className="star-page">
      <PageHead title={t("games.starbattle.name")} />
      {body}

      {showResult && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={scoreLine}
          reason={reason}
          primary={{ label: t("starbattle.end.again"), onClick: () => begin(setup) }}
          secondary={{ label: t("starbattle.end.change"), onClick: controller.abandon }}
          onClose={() => setResultDismissed(endingKey)}
        />
      )}
      {pending === "end" && (
        <Dialog
          title={t("starbattle.confirmEnd.title")}
          confirmLabel={t("starbattle.confirmEnd.confirm")}
          cancelLabel={t("starbattle.confirmEnd.cancel")}
          onConfirm={() => { controller.end(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("starbattle.confirmEnd.body")}
        </Dialog>
      )}
      {pending === "new" && (
        <Dialog
          title={t("starbattle.confirmNew.title")}
          confirmLabel={t("starbattle.confirmNew.confirm")}
          cancelLabel={t("starbattle.confirmNew.cancel")}
          danger
          onConfirm={() => { controller.abandon(); setPending(null); }}
          onClose={() => setPending(null)}
        >
          {t("starbattle.confirmNew.body")}
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
