import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, Globe, UserPlus, Users, type LucideIcon } from "lucide-react";
import { GAMES } from "@isputnik/games-engine";
import { answerMatch, fetchMatches, fetchStats, type FamilyStats, type MatchSummary } from "../api";
import { follow, href, matchHref, navigate } from "../router";
import { useSession } from "../session";
import { ago } from "../shared/ago";
import { Avatar } from "../shared/Avatar";
import { Button } from "../shared/Button";
import { MessageBox } from "../shared/MessageBox";
import { useNewcomerCue } from "../shared/useGameSounds";
import { CATALOG, isNew, type GameMode } from "../games/catalog";
import { GamePreview } from "../games/previews";
import { InviteDialog } from "./InviteDialog";
import { Leaderboard, YourMonth } from "./LobbyStats";
import { MATCHES_ANCHOR } from "../shared/MobileNav";
import { scoreText } from "../shared/score";

/** "alpha" / "beta" in the interface language; anything else as the server says it. */
function stageLabel(stage: string, t: (key: "lobby.stageAlpha" | "lobby.stageBeta") => string): string {
  if (stage === "alpha") return t("lobby.stageAlpha");
  if (stage === "beta") return t("lobby.stageBeta");
  return stage;
}

const MODE_ICONS: Record<GameMode, LucideIcon> = { computer: Cpu, local: Users, online: Globe };

/** How many finished matches the lobby lists. */
const RECENT = 5;

