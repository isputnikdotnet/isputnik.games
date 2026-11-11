import type { MeResponse } from "./api";

// Playing with no connection. Two things let the app start without the server:
// the service worker (sw/worker.js) keeps the page and its code on the device,
// and this keeps who was last signed in, so the lobby opens as them. Guests are
// never remembered: a guest has one online match and nothing to play alone.

const REMEMBERED = "isputnik-games.me";

export function rememberMe(me: MeResponse): void {
  try {
    if (me.user.role === "guest") localStorage.removeItem(REMEMBERED);
    else localStorage.setItem(REMEMBERED, JSON.stringify(me));
  } catch {
    /* private mode */
  }
}

export function recallMe(): MeResponse | null {
  try {
    const me = JSON.parse(localStorage.getItem(REMEMBERED) ?? "null") as MeResponse | null;
    return me && typeof me.user?.id === "string" && typeof me.user.name === "string" ? me : null;
  } catch {
    return null;
  }
}

export function forgetMe(): void {
  try {
    localStorage.removeItem(REMEMBERED);
  } catch {
    /* private mode */
  }
}

/** Stores the games on the device. Built app only: the dev server's modules
 *  are not files a worker could keep. */
export function registerOfflineWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
