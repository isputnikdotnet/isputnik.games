import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag } from "lucide-react";
import { StarBattle, otherPlayer, type PlayerIndex, type StarBattleMove, type StarBattleState } from "@isputnik/games-engine";
import { ApiError, answerMatch, postMessage, postMove, resignMatch } from "../../api";
import { Button } from "../../shared/Button";
import { Comms } from "../../shared/Comms";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { GuestLinkPanel } from "../../shared/GuestLinkPanel";
import { MessageBox } from "../../shared/MessageBox";
import { useArena } from "../../shared/useArena";
import { matchSound, useGameSounds } from "../../shared/useGameSounds";
import { withTalk, type CommsLine } from "../../shared/commsLines";
import { href, navigate } from "../../router";
import { useSession } from "../../session";
import { useMatch } from "../dots/useMatch";
import { ArenaHead, ArenaStatus, turnNumber } from "./ArenaFrame";
import { FleetEditor } from "./FleetEditor";
import { StarBattleBoards, lastShotLine } from "./StarBattleBoards";
import { starBattleLines } from "./comms";

// An online match of Star Battle in the arena. The server holds both fleets
// and sends this seat its own view, the feed of every move and what was said;
// the Comms panel shows them and takes a line to say back.
export function StarBattleMatchPage({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  useArena("star");
  const session = useSession();
  const myId = session.status === "ready" ? session.user.id : "";
  const { match, error, refresh, adopt } = useMatch(matchId, myId);
  useGameSounds(matchSound("starbattle", match, myId));
  const [sending, setSending] = useState(false);
  const [saying, setSaying] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [sayError, setSayError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);

  if (!match) {
    return (
      <section className="star-page">
        <ArenaHead chip={t("app.loading")} />
        {error
          ? <MessageBox tone="error" title={t("match.loadFailed")}>{error === "network" ? t("app.unavailableBody") : error}</MessageBox>
          : <p className="app-status muted">{t("app.loading")}</p>}
      </section>
    );
  }

  const mySeat: PlayerIndex = match.players[0].id === myId ? 0 : 1;
  const theirSeat = otherPlayer(mySeat);
  const them = match.players[theirSeat];
  const state = match.state as StarBattleState;
  const phase = StarBattle.phaseOf(state);
  const myMove = match.status === "playing" && match.turn === mySeat;
  const finished = match.status === "finished";
  const names: [string, string] = [mySeat === 0 ? t("match.you") : them.name, mySeat === 1 ? t("match.you") : them.name];
  const columns = t("starbattle.columns");

  const send = async (move: StarBattleMove) => {
    if (!myMove || sending) return;
    setSending(true);
    setMoveError(null);
    try {
      adopt(await postMove(match.id, move, match.moveCount));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await refresh();
      setMoveError(err instanceof ApiError ? err.message : t("app.unavailableBody"));
    } finally {
      setSending(false);
    }
  };

  const say = async (text: string) => {
    setSaying(true);
    setSayError(null);
    try {
      adopt(await postMessage(match.id, text));
    } catch (err) {
      setSayError(err instanceof ApiError ? err.message : t("comms.sendFailed"));
    } finally {
      setSaying(false);
    }
  };

  const doResign = async () => {
    setConfirmResign(false);
    try {
      adopt(await resignMatch(match.id));
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : t("app.unavailableBody"));
    }
  };

  const withdraw = async () => {
    try {
      await answerMatch(match.id, "cancel");
      navigate(href());
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : t("app.unavailableBody"));
    }
  };

  let statusLine: string;
  switch (match.status) {
    // The sender waits; the one invited is told who asks.
    case "invited": statusLine = match.createdBy === myId ? t("match.invited", { name: them.name }) : t("lobby.online.from", { name: them.name }); break;
    case "declined": statusLine = t("match.declined", { name: them.name }); break;
    case "cancelled": statusLine = t("match.cancelled"); break;
    case "playing":
      if (phase === "placing") {
        statusLine = myMove ? t("starbattle.place.title", { player: t("match.you") }) : t("starbattle.status.waitDeploying", { name: them.name });
      } else if (myMove && state.lastShot && state.lastShot.by === mySeat && state.lastShot.result !== "miss") {
        statusLine = state.lastShot.result === "destroyed" ? t("starbattle.status.destroyedAgain") : t("starbattle.status.hitAgain");
      } else {
        statusLine = myMove ? t("starbattle.status.yourShot") : t("starbattle.status.theirShot", { name: them.name });
      }
      break;
    case "finished":
      statusLine = match.winner === null ? t("starbattle.end.draw") : match.winner === mySeat ? t("match.won") : t("match.lost", { name: them.name });
      break;
  }

  const chip = finished
    ? t("starbattle.arena.over")
    : match.status !== "playing"
      ? statusLine
      : phase === "placing"
        ? t("starbattle.arena.deploying")
        : myMove ? t("starbattle.arena.yourTurn") : t("starbattle.arena.theirTurn", { name: them.name });

  const reason = (() => {
    if (!finished) return null;
    const loser = names[otherPlayer(match.winner ?? 0)];
    switch (match.finishReason) {
      case "target": return t("starbattle.end.reasonTarget", { player: loser });
      case "agreed": return t("starbattle.end.reasonAgreed");
      case "resigned": return t("starbattle.end.reasonResigned", { player: loser });
      default: return null;
    }
  })();
  const lastLine = state.lastShot ? lastShotLine(t, columns, state.lastShot, names[state.lastShot.by]) : null;
  const score = match.score ?? [0, 0];
  const scoreLine = t("starbattle.end.scoreLine", { p1Name: names[0], p1: score[0], p2: score[1], p2Name: names[1] });

  const speaker = (seat: PlayerIndex) => ({ who: seat === mySeat ? "you" as const : "them" as const, name: names[seat] });
  const lines: CommsLine[] = withTalk(starBattleLines(match.feed, mySeat, names, columns, t), match.messages, speaker);
  if (finished) {
    lines.push({ key: "end", kind: "system", text: match.winner === null ? t("comms.draw") : t("comms.winner", { name: names[match.winner] }) });
  } else if (match.status === "playing" && phase === "battle") {
    lines.push({ key: "turn", kind: "system", text: myMove ? t("comms.yourMove") : t("comms.toMove", { name: them.name }) });
  }
  const phrases = [t("comms.phrases.gg"), t("comms.phrases.nice"), t("comms.phrases.yourMove"), t("comms.phrases.rematch")];
  const talkable = match.status === "playing" || finished;

  const deploying = match.status === "playing" && phase === "placing" && myMove && !state.placed[mySeat];

  return (
    <section className="star-page">
      <ArenaHead chip={chip} turn={match.status === "playing" && phase === "battle" || finished ? turnNumber(match.feed) : null} />
      {deploying ? (
        <>
          <FleetEditor
            fleet={state.fleet}
            size={state.size}
            title={t("starbattle.place.title", { player: t("match.you") })}
            readyLabel={t("starbattle.place.ready")}
            busy={sending}
            onReady={(vessels) => void send({ kind: "place", vessels })}
          />
          {moveError && <MessageBox tone="error" title={t("match.moveFailed")}>{moveError}</MessageBox>}
        </>
      ) : (match.status === "playing" || finished) && (phase !== "placing" || state.placed[mySeat]) ? (
        <>
          <StarBattleBoards
            state={state}
            viewer={mySeat}
            names={names}
            canFire={myMove && phase === "battle" && !sending}
            onFire={(x, y) => void send({ kind: "shoot", x, y })}
          />
          <Comms lines={lines} onSend={talkable ? (text) => void say(text) : undefined} phrases={phrases} sendTo={them.name} busy={saying} error={sayError} />
          {moveError && <MessageBox tone="error" title={t("match.moveFailed")}>{moveError}</MessageBox>}
        </>
      ) : (
        <>
          <p className="app-status muted">{statusLine}</p>
          {talkable && <Comms lines={lines} onSend={(text) => void say(text)} phrases={phrases} sendTo={them.name} busy={saying} error={sayError} />}
        </>
      )}
      <ArenaStatus line={statusLine} detail={reason ?? (phase === "battle" ? lastLine : null)}>
        {match.status === "playing" && (
          <Button variant="secondary" onClick={() => setConfirmResign(true)}>
            <Flag size={16} aria-hidden="true" /> {t("match.resign")}
          </Button>
        )}
        {match.status === "invited" && match.createdBy === myId && (
          <Button variant="secondary" onClick={() => void withdraw()}>{t("lobby.online.withdraw")}</Button>
        )}
        {match.status === "invited" && match.createdBy !== myId && (
          <>
            <Button variant="primary" onClick={() => answerMatch(match.id, "accept").then(() => refresh())}>{t("lobby.online.accept")}</Button>
            <Button variant="secondary" onClick={() => answerMatch(match.id, "decline").then(() => navigate(href()))}>{t("lobby.online.decline")}</Button>
          </>
        )}
        {(finished || match.status === "declined" || match.status === "cancelled") && (
          <Button variant="primary" onClick={() => navigate(href())}>{t("app.allGames")}</Button>
        )}
      </ArenaStatus>
      {them.guest && match.createdBy === myId && <GuestLinkPanel matchId={match.id} guestName={them.name} />}

      {finished && !resultDismissed && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={scoreLine}
          reason={reason}
          primary={{ label: t("app.allGames"), onClick: () => navigate(href()) }}
          onClose={() => setResultDismissed(true)}
        />
      )}
      {confirmResign && (
        <Dialog
          title={t("match.confirmResign.title")}
          confirmLabel={t("match.confirmResign.confirm")}
          cancelLabel={t("match.confirmResign.cancel")}
          danger
          onConfirm={() => void doResign()}
          onClose={() => setConfirmResign(false)}
        >
          {t("match.confirmResign.body", { name: them.name })}
        </Dialog>
      )}
    </section>
  );
}
