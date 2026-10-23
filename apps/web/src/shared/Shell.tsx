import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { follow, href } from "../router";
import { useSession } from "../session";
import { MobileNav } from "./MobileNav";

// The one frame every page sits in: the way back to the home app (a full
// navigation — it is another app on the same origin), the brand, and who is
// playing. Pages carry their own headings. A guest (docs/plan.md → Guests) has
// no home app to go back to and no tabs to switch between: the frame says who
// they are and leaves it at that.
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();
  const guest = session.status === "ready" && session.user.role === "guest";
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
        <span className="app-bar-user">
          {session.status === "ready" ? (guest ? t("app.guestUser", { name: session.user.name }) : session.user.name) : ""}
        </span>
      </header>
      <main className="app-main">{children}</main>
      {session.status === "ready" && !guest && <MobileNav />}
    </div>
  );
}
