import { useState } from "react";
import { useTranslation } from "react-i18next";
import { History, LogOut, RectangleVertical } from "lucide-react";
import { Dominoes, dominoes, type DominoesMove, type End, type Tile } from "@isputnik/games-engine";
import { Button } from "../../shared/Button";
import { Comms } from "../../shared/Comms";
import { Dialog } from "../../shared/Dialog";
import { GameStage } from "../../shared/GameStage";
import { useFeed } from "../../shared/useFeed";
import { localSound, useGameSounds } from "../../shared/useGameSounds";
import { useComputerResult } from "../../shared/useComputerResult";
import type { CommsLine } from "../../shared/commsLines";
import { PHONE, useMediaQuery } from "../../shared/useMediaQuery";
import { href, navigate } from "../../router";
import { DominoesScore, HandHistoryDialog, HandSummaryDialog } from "./DominoesPanel";
import { DominoesTable, playsOfTile, tileName } from "./DominoesTable";
import { NewGameDialog } from "./NewGameDialog";
import { dominoesLines } from "./comms";
import { COMPUTER, HUMAN, type DominoesSetup } from "./storage";
import { useDominoesGame } from "./useDominoesGame";

type Play = Extract<DominoesMove, { kind: "play" }>;

const NO_MOVES: DominoesMove[] = [];

const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

