// The games API, under the same /games prefix the pages live at. The home gateway
// authenticates every call; this module only needs to echo its CSRF token on
// state-changing requests (phase 2), the way the home SPA does.
export const API_BASE = "/games/api";

export interface Me {
  id: string;
  name: string;
  role: "admin" | "member";
  lang: string;
  theme: string;
}

export interface MeResponse {
  user: Me;
  games: string[];
  version: string;
  stage: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** The home app's double-submit CSRF cookie, on HTTPS under the __Host- prefix. */
export function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)(?:__Host-)?isputnik_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "same-origin" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me");
}
