import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { follow, href } from "../router";
import { useSession } from "../session";

// The one frame every page sits in: the way back to the home app (a full
// navigation — it is another app on the same origin), the brand, and who is
// playing. Pages carry their own headings.
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();
  return (
    <div className="app-shell">
      <header className="app-bar">
        <a className="app-bar-back" href="/">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>{t("app.backHome")}</span>
        </a>
        <a className="app-bar-brand" href={href()} onClick={(event) => follow(event, href())}>
          {t("app.title")}
        </a>
        <span className="app-bar-user">{session.status === "ready" ? session.user.name : ""}</span>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
