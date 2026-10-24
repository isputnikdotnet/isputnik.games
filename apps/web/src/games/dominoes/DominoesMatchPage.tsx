import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, History } from "lucide-react";
import { Dominoes, otherPlayer, type DominoesMove, type DominoesState, type End, type PlayerIndex, type Tile } from "@isputnik/games-engine";
import { ApiError, answerMatch, postMessage, postMove, resignMatch } from "../../api";
import { Button } from "../../shared/Button";
import { Comms } from "../../shared/Comms";
import { Dialog } from "../../shared/Dialog";
import { GameOverDialog } from "../../shared/GameOverDialog";
import { GameStage } from "../../shared/GameStage";
import { GuestLinkPanel } from "../../shared/GuestLinkPanel";
import { MessageBox } from "../../shared/MessageBox";
import { matchSound, useGameSounds } from "../../shared/useGameSounds";
import { withTalk, type CommsLine } from "../../shared/commsLines";
import { PHONE, useMediaQuery } from "../../shared/useMediaQuery";
import { scoreText } from "../../shared/score";
import { href, navigate } from "../../router";
import { useSession } from "../../session";
import { useMatch } from "../dots/useMatch";
import { DominoesScore, HandHistoryDialog, HandSummaryDialog } from "./DominoesPanel";
import { DominoesTable, playsOfTile, tileName } from "./DominoesTable";
import { dominoesLines } from "./comms";

type Play = Extract<DominoesMove, { kind: "play" }>;

const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

