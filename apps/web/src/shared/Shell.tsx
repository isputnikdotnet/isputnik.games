import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../session";
import { MobileNav } from "./MobileNav";
import { SoundToggle } from "./SoundToggle";
import { TopBar } from "./TopBar";
import { play, setSoundEnabled, useSoundEnabled } from "./sound";

// The one frame every page sits in: the home app's top bar (shared/TopBar), so
// the games read as one more section of iSputnik. Pages carry their own
// headings. On a phone a member gets the home app's frame there instead: no top
// bar, its four-tab bar (shared/MobileNav) at the foot, and the sound switch on
// the page (shared/SoundToggle). A guest (docs/plan.md → Guests) has no home app to go to: the frame
// says who they are and leaves it at that. The sound switch is in the bar for
// everyone, a guest included.
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();
  const ready = session.status === "ready";
  const guest = ready && session.user.role === "guest";
  const sound = useSoundEnabled();
  const bar = useBarHeight();
  const toggleSound = () => {
    setSoundEnabled(!sound);
    // Turning it on answers with a blip, so the player hears that it worked.
    if (!sound) play("message");
  };
  return (
    <div className="app-shell">
      <header className={`app-bar${ready && !guest ? " is-member" : ""}`} ref={bar}>
        {ready && !guest ? (
          <TopBar name={session.user.name} admin={session.user.role === "admin"} sound={sound} onToggleSound={toggleSound} />
        ) : (
          <div className="topbar-row">
            <span className="topbar-brand">
              <img src={`${import.meta.env.BASE_URL}isputnik-app-icon.svg`} alt="" width={30} height={30} />
              <strong>{t("app.title")}</strong>
            </span>
            <span className="topbar-end">
              <span className="app-bar-user">{guest ? t("app.guestUser", { name: session.user.name }) : ""}</span>
              <SoundToggle />
            </span>
          </div>
        )}
      </header>
      <main className="app-main">{children}</main>
      {ready && !guest && <MobileNav />}
    </div>
  );
}

/** Publishes the app bar's height as --app-bar-h on the document, so a game
 *  stage can size its board to the rest of the window exactly. */
function useBarHeight() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() => root.setProperty("--app-bar-h", `${node.offsetHeight}px`));
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.removeProperty("--app-bar-h");
    };
  }, []);
  return ref;
}
