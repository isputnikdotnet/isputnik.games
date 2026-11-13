import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flag, Handshake, History, Repeat2, Settings2 } from "lucide-react";
import { Chess, type ChessMove, type ChessState, type PlayerIndex } from "@isputnik/games-engine";
import { ApiError, answerMatch, drawMatch, postMessage, postMove, resignMatch, type DrawAction } from "../../api";
import { Comms } from "../../shared/Comms";
import { withTalk, type CommsLine } from "../../shared/commsLines";
import { Button } from "../../shared/Button";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { GameStage } from "../../shared/GameStage";
import { GuestLinkPanel } from "../../shared/GuestLinkPanel";
import { MessageBox } from "../../shared/MessageBox";
import { matchSound, useGameSounds } from "../../shared/useGameSounds";
import { follow, href, navigate } from "../../router";
import { useSession } from "../../session";
import { useMatch } from "../dots/useMatch";
import { chessLines } from "./comms";
import { chessReason } from "./ending";
import { ChessTable } from "./ChessTable";
import { ChessRatingLine, useChessRatingAfter } from "./RatingLine";
import { ChessSettingsDialog } from "./SettingsDialog";
import { ReplayControls, ReplayNote, useReplay } from "./replay";
import { useMatchClock } from "./useMatchClock";
import { clockLabel } from "./clockText";

const NO_MOVES: ChessMove[] = [];

