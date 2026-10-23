import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag } from "lucide-react";
import type { DotsMove, DotsState, PlayerIndex } from "@isputnik/games-engine";
import { ApiError, answerMatch, postMove, resignMatch, type MatchDetail } from "../../api";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { MessageBox } from "../../shared/MessageBox";
import { follow, href, navigate } from "../../router";
import { useSession } from "../../session";
import { DotsBoard } from "./DotsBoard";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { useMatch } from "./useMatch";

// An online match of Dots: the same board, the server's position, and the
// other player somewhere else. Moves go to the server and the page shows what
// it answers; while it is their move the page polls (useMatch).
export function DotsMatchPage({ matchId }: { matchId: string }) {
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
      <section className="dots-page">
        <Head />
        {error
          ? <MessageBox tone="error" title={t("match.loadFailed")}>{error === "network" ? t("app.unavailableBody") : error}</MessageBox>
          : <p className="app-status muted">{t("app.loading")}</p>}
      </section>
    );
  }

  const mySeat: PlayerIndex = match.players[0].id === myId ? 0 : 1;
  const theirSeat: PlayerIndex = mySeat === 0 ? 1 : 0;
  const them = match.players[theirSeat];
  const state = match.state as DotsState;
  const myMove = match.status === "playing" && match.turn === mySeat;
  const finished = match.status === "finished";
  const seatName = (seat: PlayerIndex) => (seat === mySeat ? t("match.you") : match.players[seat].name);

  const place = async (move: DotsMove) => {
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
    case "playing": statusLine = myMove ? t("match.yourMove") : t("match.theirMove", { name: them.name }); break;
    case "finished":
      statusLine = match.winner === null ? t("dots.end.draw") : match.winner === mySeat ? t("match.won") : t("match.lost", { name: them.name });
      break;
  }

  const reason = (() => {
    if (!finished) return null;
    switch (match.finishReason) {
      case "target": return t("dots.end.reasonTarget", { count: state.targetCaptures ?? 0 });
      case "board-full": return t("dots.end.reasonBoardFull");
      case "agreed": return t("dots.end.reasonAgreed");
      case "resigned": return t("dots.end.reasonResigned", { player: seatName(match.winner === 0 ? 1 : 0) });
      default: return null;
    }
  })();

  const score = match.score ?? [0, 0];
  const scoreLine = t("dots.end.scoreLine", { blueName: seatName(0), blue: score[0], red: score[1], redName: seatName(1) });

  return (
    <section className="dots-page">
      <Head />
      <div className="dots-layout">
        <div className="dots-board-wrap">
          <DotsBoard state={state} onPlace={(move) => void place(move)} disabled={!myMove || sending} />
        </div>
        <aside className="dots-side">
          <div className="dots-score" aria-label={t("dots.captures")}>
            <ScoreCell player={0} name={match.players[0].name} captures={score[0]} active={match.status === "playing" && match.turn === 0} />
            <span className="dots-score-colon">:</span>
            <ScoreCell player={1} name={match.players[1].name} captures={score[1]} active={match.status === "playing" && match.turn === 1} />
          </div>
          <p className={`dots-status${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>
          {reason && <p className="muted dots-reason">{reason}</p>}
          {moveError && <MessageBox tone="error" title={t("match.moveFailed")}>{moveError}</MessageBox>}
          <div className="dots-actions">
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

function Head() {
  const { t } = useTranslation();
  return (
    <header className="page-head page-head-row">
      <a className="text-link" href={href()} onClick={(event) => follow(event, href())}>
        <ArrowLeft size={16} aria-hidden="true" /> {t("app.allGames")}
      </a>
      <h1>{t("games.dots.name")}</h1>
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

export type { MatchDetail };