/** Midnight on the 1st where the reader is: where their "this month" begins. */
function localMonthStart(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// The lobby, in the order a member needs it: what waits on them (an
// invitation to answer, a match where it is their move), then the games to
// start, then how the last ones went. Each game card says at a glance what is
// going on in it — your move online, a game under way on this device.
export function LobbyPage() {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const myId = session.status === "ready" ? session.user.id : "";
  const myName = session.status === "ready" ? session.user.name : "";
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [inviting, setInviting] = useState<{ game?: string } | null>(null);
  const [stats, setStats] = useState<FamilyStats | null>(null);

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

  // The results change only when a match ends: they are fetched once the list
  // is in, and again when a match in it has finished since — not with every poll.
  // If they fail, the panels wait and the rest of the lobby stands.
  const finishedKey = matches ? matches.filter((m) => m.status === "finished").map((m) => m.id).join(",") : null;
  useEffect(() => {
    if (finishedKey === null) return;
    let current = true;
    fetchStats(localMonthStart()).then((next) => { if (current) setStats(next); }, () => undefined);
    return () => {
      current = false;
    };
  }, [finishedKey]);

  const answer = async (match: MatchSummary, what: "accept" | "decline") => {
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
  const gameName = (game: string) => (CATALOG[game] ? t(CATALOG[game].name) : game);
  const when = (iso: string) => ago(iso, i18n.language);
  const scoreOf = (match: MatchSummary) => scoreText(match, t);

  const list = matches ?? [];
  const received = list.filter((m) => m.status === "invited" && m.createdBy !== myId);
  const sent = list.filter((m) => m.status === "invited" && m.createdBy === myId);
  const mine = list.filter((m) => m.status === "playing" && m.turn === mySeat(m));
  useNewcomerCue(matches && received.map((m) => m.id), "invite");
  useNewcomerCue(matches && mine.map((m) => m.id), "yourMove");
  const theirs = list.filter((m) => m.status === "playing" && m.turn !== mySeat(m));
  const finished = list.filter((m) => m.status === "finished").slice(0, RECENT);
  const waiting = received.length + mine.length;

  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? "lobby.greeting.morning" : hour >= 12 && hour < 18 ? "lobby.greeting.afternoon" : "lobby.greeting.evening";

  const resultOf = (match: MatchSummary): { text: string; tone: "won" | "lost" | "draw" } => {
    if (match.winner === null) return { text: t("match.draw"), tone: "draw" };
    return match.winner === mySeat(match)
      ? { text: t("match.won"), tone: "won" }
      : { text: t("match.lost", { name: opponentOf(match).name }), tone: "lost" };
  };

  const link = (to: string, className: string, children: React.ReactNode) => (
    <a className={className} href={to} onClick={(event) => follow(event, to)}>{children}</a>
  );

  return (
    <section className="lobby">
      <header className="lobby-head">
        <div className="page-head">
          <h1>{t("lobby.title")}</h1>
          <p className="muted">
            {myName && `${t(greeting, { name: myName })} `}
            {waiting > 0 ? t("lobby.waitingCount", { count: waiting }) : t("lobby.lead")}
          </p>
        </div>
        <Button variant="primary" onClick={() => setInviting({})}>
          <UserPlus size={16} aria-hidden="true" /> {t("lobby.online.invite")}
        </Button>
      </header>

      <div className="lobby-body">
        <div className="lobby-main">
          <section className="lobby-waiting" id={MATCHES_ANCHOR} aria-labelledby="lobby-waiting-title">
            <h2 id="lobby-waiting-title" className="lobby-section-title">
              {t("lobby.waiting.title")}
              {waiting > 0 && <span className="lobby-count">{waiting}</span>}
            </h2>
            {failed && <MessageBox tone="error" title={t("lobby.online.loadFailed")} />}
            {matches && waiting === 0 && !failed && (
              <p className="muted">{list.length === 0 ? t("lobby.online.empty") : t("lobby.waiting.none")}</p>
            )}
            {waiting > 0 && (
              <ul className="waiting-list">
                {received.map((match) => (
                  <li key={match.id} className="waiting-card">
                    <Avatar id={opponentOf(match).id} name={opponentOf(match).name} />
                    {link(matchHref(match.game, match.id), "waiting-card-main", (
                      <>
                        <span className="waiting-card-kind">
                          <span className="lobby-pill is-invite">{t("lobby.pill.invitation")}</span> {gameName(match.game)}
                        </span>
                        <strong>{t("lobby.online.from", { name: opponentOf(match).name })}</strong>
                        <span className="muted">{when(match.createdAt)}</span>
                      </>
                    ))}
                    <span className="waiting-card-actions">
                      <Button variant="primary" onClick={() => void answer(match, "accept")}>{t("lobby.online.accept")}</Button>
                      <Button variant="secondary" onClick={() => void answer(match, "decline")}>{t("lobby.online.decline")}</Button>
                    </span>
                  </li>
                ))}
                {mine.map((match) => (
                  <li key={match.id} className="waiting-card">
                    <Avatar id={opponentOf(match).id} name={opponentOf(match).name} />
                    {link(matchHref(match.game, match.id), "waiting-card-main", (
                      <>
                        <span className="waiting-card-kind">
                          <span className="lobby-pill is-move">{t("lobby.pill.yourMove", { count: 1 })}</span> {gameName(match.game)}
                        </span>
                        <strong>{t("lobby.online.vs", { name: opponentOf(match).name })}</strong>
                        <span className="muted">{[scoreOf(match), when(match.updatedAt)].filter(Boolean).join(" · ")}</span>
                      </>
                    ))}
                    <span className="waiting-card-actions">
                      {link(matchHref(match.game, match.id), "primary-button", t("lobby.play"))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {theirs.length + sent.length > 0 && (
              <p className="lobby-theirs muted">
                {t("lobby.waiting.theirs")}{" "}
                {[...theirs, ...sent].map((match, index) => (
                  <span key={match.id}>
                    {index > 0 && " · "}
                    {link(matchHref(match.game, match.id), "lobby-theirs-link", match.status === "invited"
                      ? t("lobby.waiting.sent", { game: gameName(match.game), name: opponentOf(match).name })
                      : t("lobby.waiting.vs", { game: gameName(match.game), name: opponentOf(match).name }))}
                  </span>
                ))}
              </p>
            )}
          </section>

          <section className="lobby-games" aria-labelledby="lobby-games-title">
            <div className="lobby-games-head">
              <h2 id="lobby-games-title" className="lobby-section-title">{t("lobby.games.title")}</h2>
              <p className="muted">{t("lobby.games.lead")}</p>
            </div>
            <div className="lobby-grid">
              {GAMES.map((game) => {
                const entry = CATALOG[game.id];
                if (!entry) return null;
                const to = href(game.id);
                const resuming = entry.inProgress();
                const myMoves = mine.filter((m) => m.game === game.id).length;
                const pills = (
                  <>
                    {myMoves > 0 && <span className="lobby-pill is-move">{t("lobby.pill.yourMove", { count: myMoves })}</span>}
                    {resuming && <span className="lobby-pill is-progress">{t("lobby.pill.inProgress")}</span>}
                  </>
                );
                return (
                  <article key={game.id} className="game-card">
                    {/* The states sit on the picture; on a phone, where the picture
                        is a thumbnail, beside the name instead (the CSS picks one). */}
                    <div className="game-card-art">
                      <GamePreview game={game.id} />
                      <span className="game-card-pills">{pills}</span>
                      {isNew(entry) && <span className="lobby-pill is-new game-card-new">{t("lobby.pill.new")}</span>}
                    </div>
                    <div className="game-card-body">
                      <div className="game-card-title">
                        <h3>{t(entry.name)}</h3>
                        <span className="game-card-pills-inline">
                          {pills}
                          {isNew(entry) && <span className="lobby-pill is-new">{t("lobby.pill.new")}</span>}
                        </span>
                      </div>
                      <p className="muted">{t(entry.summary)}</p>
                      <ul className="game-card-modes" aria-label={t("lobby.games.modes")}>
                        {entry.modes.map((mode) => {
                          const Icon = MODE_ICONS[mode];
                          return <li key={mode} className="lobby-tag"><Icon size={11} aria-hidden="true" /> {t(`lobby.modes.${mode}`)}</li>;
                        })}
                      </ul>
                      <div className="game-card-actions">
                        {link(to, "primary-button game-card-play", resuming ? t("lobby.continue") : t("lobby.play"))}
                        {entry.modes.includes("online") && <Button variant="secondary" onClick={() => setInviting({ game: game.id })}>{t("lobby.games.invite")}</Button>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {finished.length > 0 && (
            <section className="lobby-recent" aria-labelledby="lobby-recent-title">
              <h2 id="lobby-recent-title" className="lobby-section-title">{t("lobby.recent.title")}</h2>
              <ul className="recent-list">
                {finished.map((match) => {
                  const result = resultOf(match);
                  return (
                    <li key={match.id}>
                      {link(matchHref(match.game, match.id), "recent-row", (
                        <>
                          <Avatar id={opponentOf(match).id} name={opponentOf(match).name} size={32} />
                          <span className="recent-row-main">
                            <span>{t("lobby.waiting.vs", { game: gameName(match.game), name: opponentOf(match).name })}</span>
                            <span className="muted">{[when(match.finishedAt ?? match.updatedAt), scoreOf(match)].filter(Boolean).join(" · ")}</span>
                          </span>
                          <strong className={`recent-result is-${result.tone}`}>{result.text}</strong>
                        </>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        {/* The family's results beside it all; below it on a narrow screen. */}
        <aside className="lobby-side">
          <Leaderboard stats={stats} myId={myId} />
          <YourMonth stats={stats} myId={myId} myName={myName} />
        </aside>
      </div>

      <footer className="lobby-foot muted">
        {session.status === "ready" && t("lobby.version", { version: session.version })}
        {session.status === "ready" && session.stage && ` · ${stageLabel(session.stage, t)}`}
      </footer>

      {inviting && (
        <InviteDialog
          myId={myId}
          game={inviting.game}
          onClose={() => setInviting(null)}
          onSent={(match) => {
            setInviting(null);
            navigate(matchHref(match.game, match.id));
          }}
        />
      )}
    </section>
  );
}
