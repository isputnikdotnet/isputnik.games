import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Satellite } from "lucide-react";
import { StarBattle, otherPlayer, starbattle, type PlayerIndex, type StarBattleMove } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Comms } from "../../shared/Comms";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { GameStage } from "../../shared/GameStage";
import { useArena } from "../../shared/useArena";
import { useFeed } from "../../shared/useFeed";
import { localSound, useGameSounds } from "../../shared/useGameSounds";
import type { CommsLine } from "../../shared/commsLines";
import { PHONE_ARENA, useMediaQuery } from "../../shared/useMediaQuery";
import { href, navigate } from "../../router";
import { ArenaHead, ArenaState, ArenaStatus, turnNumber } from "./ArenaFrame";
import { FleetEditor } from "./FleetEditor";
import { NewGameDialog } from "./NewGameDialog";
import { SectorPanel, StarBattleBoards, lastShotLine } from "./StarBattleBoards";
import { starBattleLines } from "./comms";
import { useStarBattleGame } from "./useStarBattleGame";
import type { StarBattleSetup } from "./storage";

const NO_MOVES: StarBattleMove[] = [];

// A local game, always against the computer, in the arena: the dark space
// theme the page wears on every app theme. It opens on the new-game dialog
// when nothing is in progress; a game can be left at any point with Exit
// game, and a finished one offers a new game or the way back to the lobby.
export function StarBattlePage() {
  const { t } = useTranslation();
  useArena("star");
  const controller = useStarBattleGame();
  const narrow = useMediaQuery(PHONE_ARENA);
  const { game } = controller;
  const [settingUp, setSettingUp] = useState(() => controller.game === null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  const feed = useFeed(starbattle, { fleet: game?.setup.fleet ?? "classic" }, game?.moves ?? NO_MOVES);
  useGameSounds(game && localSound("starbattle", feed, otherPlayer(game.setup.computerPlays), game.state.status));

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
        <ArenaHead chip={t("starbattle.menu.idle")} />
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

  const chip = finished
    ? t("starbattle.arena.over")
    : phase === "placing"
      ? t("starbattle.arena.deploying")
      : actor === me ? t("starbattle.arena.yourTurn") : t("starbattle.arena.theirTurn", { name: names[otherPlayer(me)] });

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

  const lines: CommsLine[] = starBattleLines(feed, me, names, columns, t);
  if (finished) {
    lines.push({ key: "end", kind: "system", text: status.winner === null ? t("comms.draw") : t("comms.winner", { name: names[status.winner] }) });
  } else if (phase === "battle" && actor !== null) {
    lines.push({ key: "turn", kind: "system", text: actor === me ? t("comms.yourMove") : t("comms.toMove", { name: names[actor] }) });
  }

  const exitButton = (
    <Button variant="secondary" onClick={() => setConfirmExit(true)}>
      <LogOut size={16} aria-hidden="true" /> {t("starbattle.exitGame")}
    </Button>
  );

  const result = showResult && (
    <GameOverDialog
      headline={statusLine}
      scoreLine={scoreLine}
      reason={reason}
      primary={{ label: t("starbattle.newGame"), onClick: () => setSettingUp(true) }}
      secondary={{ label: t("starbattle.mainMenu"), onClick: toLobby }}
      onClose={() => setResultDismissed(endingKey)}
    />
  );
  const actions = finished ? (
    <>
      <Button variant="primary" onClick={() => setSettingUp(true)}>{t("starbattle.newGame")}</Button>
      <Button variant="secondary" onClick={toLobby}>{t("starbattle.mainMenu")}</Button>
    </>
  ) : exitButton;

  // Laying the fleet keeps the arena's own frame: the editor needs the width.
  if (phase === "placing") {
    return (
      <section className="star-page">
        <ArenaHead chip={chip} />
        {controller.humanToMove && actor !== null ? (
          <FleetEditor
            fleet={state.fleet}
            size={state.size}
            title={t("starbattle.place.title", { player: names[actor] })}
            readyLabel={t("starbattle.place.ready")}
            onReady={(vessels) => controller.play({ kind: "place", vessels })}
          />
        ) : (
          <p className="app-status muted">{statusLine}</p>
        )}
        <ArenaStatus line={statusLine}>{actions}</ArenaStatus>
        {dialogs}
      </section>
    );
  }

  // The battle on the game stage: the sector the player fires at is the
  // board; their own fleet sits small in the panel (on a narrow screen, the
  // battle strip shows one at a time instead).
  const sectors = {
    state,
    viewer: me,
    names,
    canFire: controller.humanToMove && actor === me,
    onFire: (x: number, y: number) => controller.play({ kind: "shoot", x, y }),
    revealEnemy: finished
  };
  return (
    <>
      <GameStage
        className="star-stage"
        title={t("games.starbattle.name")}
        board={narrow ? <StarBattleBoards {...sectors} /> : <SectorPanel side="enemy" {...sectors} />}
        score={<ArenaState line={statusLine} turn={turnNumber(feed)} detail={reason ?? lastLine} />}
        notices={!narrow && <SectorPanel side="own" compact {...sectors} />}
        log={<Comms lines={lines} />}
        actions={actions}
      />
      {result}
      {dialogs}
    </>
  );
}
