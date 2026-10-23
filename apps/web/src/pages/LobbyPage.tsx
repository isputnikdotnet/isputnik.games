import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { GAMES } from "@isputnik/games-engine";
import { answerMatch, fetchMatches, type MatchSummary } from "../api";
import { follow, href, matchHref, navigate } from "../router";
import { useSession } from "../session";
import { Button } from "../shared/Button";
import { MessageBox } from "../shared/MessageBox";
import { useNewcomerCue } from "../shared/useGameSounds";
import { CATALOG } from "../games/catalog";
import { InviteDialog } from "./InviteDialog";
import { MATCHES_ANCHOR } from "../shared/MobileNav";

/** "alpha" / "beta" in the interface language; anything else as the server says it. */
function stageLabel(stage: string, t: (key: "lobby.stageAlpha" | "lobby.stageBeta") => string): string {
  if (stage === "alpha") return t("lobby.stageAlpha");
  if (stage === "beta") return t("lobby.stageBeta");
  return stage;
}

export function LobbyPage() {
  const { t } = useTranslation();
  const session = useSession();
  const myId = session.status === "ready" ? session.user.id : "";
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      setMatches(await fetchMatches());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // A member who left the tab open sees a new invitation without a reload.
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const answer = async (match: MatchSummary, what: "accept" | "decline" | "cancel") => {
    try {
      await answerMatch(match.id, what);
      if (what === "accept") navigate(matchHref(match.game, match.id));
      else await load();
    } catch {
      setFailed(true);
    }
  };

  const mySeat = (match: MatchSummary) => (match.players[0].id === myId ? 0 : 1);
  const opponentOf = (match: MatchSummary) => match.players[mySeat(match) === 0 ? 1 : 0];
  const list = matches ?? [];
  const received = list.filter((m) => m.status === "invited" && m.createdBy !== myId);
  const sent = list.filter((m) => m.status === "invited" && m.createdBy === myId);
  const mine = list.filter((m) => m.status === "playing" && m.turn === mySeat(m));
  useNewcomerCue(matches && received.map((m) => m.id), "invite");
  useNewcomerCue(matches && mine.map((m) => m.id), "yourMove");
  const theirs = list.filter((m) => m.status === "playing" && m.turn !== mySeat(m));
  const finished = list.filter((m) => m.status === "finished").slice(0, 10);

  const resultOf = (match: MatchSummary) => {
    if (match.winner === null) return t("match.draw");
    return match.winner === mySeat(match) ? t("match.won") : t("match.lost", { name: opponentOf(match).name });
  };

  const row = (match: MatchSummary, line: string, actions?: React.ReactNode) => {
    const to = matchHref(match.game, match.id);
    return (
      <li key={match.id} className="match-row">
        <a className="match-row-main" href={to} onClick={(event) => follow(event, to)}>
          <strong>{t("lobby.online.vs", { name: opponentOf(match).name })}</strong>
          <span className="match-row-game muted">{CATALOG[match.game] ? t(CATALOG[match.game].name) : match.game}</span>
          <span className="muted">
            {line}
            {match.score && ` · ${match.score[0]} : ${match.score[1]}`}
          </span>
        </a>
        {actions && <span className="match-row-actions">{actions}</span>}
      </li>
    );
  };

  const group = (title: string, items: MatchSummary[], render: (match: MatchSummary) => React.ReactNode) =>
    items.length > 0 && (
      <section className="match-group">
        <h3>{title}</h3>
        <ul className="match-list">{items.map(render)}</ul>
      </section>
    );

  return (
    <section className="lobby">
      <header className="page-head">
        <h1>{t("lobby.title")}</h1>
        <p className="muted">{t("lobby.lead")}</p>
      </header>
      <div className="lobby-grid">
        {GAMES.map((game) => {
          const entry = CATALOG[game.id];
          if (!entry) return null;
          const Icon = entry.icon;
          const to = href(game.id);
          const resuming = entry.inProgress();
          return (
            <a key={game.id} className="game-card" href={to} onClick={(event) => follow(event, to)}>
              <span className="game-card-icon"><Icon size={34} aria-hidden="true" /></span>
              <span className="game-card-text">
                <strong>{t(entry.name)}</strong>
                <span className="muted">{t(entry.summary)}</span>
              </span>
              <span className="game-card-cta">{resuming ? t("lobby.continue") : t("lobby.play")}</span>
            </a>
          );
        })}
      </div>

      <section className="lobby-online" id={MATCHES_ANCHOR}>
        <header className="lobby-online-head">
          <h2>{t("lobby.online.title")}</h2>
          <Button variant="primary" onClick={() => setInviting(true)}>
            <UserPlus size={16} aria-hidden="true" /> {t("lobby.online.invite")}
          </Button>
        </header>
        {failed && <MessageBox tone="error" title={t("lobby.online.loadFailed")} />}
        {matches && list.length === 0 && !failed && <p className="muted">{t("lobby.online.empty")}</p>}
        {group(t("lobby.online.invitations"), received, (match) => row(
          match,
          t("lobby.online.from", { name: opponentOf(match).name }),
          <>
            <Button variant="primary" onClick={() => void answer(match, "accept")}>{t("lobby.online.accept")}</Button>
            <Button variant="secondary" onClick={() => void answer(match, "decline")}>{t("lobby.online.decline")}</Button>
          </>
        ))}
        {group(t("lobby.online.yourTurn"), mine, (match) => row(match, t("match.yourMove")))}
        {group(t("lobby.online.waiting"), [...theirs, ...sent], (match) => row(
          match,
          match.status === "invited" ? t("lobby.online.to", { name: opponentOf(match).name }) : t("match.theirMove", { name: opponentOf(match).name }),
          match.status === "invited"
            ? <Button variant="text" onClick={() => void answer(match, "cancel")}>{t("lobby.online.withdraw")}</Button>
            : undefined
        ))}
        {group(t("lobby.online.finished"), finished, (match) => row(match, resultOf(match)))}
      </section>

      <footer className="lobby-foot muted">
        {session.status === "ready" && t("lobby.version", { version: session.version })}
        {session.status === "ready" && session.stage && ` · ${stageLabel(session.stage, t)}`}
      </footer>

      {inviting && (
        <InviteDialog
          myId={myId}
          onClose={() => setInviting(false)}
          onSent={(match) => {
            setInviting(false);
            navigate(matchHref(match.game, match.id));
          }}
        />
      )}
    </section>
  );
}
