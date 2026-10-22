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
/** The browser's address as the gateway saw it, so a log line here names the
 *  person's machine rather than the home container. */
export const CLIENT_IP_HEADER = "x-isputnik-client-ip";
/** The home server's id for the same request, so its log line and this one match up. */
export const REQUEST_ID_HEADER = "x-isputnik-request-id";

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

export function single(value: string | string[] | undefined): string | undefined {
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

/** Whether this request carries the gateway's secret — the one check behind
 *  every header the gateway is trusted for. */
export function fromGateway(headers: IncomingHttpHeaders, secret: string | null): boolean {
  return Boolean(secret) && single(headers[GATEWAY_HEADER]) === secret;
}

/** Why a request was refused, for the event the refusal leaves behind. The
 *  secret itself, right or wrong, never appears in it. */
export function rejectionReason(headers: IncomingHttpHeaders, secret: string | null): string {
  if (!secret) return "no gateway secret is configured";
  const sent = single(headers[GATEWAY_HEADER]);
  if (sent === undefined) return "no gateway header";
  if (sent !== secret) return "wrong gateway secret";
  return "gateway headers without a valid identity";
}

const IP = /^[0-9a-fA-F.:]{1,45}$/;

/** The address to log for a request: the browser's, as the gateway forwarded
 *  it, when the request really is the gateway's; else the socket's. */
export function clientIpFrom(headers: IncomingHttpHeaders, secret: string | null, socketAddress: string | undefined): string {
  if (fromGateway(headers, secret)) {
    const forwarded = single(headers[CLIENT_IP_HEADER])?.trim();
    if (forwarded && IP.test(forwarded)) return forwarded;
  }
  return socketAddress ?? "";
}

/** The request id to log: the gateway's for its own requests (bounded, plain
 *  characters), so the two servers' lines for one request share it. */
export function forwardedRequestId(headers: IncomingHttpHeaders, secret: string | null): string | undefined {
  if (!fromGateway(headers, secret)) return undefined;
  const id = single(headers[REQUEST_ID_HEADER])?.trim();
  return id && /^[A-Za-z0-9._-]{1,64}$/.test(id) ? id : undefined;
}

/** The shortest secret the image accepts; `openssl rand -hex 32` gives 64. */
export const SECRET_MIN_LENGTH = 32;

/** Why the configured secret is not acceptable, or null when it is. Production
 *  only: a source checkout runs with any secret, or none (the developer identity). */
export function checkSecret(secret: string | null, production: boolean): string | null {
  if (!production) return null;
  if (!secret) {
    return "GATEWAY_SECRET is not set. The games server only answers requests forwarded by isputnik.home, which signs them with this secret. See docs/plan.md.";
  }
  if (/change-me/i.test(secret)) {
    return "GATEWAY_SECRET is still the example placeholder. Generate one (openssl rand -hex 32) and set the same value on the isputnik container as GAMES_GATEWAY_SECRET.";
  }
  if (secret.length < SECRET_MIN_LENGTH) {
    return `GATEWAY_SECRET is too short (${secret.length} characters): use at least ${SECRET_MIN_LENGTH}, for example from openssl rand -hex 32, and set the same value on the isputnik container.`;
  }
  return null;
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
