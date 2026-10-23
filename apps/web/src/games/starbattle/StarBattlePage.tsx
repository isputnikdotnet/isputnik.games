import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LogOut, Satellite } from "lucide-react";
import { StarBattle, otherPlayer, type PlayerIndex } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { follow, href, navigate } from "../../router";
import { FleetEditor } from "./FleetEditor";
import { NewGameDialog } from "./NewGameDialog";
import { StarBattleBoards, lastShotLine } from "./StarBattleBoards";
import { useStarBattleGame } from "./useStarBattleGame";
import type { StarBattleSetup } from "./storage";

// A local game, always against the computer. The page opens on the new-game
// dialog when nothing is in progress; a game can be left at any point with
// Exit game, and a finished one offers a new game or the way back to the lobby.
export function StarBattlePage() {
  const { t } = useTranslation();
  const controller = useStarBattleGame();
  const { game } = controller;
  const [settingUp, setSettingUp] = useState(() => controller.game === null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);

  const begin = (setup: StarBattleSetup) => {
    setSettingUp(false);
    setResultDismissed(null);
    controller.start(setup);
  };
  const toLobby = () => {
    controller.abandon();
    navigate(href());
  };

  const dialogs = (
    <>
      {settingUp && <NewGameDialog onStart={begin} onClose={() => setSettingUp(false)} />}
      {confirmExit && (
        <Dialog
          title={t("starbattle.confirmExit.title")}
          confirmLabel={t("starbattle.confirmExit.confirm")}
          cancelLabel={t("starbattle.confirmExit.cancel")}
          danger
          onConfirm={toLobby}
          onClose={() => setConfirmExit(false)}
        >
          {t("starbattle.confirmExit.body")}
        </Dialog>
      )}
    </>
  );

  if (!game) {
    return (
      <section className="star-page">
        <PageHead title={t("games.starbattle.name")} />
        <section className="star-menu">
          <Satellite size={40} aria-hidden="true" />
          <h2>{t("games.starbattle.name")}</h2>
          <p className="muted">{t("starbattle.menu.lead")}</p>
          <div className="star-menu-actions">
            <Button variant="primary" onClick={() => setSettingUp(true)}>{t("starbattle.newGame")}</Button>
            <Button variant="secondary" onClick={() => navigate(href())}>{t("starbattle.mainMenu")}</Button>
          </div>
        </section>
        {dialogs}
      </section>
    );
  }

  const { state, setup } = game;
  const status = state.status;
  const phase = StarBattle.phaseOf(state);
  const finished = status.kind === "finished";
  const actor = status.kind === "playing" ? status.turn : null;
  const me: PlayerIndex = otherPlayer(setup.computerPlays);
  const names: [string, string] = [0, 1].map((seat) => (seat === me ? t("starbattle.players.you") : t("starbattle.players.computer"))) as [string, string];
  const columns = t("starbattle.columns");
  const endingKey = finished ? `${state.moveCount}:${status.reason}` : null;
  const showResult = endingKey !== null && resultDismissed !== endingKey && !settingUp;

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
    statusLine = t("starbattle.status.yourShot");
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

  const exitButton = (
    <Button variant="secondary" onClick={() => setConfirmExit(true)}>
      <LogOut size={16} aria-hidden="true" /> {t("starbattle.exitGame")}
    </Button>
  );

  let body: React.ReactNode;
  if (phase === "placing" && controller.humanToMove && actor !== null) {
    body = (
      <>
        <FleetEditor
          fleet={state.fleet}
          size={state.size}
          title={t("starbattle.place.title", { player: names[actor] })}
          readyLabel={t("starbattle.place.ready")}
          onReady={(vessels) => controller.play({ kind: "place", vessels })}
        />
        <div className="star-side">
          <div className="star-actions">{exitButton}</div>
        </div>
      </>
    );
  } else {
    body = (
      <div className="star-layout">
        {phase === "placing"
          ? <p className="app-status muted" role="status">{statusLine}</p>
          : (
            <StarBattleBoards
              state={state}
              viewer={me}
              names={names}
              canFire={controller.humanToMove && actor === me}
              onFire={(x, y) => controller.play({ kind: "shoot", x, y })}
              revealEnemy={finished}
            />
          )}
        <aside className="star-side">
          {phase !== "placing" && <p className={`star-status${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>}
          {lastLine && !finished && <p className="muted star-last-line">{lastLine}</p>}
          {reason && <p className="muted star-reason">{reason}</p>}
          <div className="star-actions">
            {!finished && exitButton}
            {finished && (
              <>
                <Button variant="primary" onClick={() => setSettingUp(true)}>{t("starbattle.newGame")}</Button>
                <Button variant="secondary" onClick={toLobby}>{t("starbattle.mainMenu")}</Button>
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
          primary={{ label: t("starbattle.newGame"), onClick: () => setSettingUp(true) }}
          secondary={{ label: t("starbattle.mainMenu"), onClick: toLobby }}
          onClose={() => setResultDismissed(endingKey)}
        />
      )}
      {dialogs}
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
