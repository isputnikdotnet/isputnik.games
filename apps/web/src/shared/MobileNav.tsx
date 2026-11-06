import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  BookText,
  Bookmark,
  ChevronRight,
  Clapperboard,
  DownloadCloud,
  Gamepad2,
  Headphones,
  Heart,
  House,
  Image,
  Library,
  ListMusic,
  LogOut,
  Network,
  Quote,
  Settings,
  Tag,
  UserRound,
  UsersRound
} from "lucide-react";
import { fetchSummary } from "../api";
import { follow, href } from "../router";
import { useSession } from "../session";
import { Button } from "./Button";
import { HOME, aboutLinks, logout } from "./homeLinks";
import { useHomeNav } from "./homeNav";

// The bottom tab bar for phones and the installed app — the home app's own
// (isputnik.home app/DashboardShell.tsx MobileNav): Home, Media, Offline and
// Profile, so going from a book or a film to a game keeps the same four tabs.
// Media is lit here, the games being one of its libraries; it and Profile each
// open home's drop-up sheet. Every link but Games leaves for the home app — a
// full navigation, it is another app on the same origin. What waits on you in
// the games rides on the Media tab and the sheet's Games tile. The stylesheet
// shows it only at phone widths; above them the top bar does the job.
const REFRESH_MS = 60_000;

/** The lobby's section of matches and invitations, a link target. */
export const MATCHES_ANCHOR = "online";

type Sheet = "media" | "profile";

