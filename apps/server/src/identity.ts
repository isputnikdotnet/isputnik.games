// Who is asking. This server never sees a password or a session cookie: the home
// server authenticates the browser and forwards the member's identity in headers,
// signed with a shared secret (docs/plan.md → The contract). Anything that arrives
// without the right secret is anonymous, whatever headers it carries.
import type { IncomingHttpHeaders } from "node:http";

export const GATEWAY_HEADER = "x-isputnik-gateway";
export const USER_ID_HEADER = "x-isputnik-user-id";
export const USER_NAME_HEADER = "x-isputnik-user-name";
export const USER_ROLE_HEADER = "x-isputnik-user-role";
export const USER_LANG_HEADER = "x-isputnik-user-lang";
export const USER_THEME_HEADER = "x-isputnik-user-theme";

export type Role = "admin" | "member";

export interface Identity {
  id: string;
  name: string;
  role: Role;
  /** Interface language the member chose in the home app ("en", "ru"). */
  lang: string;
  /** Theme the member chose in the home app, so the games wear the same one. */
  theme: string;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const LANG = /^[a-z]{2}(-[A-Za-z]{2})?$/;
const THEME = /^[a-z][a-z0-9-]{0,30}$/;

/**
 * The identity the gateway forwarded, or null when the request is not from the
 * gateway (no secret configured, wrong secret, or no user headers). A constant-
 * time comparison is not needed here — the secret is long and random, and the
 * comparison is one string against another — but the check is strict: an empty
 * configured secret never matches anything.
 */
export function identityFrom(headers: IncomingHttpHeaders, secret: string | null): Identity | null {
  if (!secret) return null;
  if (single(headers[GATEWAY_HEADER]) !== secret) return null;
  const id = single(headers[USER_ID_HEADER])?.trim();
  if (!id || id.length > 64) return null;
  const role = single(headers[USER_ROLE_HEADER]);
  if (role !== "admin" && role !== "member") return null;
  const name = decodeName(single(headers[USER_NAME_HEADER]) ?? "").trim().slice(0, 120) || id;
  const lang = single(headers[USER_LANG_HEADER])?.trim() ?? "";
  const theme = single(headers[USER_THEME_HEADER])?.trim() ?? "";
  return {
    id,
    name,
    role,
    lang: LANG.test(lang) ? lang : "en",
    theme: THEME.test(theme) ? theme : "minimalist"
  };
}

/** The developer identity a source checkout runs with when no secret is set. */
export function devIdentity(spec: string): Identity {
  const [id = "dev", name = "Developer", role = "admin", lang = "en", theme = "minimalist"] = spec.split(":");
  return {
    id,
    name,
    role: role === "member" ? "member" : "admin",
    lang: LANG.test(lang) ? lang : "en",
    theme: THEME.test(theme) ? theme : "minimalist"
  };
}
