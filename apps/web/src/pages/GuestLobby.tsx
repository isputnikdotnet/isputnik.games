import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchMatches, type MatchSummary } from "../api";
import { follow, matchHref } from "../router";
import { useSession } from "../session";
import { MessageBox } from "../shared/MessageBox";
import { CATALOG } from "../games/catalog";

// What a guest sees instead of the lobby (docs/plan.md → Guests): the one
// match their link is for, and who they are playing. The server answers the
// match list with that match alone, so this draws whatever it gets.
export function GuestLobby() {
  const { t } = useTranslation();
  const session = useSession();
  const myId = session.status === "ready" ? session.user.id : "";
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMatches()
      .then((list) => { if (!cancelled) setMatches(list); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
    };
  }, []);

  const mySeat = (match: MatchSummary) => (match.players[0].id === myId ? 0 : 1);
  const opponentOf = (match: MatchSummary) => match.players[mySeat(match) === 0 ? 1 : 0];
  const host = matches?.[0] ? opponentOf(matches[0]).name : null;

  const line = (match: MatchSummary) => {
    const them = opponentOf(match).name;
    switch (match.status) {
      case "invited": return match.createdBy === myId ? t("match.invited", { name: them }) : t("lobby.online.from", { name: them });
      case "playing": return match.turn === mySeat(match) ? t("match.yourMove") : t("match.theirMove", { name: them });
      case "finished": return match.winner === null ? t("match.draw") : match.winner === mySeat(match) ? t("match.won") : t("match.lost", { name: them });
      case "declined": return t("match.declined", { name: them });
      case "cancelled": return t("match.cancelled");
    }
  };

  return (
    <section className="lobby">
      <header className="page-head">
        <h1>{t("guest.title")}</h1>
        <p className="muted">{host ? t("guest.lead", { name: host }) : t("guest.leadAlone")}</p>
      </header>
      {failed && <MessageBox tone="error" title={t("lobby.online.loadFailed")} />}
      {matches && matches.length === 0 && <p className="muted">{t("guest.empty")}</p>}
      {matches && matches.length > 0 && (
        <ul className="match-list">
          {matches.map((match) => {
            const to = matchHref(match.game, match.id);
            return (
              <li key={match.id} className="match-row">
                <a className="match-row-main" href={to} onClick={(event) => follow(event, to)}>
                  <strong>{t("lobby.online.vs", { name: opponentOf(match).name })}</strong>
                  <span className="match-row-game muted">{CATALOG[match.game] ? t(CATALOG[match.game].name) : match.game}</span>
                  <span className="muted">
                    {line(match)}
                    {match.score && ` · ${match.score[0]} : ${match.score[1]}`}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
