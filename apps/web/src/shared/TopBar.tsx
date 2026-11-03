import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Bookmark,
  ChevronDown,
  Clapperboard,
  Gamepad2,
  Headphones,
  Heart,
  HelpCircle,
  Image,
  Info,
  ListMusic,
  LogOut,
  Quote,
  Settings,
  Tag,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
  type LucideIcon
} from "lucide-react";
import { csrfToken } from "../api";
import { follow, href } from "../router";
import { Button } from "./Button";
import { useHomeNav, type HomeNav } from "./homeNav";
import { useWaiting } from "./MobileNav";

// The home app's top bar (isputnik.home app/OrbitTopBar.tsx), worn here so that
// going from a book to a game does not change the frame around it: the brand,
// Home · Media · Family, then the control panel and the person. Media reads as
// Games, the library you are in. Every link but Games leaves for the home app —
// a full navigation, it is another app on the same origin. Phones keep the bar
// to the brand, the sound switch and the person; their tab bar does the rest.

/** The home app's own addresses this bar links to. */
const HOME = {
  home: "/",
  family: "/family",
  stories: "/stories",
  control: "/control/overview",
  login: "/login",
  logout: "/api/auth/logout"
} as const;

interface MenuLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

function useDismiss(open: boolean, close: () => void, wrap: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, wrap]);
}

export function TopBar({
  name,
  admin,
  sound,
  onToggleSound
}: {
  name: string;
  admin: boolean;
  sound: boolean;
  onToggleSound: () => void;
}) {
  const { t } = useTranslation();
  const nav = useHomeNav();
  const familyHref = nav.sections.familyTree ? HOME.family : nav.sections.stories ? HOME.stories : null;

  return (
    <div className="topbar-row">
      <a className="topbar-brand" href={HOME.home} aria-label={t("top.brandHome")}>
        <img src={`${import.meta.env.BASE_URL}isputnik-app-icon.svg`} alt="" width={30} height={30} />
        <strong>iSputnik</strong>
      </a>

      <nav className="topbar-nav" aria-label={t("top.primary")}>
        <a className="topbar-link" href={HOME.home}>{t("top.home")}</a>
        <MediaMenu nav={nav} />
        {familyHref && <a className="topbar-link" href={familyHref}>{t("top.family")}</a>}
      </nav>

      <div className="topbar-end">
        {admin && (
          <a className="topbar-control" href={HOME.control} title={t("top.controlPanel")} aria-label={t("top.controlPanel")}>
            <Settings size={19} aria-hidden="true" />
            <span>{t("top.controlPanel")}</span>
          </a>
        )}
        <SoundSwitch sound={sound} onToggle={onToggleSound} />
        <UserMenu name={name} />
      </div>
    </div>
  );
}

export function SoundSwitch({ sound, onToggle }: { sound: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="icon"
      className="app-bar-sound"
      aria-label={sound ? t("app.soundOff") : t("app.soundOn")}
      title={sound ? t("app.soundOff") : t("app.soundOn")}
      onClick={onToggle}
    >
      {sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
    </Button>
  );
}

// The bar's Media button: it reads as Games, and opens the short list of the
// household's libraries, as it does in the home app.
function MediaMenu({ nav }: { nav: HomeNav }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const waiting = useWaiting();
  useDismiss(open, () => setOpen(false), wrap);

  const titles = (count: number | undefined) => (count === undefined ? null : t("top.titlesCount", { count }));
  const lobby = href();
  const links: (false | { key: string; label: string; to: string; icon: LucideIcon; sub: string | null; current?: boolean; badge?: number })[] = [
    nav.sections.audiobooks && { key: "audiobooks", label: t("top.audiobooks"), to: "/audiobooks", icon: Headphones, sub: titles(nav.counts.audiobooks) },
    nav.sections.ebooks && { key: "ebooks", label: t("top.ebooks"), to: "/ebooks", icon: BookOpen, sub: titles(nav.counts.ebooks) },
    nav.sections.gallery && { key: "photos", label: t("top.photos"), to: "/gallery", icon: Image, sub: nav.counts.photos === undefined ? null : t("top.photosCount", { count: nav.counts.photos }) },
    nav.video && { key: "video", label: t("top.video"), to: "/videos", icon: Clapperboard, sub: titles(nav.counts.video) },
    { key: "games", label: t("top.games"), to: lobby, icon: Gamepad2, sub: t("top.gamesSub"), current: true, badge: waiting }
  ];

  return (
    <div className="topbar-media" ref={wrap}>
      <Button
        variant="bare"
        className={`topbar-link topbar-media-button is-active${open ? " is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{t("top.games")}</span>
        {waiting > 0 && <span className="topbar-badge" title={t("nav.waiting", { count: waiting })}>{waiting}</span>}
        <ChevronDown size={16} aria-hidden="true" />
      </Button>
      {open && (
        <nav className="topbar-media-panel" aria-label={t("top.media")}>
          {links.map((link) => {
            if (!link) return null;
            const Icon = link.icon;
            return (
              <a
                key={link.key}
                className={`topbar-media-link${link.current ? " is-active" : ""}`}
                href={link.to}
                aria-current={link.current ? "page" : undefined}
                onClick={link.current ? (event) => { setOpen(false); follow(event, lobby); } : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="topbar-media-label">{link.label}</span>
                {link.badge ? <span className="topbar-badge">{link.badge}</span> : null}
                {link.sub && <small>{link.sub}</small>}
              </a>
            );
          })}
        </nav>
      )}
    </div>
  );
}

// The person's menu, the home app's: their own pages there, then signing out.
function UserMenu({ name }: { name: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), wrap);

  const links: MenuLink[] = [
    { label: t("top.profile"), href: "/profile", icon: UserRound },
    { label: t("top.forYou"), href: "/for-you", icon: UsersRound },
    { label: t("top.likes"), href: "/likes", icon: Heart },
    { label: t("top.bookmarks"), href: "/bookmarks", icon: Bookmark },
    { label: t("top.quotes"), href: "/quotes", icon: Quote },
    { label: t("top.collections"), href: "/collections", icon: ListMusic },
    { label: t("top.tags"), href: "/tags", icon: Tag },
    { label: t("top.info"), href: "/about", icon: Info },
    { label: t("top.help"), href: "/help", icon: HelpCircle }
  ];

  return (
    <div className="topbar-user" ref={wrap}>
      <Button variant="bare" className="topbar-user-button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        <span className="topbar-user-icon" aria-hidden="true">
          <UserRound size={18} />
        </span>
        <span className="topbar-user-name">{name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </Button>
      {open && (
        <div className="topbar-user-menu" role="menu" aria-label={t("top.profileMenu")}>
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <a key={link.href} className="topbar-menu-link" href={link.href} role="menuitem">
                <Icon size={19} aria-hidden="true" />
                <span>{link.label}</span>
              </a>
            );
          })}
          <Button variant="bare" className="topbar-menu-link" role="menuitem" onClick={() => void logout()}>
            <LogOut size={19} aria-hidden="true" />
            <span>{t("top.logout")}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Signs out of the home app, which is where the session lives, then goes to
 *  its sign-in page. A failure still goes there: it asks again if need be. */
async function logout(): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = csrfToken();
  if (token) headers["X-CSRF-Token"] = token;
  await fetch(HOME.logout, { method: "POST", headers, body: "{}", credentials: "same-origin" }).catch(() => undefined);
  window.location.assign(HOME.login);
}

