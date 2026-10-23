import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { follow, href } from "../router";
import { useSession } from "../session";
import { Button } from "./Button";
import { MobileNav } from "./MobileNav";
import { play, setSoundEnabled, useSoundEnabled } from "./sound";

// The one frame every page sits in: the way back to the home app (a full
// navigation — it is another app on the same origin), the brand, and who is
// playing. Pages carry their own headings. A guest (docs/plan.md → Guests) has
// no home app to go back to and no tabs to switch between: the frame says who
// they are and leaves it at that. The sound switch sits at the far end for
// everyone, a guest included.
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();
  const guest = session.status === "ready" && session.user.role === "guest";
  const sound = useSoundEnabled();
  const toggleSound = () => {
    setSoundEnabled(!sound);
    // Turning it on answers with a blip, so the player hears that it worked.
    if (!sound) play("message");
  };
  return (
    <div className="app-shell">
      <header className="app-bar">
        {guest ? (
          <span className="app-bar-back is-placeholder" aria-hidden="true" />
        ) : (
          <a className="app-bar-back" href="/">
            <ArrowLeft size={18} aria-hidden="true" />
            <span>{t("app.backHome")}</span>
          </a>
        )}
        <a className="app-bar-brand" href={href()} onClick={(event) => follow(event, href())}>
          {t("app.title")}
        </a>
        <span className="app-bar-end">
          <span className="app-bar-user">
            {session.status === "ready" ? (guest ? t("app.guestUser", { name: session.user.name }) : session.user.name) : ""}
          </span>
          <Button
            variant="icon"
            className="app-bar-sound"
            aria-label={sound ? t("app.soundOff") : t("app.soundOn")}
            title={sound ? t("app.soundOff") : t("app.soundOn")}
            onClick={toggleSound}
          >
            {sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
          </Button>
        </span>
      </header>
      <main className="app-main">{children}</main>
      {session.status === "ready" && !guest && <MobileNav />}
    </div>
  );
}