// An online game of chess: the same table, the server's position, and the
// other player somewhere else. The board faces your colour; moves go to the
// server and the page shows what it answers, polling while it is their move.
export function ChessMatchPage({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const session = useSession();
  const myId = session.status === "ready" ? session.user.id : "";
  const { match, error, refresh, adopt } = useMatch(matchId, myId);
  const clock = useMatchClock(match, refresh);
  useGameSounds(matchSound("chess", match, myId));
  const [sending, setSending] = useState(false);
  const [saying, setSaying] = useState(false);
  const [sayError, setSayError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [drawBusy, setDrawBusy] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A finished game between two members moved both chess ratings; a game
  // with a guest moved none.
  const rated = match?.status === "finished" && session.status === "ready" && session.user.role !== "guest"
    && !match.players.some((player) => player.guest);
  const chessRating = useChessRatingAfter(rated ? match.id : null);
  // Looking back over the moves so far; the game stays at its last move.
  const moves = (match?.state as ChessState | undefined)?.moves ?? NO_MOVES;
  const replay = useReplay(moves.length);
  const earlier = useMemo(() => (replay.atEnd ? null : Chess.replay(moves.slice(0, replay.ply))), [moves, replay.atEnd, replay.ply]);

  if (!match) {
    return (
      <section className="chess-page">
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
  const state = match.state as ChessState;
  const myMove = match.status === "playing" && match.turn === mySeat;
  const finished = match.status === "finished";
  const names: [string, string] = [mySeat === 0 ? t("match.you") : match.players[0].name, mySeat === 1 ? t("match.you") : match.players[1].name];
  const orientation: PlayerIndex = flipped ? theirSeat : mySeat;

  const move = async (played: ChessMove) => {
    if (!myMove || sending) return;
    setSending(true);
    setMoveError(null);
    try {
      adopt(await postMove(match.id, played, match.moveCount));
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

  const draw = async (action: DrawAction) => {
    setDrawBusy(true);
    setMoveError(null);
    try {
      adopt(await drawMatch(match.id, action));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await refresh();
      setMoveError(err instanceof ApiError ? err.message : t("app.unavailableBody"));
    } finally {
      setDrawBusy(false);
    }
  };
  const offer = match.status === "playing" ? match.draw ?? null : null;
  const theyOffer = offer?.offeredBy === theirSeat;
  const iOffer = offer?.offeredBy === mySeat;

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
    case "invited": statusLine = match.createdBy === myId ? t("match.invited", { name: them.name }) : t("lobby.online.from", { name: them.name }); break;
    case "declined": statusLine = t("match.declined", { name: them.name }); break;
    case "cancelled": statusLine = t("match.cancelled"); break;
    case "playing":
      statusLine = myMove
        ? (state.check ? t("chess.turnCheck", { player: t("match.you") }) : t("match.yourMove"))
        : (state.check ? t("chess.turnCheck", { player: them.name }) : t("match.theirMove", { name: them.name }));
      break;
    case "finished":
      statusLine = match.winner === null ? t("chess.end.draw") : match.winner === mySeat ? t("match.won") : t("match.lost", { name: them.name });
      break;
  }
  const reason = finished ? chessReason(match.finishReason, names[match.winner === null ? state.toMove : match.winner === 0 ? 1 : 0], t, match.winner === null) : null;

  const lines: CommsLine[] = withTalk(chessLines(match.feed, mySeat, names, t), match.messages, (seat) => ({ who: seat === mySeat ? "you" : "them", name: names[seat] }));
  if (finished) {
    lines.push({ key: "end", kind: "system", text: match.winner === null ? t("comms.draw") : t("comms.winner", { name: names[match.winner] }) });
  } else if (match.status === "playing") {
    if (offer?.offeredBy !== null && offer?.offeredBy !== undefined) {
      lines.push({ key: "draw", kind: "system", text: iOffer ? t("match.drawOffer.logMine") : t("match.drawOffer.logTheirs", { name: them.name }) });
    }
    lines.push({ key: "turn", kind: "system", text: myMove ? t("comms.yourMove") : t("comms.toMove", { name: them.name }) });
  }
  const talkable = match.status === "playing" || finished;
  const phrases = [t("comms.phrases.gg"), t("comms.phrases.nice"), t("comms.phrases.yourMove"), t("comms.phrases.rematch")];

  return (
    <>
      <GameStage
        className="chess-stage"
        title={t("games.chess.name")}
        board={
          <ChessTable
            state={earlier ?? state}
            orientation={orientation}
            movable={myMove && !sending && !earlier ? mySeat : null}
            onMove={(played) => void move(played)}
            names={names}
            clock={clock}
          />
        }
        score={
          <div className="chess-status">
            <p className={`chess-status-line${finished ? " is-finished" : ""}`} role="status">{statusLine}</p>
            {reason && <p className="muted chess-reason">{reason}</p>}
            <ReplayNote replay={replay} />
            {chessRating && <ChessRatingLine rating={chessRating} />}
            {clock && !finished && <p className="muted chess-reason">{t("chess.clock.line", { clock: clockLabel(clock.control, t) })}</p>}
          </div>
        }
        notices={
          <>
            {moveError && <MessageBox tone="error" title={t("match.moveFailed")}>{moveError}</MessageBox>}
            {/* The other side offers a draw: answer it here (a move declines it too). */}
            {theyOffer && (
              <MessageBox tone="info" title={t("match.drawOffer.theirsTitle", { name: them.name })}>
                {t("match.drawOffer.theirsBody")}
                <span className="draw-offer-actions">
                  <Button variant="primary" onClick={() => void draw("accept")} disabled={drawBusy}>
                    <Handshake size={16} aria-hidden="true" /> {t("match.drawOffer.accept")}
                  </Button>
                  <Button variant="secondary" onClick={() => void draw("decline")} disabled={drawBusy}>{t("match.drawOffer.decline")}</Button>
                </span>
              </MessageBox>
            )}
            {iOffer && (
              <MessageBox tone="info" title={t("match.drawOffer.mineTitle")}>
                {t("match.drawOffer.mineBody", { name: them.name })}
                <span className="draw-offer-actions">
                  <Button variant="secondary" onClick={() => void draw("withdraw")} disabled={drawBusy}>{t("match.drawOffer.withdraw")}</Button>
                </span>
              </MessageBox>
            )}
            {them.guest && match.createdBy === myId && <GuestLinkPanel matchId={match.id} guestName={them.name} />}
          </>
        }
        log={talkable && <Comms lines={lines} onSend={(text) => void say(text)} phrases={phrases} sendTo={them.name} busy={saying} error={sayError} />}
        actions={
          <>
            {(match.status === "playing" || finished) && <ReplayControls replay={replay} />}
            {match.status === "playing" && (
              <>
                <Button variant="secondary" onClick={() => setFlipped((f) => !f)}>
                  <Repeat2 size={16} aria-hidden="true" /> {t("chess.flip")}
                </Button>
                <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                  <Settings2 size={16} aria-hidden="true" /> {t("chess.settings.open")}
                </Button>
                {offer?.canOffer && (
                  <Button variant="secondary" onClick={() => void draw("offer")} disabled={drawBusy}>
                    <Handshake size={16} aria-hidden="true" /> {t("match.drawOffer.offer")}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setConfirmResign(true)}>
                  <Flag size={16} aria-hidden="true" /> {t("match.resign")}
                </Button>
              </>
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
            {finished && (
              <Button variant="secondary" onClick={() => navigate(href(`chess/review/m/${match.id}`))}>
                <History size={16} aria-hidden="true" /> {t("chess.review.open")}
              </Button>
            )}
          </>
        }
      />

      {settingsOpen && <ChessSettingsDialog onClose={() => setSettingsOpen(false)} />}
      {finished && !resultDismissed && (
        <GameOverDialog
          headline={statusLine}
          scoreLine={t("chess.end.moves", { count: Math.ceil(state.moves.length / 2) })}
          reason={reason}
          primary={{ label: t("app.allGames"), onClick: () => navigate(href()) }}
          review={{ label: t("chess.review.open"), onClick: () => navigate(href(`chess/review/m/${match.id}`)) }}
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
    </>
  );
}

function Head() {
  const { t } = useTranslation();
  return (
    <header className="page-head page-head-row">
      <a className="text-link" href={href()} onClick={(event) => follow(event, href())}>
        <ArrowLeft size={16} aria-hidden="true" /> {t("app.allGames")}
      </a>
      <h1>{t("games.chess.name")}</h1>
    </header>
  );
}
