import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, fetchMe, flushQueued, type Me, type MeResponse } from "./api";
import { isLanguage, setAppLanguage, storedLanguage } from "./i18n";
import { forgetMe, recallMe, rememberMe } from "./offline";
import { setOutboxOwner } from "./outbox";

// Who is signed in, as the home gateway told the server. Resolved at boot;
// the theme and language the member chose in the home app are applied here so
// the games wear the same clothes. "system" follows the device, as it does there.
//
// With no server to ask — no connection, or away from the house — the member
// last signed in on this device plays on as themselves, `offline`: the games
// against the computer and at one screen need nothing else. The server is asked
// again whenever there is a chance it answers, and what waited to be sent
// (outbox.ts) goes then.
export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "unavailable" }
  | { status: "ready"; user: Me; guests: boolean; version: string; stage: string | null; offline?: boolean };

/** Exported for tests, which provide a ready session without a server. */
export const SessionContext = createContext<SessionState>({ status: "loading" });

/** How long the first answer may take before a remembered member starts offline
 *  (a phone away from home is "connected", and the request just hangs). */
export const OFFLINE_START = { ms: 3000 };
/** How often the server is tried again while offline. */
export const OFFLINE_RETRY = { ms: 30_000 };

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

const ready = (me: MeResponse, offline: boolean): SessionState =>
  ({ status: "ready", user: me.user, guests: me.guests, version: me.version, stage: me.stage, offline });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const offline = session.status === "ready" && session.offline === true;

  /** The server answered: this is who is signed in, and it can be reached. */
  const online = useCallback((me: MeResponse) => {
    rememberMe(me);
    const member = me.user.role !== "guest";
    setOutboxOwner(member ? me.user.id : "");
    setSession(ready(me, false));
    if (member) void flushQueued().catch(() => undefined);
  }, []);

  /** No server: carry on as the member this device remembers. Answers whether there is one. */
  const startOffline = useCallback((): boolean => {
    const kept = recallMe();
    if (kept) setOutboxOwner(kept.user.id);
    setSession((current) => {
      if (current.status === "ready") return current.offline ? current : { ...current, offline: true };
      return kept ? ready(kept, true) : current;
    });
    return kept !== null;
  }, []);

  useEffect(() => {
    let live = true;
    let slow = 0;
    const ask = () => fetchMe().then((me) => {
      window.clearTimeout(slow);
      if (live) online(me);
    }, (err: unknown) => {
      window.clearTimeout(slow);
      if (!live) return;
      if (err instanceof ApiError && err.status === 401) {
        forgetMe();
        setSession({ status: "signed-out" });
      } else if (err instanceof ApiError && err.status < 500) {
        setSession({ status: "unavailable" });
      } else if (!startOffline()) {
        setSession((current) => (current.status === "ready" ? current : { status: "unavailable" }));
      }
    });

    void ask();
    slow = window.setTimeout(() => {
      if (live) startOffline();
    }, OFFLINE_START.ms);
    const onOffline = () => void startOffline();
    const onOnline = () => void ask();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      live = false;
      window.clearTimeout(slow);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [online, startOffline]);

  // Offline, the server is tried again: every so often, and when the app comes
  // back into view. The first answer puts the session back online.
  useEffect(() => {
    if (!offline) return;
    let live = true;
    const retry = () => {
      if (document.visibilityState !== "visible") return;
      fetchMe().then((me) => {
        if (live) online(me);
      }, (err: unknown) => {
        if (live && err instanceof ApiError && err.status === 401) {
          forgetMe();
          setSession({ status: "signed-out" });
        }
      });
    };
    const timer = window.setInterval(retry, OFFLINE_RETRY.ms);
    document.addEventListener("visibilitychange", retry);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [offline, online]);

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

/** True while the server cannot be reached and the member plays from the device. */
export function useOffline(): boolean {
  const session = useSession();
  return session.status === "ready" && session.offline === true;
}