// A local game of Dominoes, always against the computer: hands are hidden, and
// two on one screen would see each other's. It opens on the new-game dialog
// when nothing is in progress; a tile is played by tapping it and, when it
// fits both ends, tapping the lit end. Between hands a summary waits for the
// person; a finished game offers a new one or the way back to the lobby.
export function DominoesPage() {
  const { t } = useTranslation();
  const controller = useDominoesGame();
  const phone = useMediaQuery(PHONE);
  const { game } = controller;
  const [settingUp, setSettingUp] = useState(() => controller.game === null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pick, setPick] = useState<{ tile: Tile; at: number } | null>(null);
  const [resultDismissed, setResultDismissed] = useState<string | null>(null);
  const feed = useFeed(dominoes, { target: game?.setup.target ?? 101 }, game?.moves ?? NO_MOVES, game?.seed);
  useGameSounds(game && localSound("dominoes", feed, HUMAN, game.state.status));
  useComputerResult(game && game.state.status.kind === "finished"
    ? { game: "dominoes", key: game.key, level: game.setup.level, human: HUMAN, winner: game.state.status.winner }
    : null);

  const names: [string, string] = [t("dominoes.players.you"), t("dominoes.players.computer")];

  const begin = (setup: DominoesSetup) => {
    setSettingUp(false);
    setResultDismissed(null);
    setPick(null);
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
          title={t("dominoes.confirmExit.title")}
          confirmLabel={t("dominoes.confirmExit.confirm")}
          cancelLabel={t("dominoes.confirmExit.cancel")}
          danger
          onConfirm={toLobby}
          onClose={() => setConfirmExit(false)}
        >
          {t("dominoes.confirmExit.body")}
        </Dialog>
      )}
    </>
  );

  if (!game) {
    return (
      <section className="dom-page">
        <section className="dom-menu">
          <RectangleVertical size={40} aria-hidden="true" />
          <h1>{t("games.dominoes.name")}</h1>
          <p className="muted">{t("dominoes.menu.lead")}</p>
          <div className="dom-menu-actions">
            <Button variant="primary" onClick={() => setSettingUp(true)}>{t("dominoes.newGame")}</Button>
            <Button variant="secondary" onClick={() => navigate(href())}>{t("dominoes.mainMenu")}</Button>
          </div>
        </section>
        {dialogs}
      </section>
    );
  }

  const { state } = game;
  const status = state.status;
  const finished = status.kind === "finished";
  const active = controller.humanToMove;
  const legal = active ? Dominoes.legalMoves(state) : [];
  const plays = legal.filter((m): m is Play => m.kind === "play");
  const selected = pick && pick.at === state.moveCount ? pick.tile : null;

  const onPick = (tile: Tile) => {
    const options = playsOfTile(state, plays, tile);
    if (options.length === 0) return;
    if (options.length === 1) {
      setPick(null);
      controller.play(options[0]);
      return;
    }
    setPick(selected && same(selected, tile) ? null : { tile, at: state.moveCount });
  };
  const onLay = (end: End) => {
    if (!selected) return;
    const play = playsOfTile(state, plays, selected).find((p) => p.end === end);
    setPick(null);
    if (play) controller.play(play);
  };
  const onDraw = () => controller.play({ kind: "draw" });

  // The tile laid last in this hand, outlined on the table.
  const lastPlay = [...feed].reverse().find((event) => event.kind === "play");
  const lastTile = lastPlay && !lastPlay.hand ? (lastPlay.tile as Tile) : null;

  let statusLine: string;
  if (status.kind === "finished") {
    statusLine = status.winner === HUMAN ? t("dominoes.end.youWin") : status.winner === COMPUTER ? t("dominoes.end.youLose") : t("dominoes.end.draw");
  } else if (controller.pendingHand) {
    statusLine = t("dominoes.status.handOver");
  } else if (!active) {
    statusLine = t("dominoes.status.thinking");
  } else if (state.mustLead) {
    statusLine = t("dominoes.status.lead", { tile: tileName(state.mustLead) });
  } else if (legal[0]?.kind === "draw") {
    statusLine = t("dominoes.status.draw");
  } else if (legal[0]?.kind === "pass") {
    statusLine = t("dominoes.status.pass");
  } else if (selected) {
    statusLine = t("dominoes.status.pickEnd", { tile: tileName(selected) });
  } else {
    statusLine = t(state.line.length === 0 ? "dominoes.status.open" : "dominoes.status.pick");
  }

  const lines: CommsLine[] = dominoesLines(feed, HUMAN, names, t);
  if (finished) {
    lines.push({ key: "end", kind: "system", text: status.winner === null ? t("comms.draw") : t("comms.winner", { name: names[status.winner] }) });
  } else if (status.kind === "playing") {
    lines.push({ key: "turn", kind: "system", text: status.turn === HUMAN ? t("comms.yourMove") : t("comms.toMove", { name: names[status.turn] }) });
  }

  const endingKey = finished ? `${state.moveCount}:${status.reason}` : null;
  const lastHand = state.history[state.history.length - 1];
  const summary = (() => {
    if (settingUp) return null;
    if (endingKey !== null && resultDismissed !== endingKey && lastHand) {
      return (
        <HandSummaryDialog
          result={lastHand}
          target={state.target}
          me={HUMAN}
          names={names}
          over={{ winner: status.kind === "finished" ? status.winner : null }}
          primary={{ label: t("dominoes.newGame"), onClick: () => setSettingUp(true) }}
          secondary={{ label: t("dominoes.mainMenu"), onClick: toLobby }}
          onClose={() => setResultDismissed(endingKey)}
        />
      );
    }
    if (controller.pendingHand) {
      return (
        <HandSummaryDialog
          result={controller.pendingHand}
          target={state.target}
          me={HUMAN}
          names={names}
          over={null}
          primary={{ label: t("dominoes.playOn"), onClick: controller.acknowledgeHand }}
          onClose={controller.acknowledgeHand}
        />
      );
    }
    return null;
  })();

  const actions = finished ? (
    <>
      <Button variant="primary" onClick={() => setSettingUp(true)}>{t("dominoes.newGame")}</Button>
      <Button variant="secondary" onClick={toLobby}>{t("dominoes.mainMenu")}</Button>
    </>
  ) : (
    <>
      {legal[0]?.kind === "draw" && <Button variant="primary" onClick={onDraw}>{t("dominoes.draw")}</Button>}
      {legal[0]?.kind === "pass" && <Button variant="primary" onClick={() => controller.play({ kind: "pass" })}>{t("dominoes.pass")}</Button>}
      <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
        <History size={16} aria-hidden="true" /> {t("dominoes.history.open")}
      </Button>
      <Button variant="secondary" onClick={() => setConfirmExit(true)}>
        <LogOut size={16} aria-hidden="true" /> {t("dominoes.exitGame")}
      </Button>
    </>
  );

  return (
    <>
      <GameStage
        className="dom-stage"
        title={t("games.dominoes.name")}
        board={(
          <DominoesTable
            state={state}
            me={HUMAN}
            names={names}
            active={active}
            selected={selected}
            lastTile={lastTile}
            phone={phone}
            onPick={onPick}
            onLay={onLay}
            onDraw={onDraw}
          />
        )}
        score={<DominoesScore totals={state.totals} target={state.target} hand={state.hand} me={HUMAN} names={names} />}
        notices={<p className={`dom-status${active ? " is-yours" : ""}`} role="status">{statusLine}</p>}
        log={<Comms lines={lines} />}
        actions={actions}
      />
      {summary}
      {historyOpen && <HandHistoryDialog history={state.history} me={HUMAN} names={names} onClose={() => setHistoryOpen(false)} />}
      {dialogs}
    </>
  );
}