// An online match of Dominoes. The server deals from a seed it keeps to itself
// and sends this seat its own view: its hand, the line, how many tiles the
// other hand and the boneyard hold. The table, the panel and the summaries are
// the local game's; the Comms panel takes a line to say back.
export function DominoesMatchPage({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const session = useSession();
  const myId = session.status === "ready" ? session.user.id : "";
  const { match, error, refresh, adopt } = useMatch(matchId, myId);
  useGameSounds(matchSound("dominoes", match, myId));
  const phone = useMediaQuery(PHONE);
  const [sending, setSending] = useState(false);
  const [saying, setSaying] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [sayError, setSayError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [pick, setPick] = useState<{ tile: Tile; at: number } | null>(null);
  // Hands summarised already: the ones over before the page opened count as seen.
  const [seenHands, setSeenHands] = useState<number | null>(null);
  const handsSoFar = match ? (match.state as DominoesState).history.length : null;
  useEffect(() => {
    if (seenHands === null && handsSoFar !== null) setSeenHands(handsSoFar);
  }, [seenHands, handsSoFar]);

  if (!match) {
    return error
      ? <MessageBox tone="error" title={t("match.loadFailed")}>{error === "network" ? t("app.unavailableBody") : error}</MessageBox>
      : <p className="app-status muted">{t("app.loading")}</p>;
  }

  const mySeat: PlayerIndex = match.players[0].id === myId ? 0 : 1;
  const theirSeat = otherPlayer(mySeat);
  const them = match.players[theirSeat];
  const state = match.state as DominoesState;
  const myMove = match.status === "playing" && match.turn === mySeat;
  const finished = match.status === "finished";
  const names: [string, string] = [mySeat === 0 ? t("match.you") : them.name, mySeat === 1 ? t("match.you") : them.name];
  const active = myMove && !sending;
  const legal = active ? Dominoes.legalMoves(state) : [];
  const plays = legal.filter((m): m is Play => m.kind === "play");
  const selected = pick && pick.at === match.moveCount ? pick.tile : null;
  const history = state.history;
  const pendingHand = !finished && seenHands !== null && history.length > seenHands ? history[history.length - 1] : null;

  const send = async (move: DominoesMove) => {
    if (!myMove || sending) return;
    setSending(true);
    setMoveError(null);
    setPick(null);
    try {
      adopt(await postMove(match.id, move, match.moveCount));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await refresh();
      setMoveError(err instanceof ApiError ? err.message : t("app.unavailableBody"));
    } finally {
      setSending(false);
    }
  };

  const onPick = (tile: Tile) => {
    const options = playsOfTile(state, plays, tile);
    if (options.length === 0) return;
    if (options.length === 1) {
      void send(options[0]);
      return;
    }
    setPick(selected && same(selected, tile) ? null : { tile, at: match.moveCount });
  };
  const onLay = (end: End) => {
    if (!selected) return;
    const play = playsOfTile(state, plays, selected).find((p) => p.end === end);
    if (play) void send(play);
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
    case "invited": statusLine = match.createdBy === myId ? t("match.invited", { name: them.name }) : t("lobby.online.from", { name: them.name }); break;
    case "declined": statusLine = t("match.declined", { name: them.name }); break;
    case "cancelled": statusLine = t("match.cancelled"); break;
    case "finished":
      statusLine = match.winner === null ? t("dominoes.end.draw") : match.winner === mySeat ? t("match.won") : t("match.lost", { name: them.name });
      break;
    case "playing":
      if (!myMove) statusLine = t("dominoes.status.theirs", { name: them.name });
      else if (state.mustLead) statusLine = t("dominoes.status.lead", { tile: tileName(state.mustLead) });
      else if (legal[0]?.kind === "draw") statusLine = t("dominoes.status.draw");
      else if (legal[0]?.kind === "pass") statusLine = t("dominoes.status.pass");
      else if (selected) statusLine = t("dominoes.status.pickEnd", { tile: tileName(selected) });
      else statusLine = t(state.line.length === 0 ? "dominoes.status.open" : "dominoes.status.pick");
      break;
  }

  const lastPlay = [...match.feed].reverse().find((event) => event.kind === "play");
  const lastTile = lastPlay && !lastPlay.hand ? (lastPlay.tile as Tile) : null;

  const speaker = (seat: PlayerIndex) => ({ who: seat === mySeat ? "you" as const : "them" as const, name: names[seat] });
  const lines: CommsLine[] = withTalk(dominoesLines(match.feed, mySeat, names, t), match.messages, speaker);
  if (finished) {
    lines.push({ key: "end", kind: "system", text: match.winner === null ? t("comms.draw") : t("comms.winner", { name: names[match.winner] }) });
  } else if (match.status === "playing") {
    lines.push({ key: "turn", kind: "system", text: myMove ? t("comms.yourMove") : t("comms.toMove", { name: them.name }) });
  }
  const phrases = [t("comms.phrases.gg"), t("comms.phrases.nice"), t("comms.phrases.yourMove"), t("comms.phrases.rematch")];
  const talkable = match.status === "playing" || finished;

  const actions = (
    <>
      {myMove && legal[0]?.kind === "draw" && <Button variant="primary" disabled={sending} onClick={() => void send({ kind: "draw" })}>{t("dominoes.draw")}</Button>}
      {myMove && legal[0]?.kind === "pass" && <Button variant="primary" disabled={sending} onClick={() => void send({ kind: "pass" })}>{t("dominoes.pass")}</Button>}
      {(match.status === "playing" || finished) && (
        <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
          <History size={16} aria-hidden="true" /> {t("dominoes.history.open")}
        </Button>
      )}
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
    </>
  );

  const lastHand = history[history.length - 1];
  const ended = (() => {
    if (!finished || resultDismissed) return null;
    // Reaching the target ends on a hand worth showing; a resignation does not.
    if (match.finishReason === "target" && lastHand) {
      return (
        <HandSummaryDialog
          result={lastHand}
          target={state.target}
          me={mySeat}
          names={names}
          over={{ winner: match.winner }}
          primary={{ label: t("app.allGames"), onClick: () => navigate(href()) }}
          onClose={() => setResultDismissed(true)}
        />
      );
    }
    const loser = names[otherPlayer(match.winner ?? 0)];
    return (
      <GameOverDialog
        headline={statusLine}
        scoreLine={scoreText(match, t) ?? ""}
        reason={match.finishReason === "resigned" ? t("dominoes.end.resigned", { name: loser }) : null}
        primary={{ label: t("app.allGames"), onClick: () => navigate(href()) }}
        onClose={() => setResultDismissed(true)}
      />
    );
  })();

  return (
    <>
      <GameStage
        className="dom-stage"
        title={t("games.dominoes.name")}
        board={(
          <DominoesTable
            state={state}
            me={mySeat}
            names={names}
            active={active && !pendingHand}
            selected={selected}
            lastTile={lastTile}
            phone={phone}
            onPick={onPick}
            onLay={onLay}
            onDraw={() => void send({ kind: "draw" })}
          />
        )}
        score={<DominoesScore totals={state.totals} target={state.target} hand={state.hand} me={mySeat} names={names} />}
        notices={(
          <>
            <p className={`dom-status${myMove ? " is-yours" : ""}`} role="status">{statusLine}</p>
            {moveError && <MessageBox tone="error" title={t("match.moveFailed")}>{moveError}</MessageBox>}
            {them.guest && match.createdBy === myId && <GuestLinkPanel matchId={match.id} guestName={them.name} />}
          </>
        )}
        log={<Comms lines={lines} onSend={talkable ? (text) => void say(text) : undefined} phrases={phrases} sendTo={them.name} busy={saying} error={sayError} />}
        actions={actions}
      />
      {pendingHand && (
        <HandSummaryDialog
          result={pendingHand}
          target={state.target}
          me={mySeat}
          names={names}
          over={null}
          primary={{ label: t("dominoes.playOn"), onClick: () => setSeenHands(history.length) }}
          onClose={() => setSeenHands(history.length)}
        />
      )}
      {ended}
      {historyOpen && <HandHistoryDialog history={history} me={mySeat} names={names} onClose={() => setHistoryOpen(false)} />}
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
