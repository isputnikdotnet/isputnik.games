import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag } from "lucide-react";
import type { DotsMove, DotsState, PlayerIndex } from "@isputnik/games-engine";
import { ApiError, answerMatch, postMessage, postMove, resignMatch, type MatchDetail } from "../../api";
import { Comms } from "../../shared/Comms";
import { withTalk, type CommsLine } from "../../shared/commsLines";
import { dotsLines } from "./comms";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { MessageBox } from "../../shared/MessageBox";
import { follow, href, navigate } from "../../router";
import { useSession } from "../../session";
import { PHONE, useMediaQuery } from "../../shared/useMediaQuery";
import { DotsBoard } from "./DotsBoard";
import { DotsScoreboard } from "./DotsScoreboard";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { GuestLinkPanel } from "../../shared/GuestLinkPanel";
import { useMatch } from "./useMatch";

// An online match of Dots: the same board, the server's position, and the
// other player somewhere else. Moves go to the server and the page shows what
// it answers; while it is their move the page polls (useMatch).
export function DotsMatchPage({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const session = useSession();
  const phone = useMediaQuery(PHONE);
  const myId = session.status === "ready" ? session.user.id : "";
  const { match, error, refresh, adopt } = useMatch(matchId, myId);
  const [sending, setSending] = useState(false);
  const [saying, setSaying] = useState(false);
  const [sayError, setSayError] = useState<string | null>(null);
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

  const names: [string, string] = [seatName(0), seatName(1)];
  const lines: CommsLine[] = withTalk(dotsLines(match.feed, mySeat, names, t), match.messages, (seat) => ({ who: seat === mySeat ? "you" : "them", name: names[seat] }));
  if (finished) {
    lines.push({ key: "end", kind: "system", text: match.winner === null ? t("comms.draw") : t("comms.winner", { name: names[match.winner] }) });
  } else if (match.status === "playing") {
    lines.push({ key: "turn", kind: "system", text: myMove ? t("comms.yourMove") : t("comms.toMove", { name: them.name }) });
  }
  const talkable = match.status === "playing" || finished;
  const phrases = [t("comms.phrases.gg"), t("comms.phrases.nice"), t("comms.phrases.yourMove"), t("comms.phrases.rematch")];

  // The score and the status: beside the board on a desktop, above it on a phone.
  const scoreboard = (
    <DotsScoreboard
      sides={[
        { name: match.players[0].name, captures: score[0], active: match.status === "playing" && match.turn === 0 },
        { name: match.players[1].name, captures: score[1], active: match.status === "playing" && match.turn === 1 }
      ]}
      statusLine={statusLine}
      finished={finished}
      reason={reason}
      top={phone}
    />
  );

  return (
    <section className="dots-page">
      <Head />
      <div className="dots-layout">
        {phone && scoreboard}
        <div className="dots-board-wrap">
          <DotsBoard state={state} onPlace={(move) => void place(move)} disabled={!myMove || sending} />
        </div>
        <aside className="dots-side">
          {!phone && scoreboard}
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
          {them.guest && match.createdBy === myId && <GuestLinkPanel matchId={match.id} guestName={them.name} />}
          {talkable && (
            <Comms lines={lines} onSend={(text) => void say(text)} phrases={phrases} sendTo={them.name} busy={saying} error={sayError} />
          )}
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

export type { MatchDetail };
