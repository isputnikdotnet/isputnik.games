import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckersTable } from "./CheckersTable";
import { ChessSettingsDialog } from "../chess/SettingsDialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { matchSound, useGameSounds } from "../../shared/useGameSounds";
import type { CheckersMove, CheckersState, PlayerIndex } from "@isputnik/games-engine";
import { ApiError, answerMatch, postMove, postMessage, resignMatch, type MatchSummary } from "../../api";
import { useSession } from "../../session";
import { useMatch } from "../dots/useMatch";
import { GameStage } from "../../shared/GameStage";
import { GuestLinkPanel } from "../../shared/GuestLinkPanel";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { Comms } from "../../shared/Comms";
import { withTalk, type CommsLine } from "../../shared/commsLines";
import { href, navigate } from "../../router";

export function CheckersMatchPage({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const session = useSession(),
    myId = session.status === "ready" ? session.user.id : "";
  const { match, error, adopt, refresh } = useMatch(matchId, myId);
  useGameSounds(matchSound("checkers", match, myId));
  const [settings, setSettings] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<string | null>(null);
  const [resigning, setResigning] = useState(false),
    [flipped, setFlipped] = useState(false);
  const act = async (action: () => Promise<MatchSummary>) => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await action();
      if ("state" in result) adopt(result as import("../../api").MatchDetail);
      else await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await refresh();
      setFailure(err instanceof ApiError ? err.message : t("app.unavailableBody"));
    } finally {
      setBusy(false);
    }
  };
  if (!match) return <p role="status">{error ?? t("app.loading")}</p>;
  const seat: PlayerIndex = match.players[0].id === myId ? 0 : 1;
  const them = match.players[seat === 0 ? 1 : 0];
  const state = match.state as CheckersState;
  const myMove = match.status === "playing" && match.turn === seat;
  const finished = match.status === "finished";
  const line = finished
    ? match.winner === null
      ? t("checkers.draw")
      : match.winner === seat
        ? t("match.won")
        : t("match.lost", { name: them.name })
    : match.status === "playing"
      ? myMove
        ? t("match.yourMove")
        : t("match.theirMove", { name: them.name })
      : match.status === "invited"
        ? t("match.invited", { name: them.name })
        : match.status === "declined"
          ? t("match.declined", { name: them.name })
          : t("match.cancelled");
  const events: CommsLine[] = match.feed.map((event, i) => ({
    key: `move-${i}`,
    kind: "event",
    who: event.by === seat ? "you" : "them",
    name: match.players[event.by].name,
    text: String(event.notation ?? "")
  }));
  const lines = withTalk(events, match.messages, (by) => ({
    who: by === seat ? "you" : "them",
    name: match.players[by].name
  }));
  const move = (move: CheckersMove) => {
    if (myMove) void act(() => postMove(match.id, move, match.moveCount));
  };
  return (
    <>
      <GameStage
        className="chess-stage checkers-stage"
        title={t("games.checkers.name")}
        board={
          <CheckersTable
            names={[match.players[0].name, match.players[1].name]}
            state={state}
            movable={myMove && !busy ? seat : null}
            orientation={flipped ? (seat === 0 ? 1 : 0) : seat}
            onMove={move}
          />
        }
        score={
          <div>
            <p className="checkers-status" role="status">
              {line}
            </p>
            <p className="muted">{t("checkers.variant")}</p>
            <div className="checkers-counts">
              {match.players.map((p, i) => (
                <span key={p.id}>
                  {p.name} · {state.board.filter((piece) => piece?.player === i).length}
                </span>
              ))}
            </div>
          </div>
        }
        notices={
          <>
            {failure && <p role="alert">{failure}</p>}
            {match.createdBy === myId && them.guest && <GuestLinkPanel matchId={match.id} guestName={them.name} />}
          </>
        }
        log={
          <Comms
            lines={lines}
            onSend={
              match.status === "playing" || finished ? (text) => void act(() => postMessage(match.id, text)) : undefined
            }
            sendTo={them.name}
            busy={busy}
          />
        }
        actions={
          <>
            <Button onClick={() => setSettings(true)}>{t("chess.settings.open")}</Button>
            <Button onClick={() => setFlipped(!flipped)}>{t("checkers.flip")}</Button>
            {match.status === "playing" && (
              <Button disabled={busy} onClick={() => setResigning(true)}>
                {t("checkers.resign")}
              </Button>
            )}
            {match.status === "invited" &&
              (match.createdBy === myId ? (
                <Button disabled={busy} onClick={() => void act(() => answerMatch(match.id, "cancel"))}>
                  {t("lobby.online.withdraw")}
                </Button>
              ) : (
                <>
                  <Button
                    disabled={busy}
                    variant="primary"
                    onClick={() => void act(() => answerMatch(match.id, "accept"))}
                  >
                    {t("lobby.online.accept")}
                  </Button>
                  <Button disabled={busy} onClick={() => void act(() => answerMatch(match.id, "decline"))}>
                    {t("lobby.online.decline")}
                  </Button>
                </>
              ))}
            <Button onClick={() => navigate(href())}>{t("app.allGames")}</Button>
          </>
        }
      />
      {settings && <ChessSettingsDialog onClose={() => setSettings(false)} />}
      {finished && !resultDismissed && (
        <GameOverDialog
          headline={line}
          scoreLine={t("chess.end.moves", {
            count: Math.ceil(state.moves.length / 2)
          })}
          reason={
            state.status.kind === "finished" && state.status.reason === "board-full" ? t("checkers.noMoves") : null
          }
          primary={{
            label: t("app.allGames"),
            onClick: () => navigate(href())
          }}
          onClose={() => setResultDismissed(true)}
        />
      )}
      {resigning && (
        <Dialog
          title={t("checkers.confirm.resign")}
          confirmLabel={t("checkers.confirm.yes")}
          cancelLabel={t("checkers.confirm.no")}
          onClose={() => setResigning(false)}
          onConfirm={() => {
            setResigning(false);
            void act(() => resignMatch(match.id));
          }}
        >
          {t("checkers.confirm.body")}
        </Dialog>
      )}
    </>
  );
}
