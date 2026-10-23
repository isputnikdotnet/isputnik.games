import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag } from "lucide-react";
import { SeaBattle, otherPlayer, type PlayerIndex, type SeaBattleMove, type SeaBattleState } from "@isputnik/games-engine";
import { ApiError, answerMatch, postMove, resignMatch } from "../../api";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { MessageBox } from "../../shared/MessageBox";
import { href, navigate } from "../../router";
import { useSession } from "../../session";
import { useMatch } from "../dots/useMatch";
import { FleetEditor } from "./FleetEditor";
import { SeaBattleBoards, lastShotLine } from "./SeaBattleBoards";
import { PageHead } from "./SeaBattlePage";

// An online match of Sea Battle. The server holds both fleets and sends this
// seat its own view: its fleet, its shots, and of the other fleet only the
// ships it has sunk. Laying the fleet is the first move; while it is their
// move the page polls (useMatch).
export function SeaBattleMatchPage({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const session = useSession();
  const myId = session.status === "ready" ? session.user.id : "";
  const { match, error, refresh, adopt } = useMatch(matchId, myId);
  const [sending, setSending] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);

  if (!match) {
    return (
      <section className="sea-page">
        <PageHead title={t("games.seabattle.name")} />
        {error
          ? <MessageBox tone="error" title={t("match.loadFailed")}>{error === "network" ? t("app.unavailableBody") : error}</MessageBox>
          : <p className="app-status muted">{t("app.loading")}</p>}
      </section>
    );
  }

  const mySeat: PlayerIndex = match.players[0].id === myId ? 0 : 1;
  const theirSeat = otherPlayer(mySeat);
  const them = match.players[theirSeat];
  const state = match.state as SeaBattleState;
  const phase = SeaBattle.phaseOf(state);
  const myMove = match.status === "playing" && match.turn === mySeat;
  const finished = match.status === "finished";
  const names: [string, string] = [mySeat === 0 ? t("match.you") : them.name, mySeat === 1 ? t("match.you") : them.name];
  const columns = t("seabattle.columns");

  const send = async (move: SeaBattleMove) => {
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
    case "invited": statusLine = t("match.invited", { name: them.name }); break;
    case "declined": statusLine = t("match.declined", { name: them.name }); break;
    case "cancelled": statusLine = t("match.cancelled"); break;
    case "playing":
      if (phase === "placing") {
        statusLine = myMove ? t("seabattle.place.title", { player: t("match.you") }) : t("seabattle.status.waitLaying", { name: them.name });
      } else if (myMove && state.lastShot && state.lastShot.by === mySeat && state.lastShot.result !== "miss") {
        statusLine = state.lastShot.result === "sunk" ? t("seabattle.status.sunkAgain") : t("seabattle.status.hitAgain");
      } else {
        statusLine = myMove ? t("seabattle.status.yourShot") : t("seabattle.status.theirShot", { name: them.name });
      }
      break;
    case "finished":
      statusLine = match.winner === null ? t("seabattle.end.draw") : match.winner === mySeat ? t("match.won") : t("match.lost", { name: them.name });
      break;
  }

  const reason = (() => {
    if (!finished) return null;
    const loser = names[otherPlayer(match.winner ?? 0)];
    switch (match.finishReason) {
      case "target": return t("seabattle.end.reasonTarget", { player: loser });
      case "agreed": return t("seabattle.end.reasonAgreed");
      case "resigned": return t("seabattle.end.reasonResigned", { player: loser });
      default: return null;
    }
  })();
  const lastLine = state.lastShot ? lastShotLine(t, columns, state.lastShot, names[state.lastShot.by]) : null;
  const score = match.score ?? [0, 0];
  const scoreLine = t("seabattle.end.scoreLine", { p1Name: names[0], p1: score[0], p2: score[1], p2Name: names[1] });

  const laying = match.status === "playing" && phase === "placing" && myMove && !state.placed[mySeat];

  return (
    <section className="sea-page">
      <PageHead title={t("games.seabattle.name")} />
      {laying ? (
        <>
          <FleetEditor
            fleet={state.fleet}
            size={state.size}
            title={t("seabattle.place.title", { player: t("match.you") })}
            readyLabel={t("seabattle.place.ready")}
            busy={sending}
            onReady={(ships) => void send({ kind: "place", ships })}
          />
          {moveError && <MessageBox tone="error" title={t("match.moveFailed")}>{moveError}</MessageBox>}
        </>
      ) : (
        <div className="sea-layout">
          {match.status === "playing" || finished
            ? (
              <SeaBattleBoards
                state={state}
                viewer={mySeat}
                names={names}
                canFire={myMove && phase === "battle" && !sending}
                onFire={(x, y) => void send({ kind: "shoot", x, y })}
              />
            )
            : <p className="app-status muted">{statusLine}</p>}
          <aside className="sea-side">
            {(match.status === "playing" || finished) && (
              <p className={`sea-status${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>
            )}
            {lastLine && !finished && <p className="muted sea-last-line">{lastLine}</p>}
            {reason && <p className="muted sea-reason">{reason}</p>}
            {moveError && <MessageBox tone="error" title={t("match.moveFailed")}>{moveError}</MessageBox>}
            <div className="sea-actions">
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
            </div>
          </aside>
        </div>
      )}

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