export function MobileNav() {
  const { t } = useTranslation();
  const session = useSession();
  const admin = session.status === "ready" && session.user.role === "admin";
  const nav = useHomeNav();
  const waiting = useWaiting();
  const [openSheet, setOpenSheet] = useState<Sheet | null>(null);
  const lobby = href();

  useEffect(() => {
    if (!openSheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSheet]);

  const close = () => setOpenSheet(null);
  const toggle = (sheet: Sheet) => setOpenSheet((current) => (current === sheet ? null : sheet));
  // While a sheet is open it is the only lit tab, as in the home app.
  const lit = (tab: Sheet) => (openSheet ? openSheet === tab : tab === "media");

  const libraries = [
    nav.sections.audiobooks && { key: "audiobooks", label: t("top.audiobooks"), to: "/audiobooks", icon: Headphones },
    nav.sections.ebooks && { key: "ebooks", label: t("top.ebooks"), to: "/ebooks", icon: BookOpen },
    nav.sections.gallery && { key: "gallery", label: t("nav.gallery"), to: "/gallery", icon: Image },
    nav.video && { key: "video", label: t("top.video"), to: "/videos", icon: Clapperboard },
    nav.sections.familyTree && { key: "family", label: t("nav.familyTree"), to: HOME.family, icon: Network },
    nav.sections.stories && { key: "stories", label: t("top.stories"), to: HOME.stories, icon: BookText },
    { key: "tags", label: t("top.tags"), to: HOME.tags, icon: Tag }
  ];

  const keeps = [
    { label: t("top.likes"), to: "/likes", icon: Heart },
    { label: t("top.bookmarks"), to: "/bookmarks", icon: Bookmark },
    { label: t("top.quotes"), to: "/quotes", icon: Quote },
    { label: t("top.collections"), to: "/collections", icon: ListMusic }
  ];

  return (
    <>
      {openSheet && <div className="mobile-sheet-backdrop" onClick={close} aria-hidden="true" />}
      {openSheet === "media" && (
        <div className="mobile-sheet" role="dialog" aria-label={t("nav.chooseLibrary")}>
          <span className="mobile-sheet-handle" aria-hidden="true" />
          <div className="mobile-sheet-grid">
            {libraries.map((link) => {
              if (!link) return null;
              const Icon = link.icon;
              return (
                <a key={link.key} className="mobile-sheet-tile" href={link.to}>
                  <Icon size={26} aria-hidden="true" />
                  <span>{link.label}</span>
                </a>
              );
            })}
            <a
              className="mobile-sheet-tile is-active"
              href={lobby}
              aria-current="page"
              onClick={(event) => {
                close();
                follow(event, lobby);
              }}
            >
              <Gamepad2 size={26} aria-hidden="true" />
              <span>{t("top.games")}</span>
              {waiting > 0 && (
                <span className="mobile-sheet-tile-badge" title={t("nav.waiting", { count: waiting })}>
                  {waiting}
                </span>
              )}
            </a>
          </div>
        </div>
      )}
      {openSheet === "profile" && (
        <div className="mobile-sheet" role="dialog" aria-label={t("nav.account")}>
          <span className="mobile-sheet-handle" aria-hidden="true" />
          <div className="mobile-sheet-grid">
            {keeps.map(({ label, to, icon: Icon }) => (
              <a key={to} className="mobile-sheet-tile" href={to}>
                <Icon size={26} aria-hidden="true" />
                <span>{label}</span>
              </a>
            ))}
          </div>
          <div className="mobile-sheet-list">
            <a className="mobile-sheet-row" href="/for-you">
              <UsersRound size={19} aria-hidden="true" />
              <span>{t("top.forYou")}</span>
              <ChevronRight size={16} className="mobile-sheet-chevron" aria-hidden="true" />
            </a>
            <a className="mobile-sheet-row" href="/profile">
              <UserRound size={19} aria-hidden="true" />
              <span>{t("top.profile")}</span>
              <ChevronRight size={16} className="mobile-sheet-chevron" aria-hidden="true" />
            </a>
            {admin && (
              <a className="mobile-sheet-row" href={HOME.control}>
                <Settings size={19} aria-hidden="true" />
                <span>{t("top.controlPanel")}</span>
                <ChevronRight size={16} className="mobile-sheet-chevron" aria-hidden="true" />
              </a>
            )}
            <Button
              variant="bare"
              className="mobile-sheet-row"
              onClick={() => {
                close();
                void logout();
              }}
            >
              <LogOut size={19} aria-hidden="true" />
              <span>{t("top.logout")}</span>
            </Button>
          </div>
          <div className="mobile-sheet-footer">
            {aboutLinks(t).map((link) => (
              <a key={link.href} href={link.href} {...(link.external ? { target: "_blank", rel: "noreferrer", onClick: close } : {})}>
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
      <nav className="mobile-nav" aria-label={t("nav.aria")}>
        <a className="mobile-nav-item" href={HOME.home}>
          <House size={20} aria-hidden="true" />
          <span>{t("nav.home")}</span>
        </a>
        <Button
          variant="bare"
          className={`mobile-nav-item${lit("media") ? " is-active" : ""}`}
          onClick={() => toggle("media")}
          aria-haspopup="dialog"
          aria-expanded={openSheet === "media"}
        >
          <span className="mobile-nav-icon">
            <Library size={20} aria-hidden="true" />
            {waiting > 0 && (
              <span className="mobile-nav-badge" aria-label={t("nav.waiting", { count: waiting })}>
                {waiting}
              </span>
            )}
          </span>
          <span>{t("top.media")}</span>
        </Button>
        <a className="mobile-nav-item" href="/downloads">
          <DownloadCloud size={20} aria-hidden="true" />
          <span>{t("nav.offline")}</span>
        </a>
        <Button
          variant="bare"
          className={`mobile-nav-item${lit("profile") ? " is-active" : ""}`}
          onClick={() => toggle("profile")}
          aria-haspopup="dialog"
          aria-expanded={openSheet === "profile"}
        >
          <UserRound size={20} aria-hidden="true" />
          <span>{t("top.profile")}</span>
        </Button>
      </nav>
    </>
  );
}

/** Invitations to answer plus matches where it is your move, kept fresh the
 *  way the home app keeps its Games count: on load, on focus, once a minute. */
export function useWaiting(): number {
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
