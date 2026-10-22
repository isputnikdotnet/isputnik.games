import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, fetchMe, type Me } from "./api";
import { isLanguage, setAppLanguage, storedLanguage } from "./i18n";

// Who is signed in, as the home gateway told the server. Resolved once at boot;
// the theme and language the member chose in the home app are applied here so
// the games wear the same clothes. "system" follows the device, as it does there.
export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "unavailable" }
  | { status: "ready"; user: Me; version: string };

/** Exported for tests, which provide a ready session without a server. */
export const SessionContext = createContext<SessionState>({ status: "loading" });

function applyTheme(theme: string): () => void {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    document.documentElement.dataset.theme =
      theme === "system" ? (mediaQuery.matches ? "plain-dark" : "plain-light") : theme;
  };
  apply();
  mediaQuery.addEventListener("change", apply);
  return () => mediaQuery.removeEventListener("change", apply);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        setSession({ status: "ready", user: me.user, version: me.version });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSession({ status: err instanceof ApiError && err.status === 401 ? "signed-out" : "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const theme = session.status === "ready" ? session.user.theme : null;
  const lang = session.status === "ready" ? session.user.lang : null;

  useEffect(() => {
    if (!theme) return;
    return applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    // The home app's own stored choice wins (same device, same origin); the
    // gateway's header covers a first visit on a device the home app never ran on.
    if (!lang || storedLanguage()) return;
    if (isLanguage(lang)) void setAppLanguage(lang);
  }, [lang]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
