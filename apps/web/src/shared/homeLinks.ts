import type { TFunction } from "i18next";
import { csrfToken } from "../api";

// The home app's own addresses the top bar and the phone tab bar link to —
// another app on the same origin, so every one of them is a full navigation.
export const HOME = {
  home: "/",
  family: "/family",
  stories: "/stories",
  tags: "/tags",
  control: "/control/overview",
  login: "/login",
  logout: "/api/auth/logout"
} as const;

/** Where the home app takes bug reports (its About links' Bugs). */
export const BUGS_URL = "https://github.com/isputnikdotnet/isputnik.home/issues/new";

export interface AboutLink {
  key: "info" | "help" | "bugs";
  label: string;
  href: string;
  external?: boolean;
}

/** The quiet About links the home app ends its person's menu and phone
 *  Profile sheet with. */
export function aboutLinks(t: TFunction): AboutLink[] {
  return [
    { key: "info", label: t("top.info"), href: "/about" },
    { key: "help", label: t("top.help"), href: "/help" },
    { key: "bugs", label: t("top.bugs"), href: BUGS_URL, external: true }
  ];
}

/** Signs out of the home app, which is where the session lives, then goes to
 *  its sign-in page. A failure still goes there: it asks again if need be. */
export async function logout(): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = csrfToken();
  if (token) headers["X-CSRF-Token"] = token;
  await fetch(HOME.logout, { method: "POST", headers, body: "{}", credentials: "same-origin" }).catch(() => undefined);
  window.location.assign(HOME.login);
}
