import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dices, House, Swords } from "lucide-react";
import { fetchSummary } from "../api";
import { follow, href, useRoute } from "../router";

// The bottom tab bar for phones and the installed app, the way the home app
// has one: Home (back to iSputnik, a full navigation — it is another app on
// the same origin), Games (the lobby) and Matches (the lobby's online
// section, with how many things wait on you). The stylesheet shows it only
// at phone widths; above them the top bar's links do the same job.
const REFRESH_MS = 60_000;

export const MATCHES_ANCHOR = "online";

export function MobileNav() {
  const { t } = useTranslation();
  const route = useRoute();
  const waiting = useWaiting();
  const onLobby = route.name === "lobby";
  const inMatch = route.name === "match";
  const lobby = href();
  const matches = `${lobby}#${MATCHES_ANCHOR}`;

  return (
    <nav className="mobile-nav" aria-label={t("nav.aria")}>
      <a className="mobile-nav-item" href="/">
        <House size={22} aria-hidden="true" />
        <span>{t("nav.home")}</span>
      </a>
      <a className={`mobile-nav-item${onLobby || route.name === "game" ? " is-active" : ""}`} href={lobby} onClick={(event) => follow(event, lobby)}>
        <Dices size={22} aria-hidden="true" />
        <span>{t("nav.games")}</span>
      </a>
      <a className={`mobile-nav-item${inMatch ? " is-active" : ""}`} href={matches} onClick={(event) => follow(event, matches)}>
        <span className="mobile-nav-icon">
          <Swords size={22} aria-hidden="true" />
          {waiting > 0 && <span className="mobile-nav-badge" aria-label={t("nav.waiting", { count: waiting })}>{waiting}</span>}
        </span>
        <span>{t("nav.matches")}</span>
      </a>
    </nav>
  );
}

/** Invitations to answer plus matches where it is your move, kept fresh the
 *  way the home app keeps its Games count: on load, on focus, once a minute. */
function useWaiting(): number {
  const [waiting, setWaiting] = useState(0);
  const load = useCallback(async () => {
    try {
      const summary = await fetchSummary();
      setWaiting(summary.counts.invitations + summary.counts.yourMove);
    } catch {
      /* the bar shows no count rather than an error */
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
  return waiting;
}
