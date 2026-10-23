// The games API, under the same /games prefix the pages live at. The home gateway
// authenticates every call; this module only needs to echo its CSRF token on
// state-changing requests, the way the home SPA does.
import type { GameEvent, GameStatus, PlayerIndex } from "@isputnik/games-engine";

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

export interface Member {
  id: string;
  name: string;
}

export type MatchStatus = "invited" | "playing" | "finished" | "declined" | "cancelled";

export interface MatchSummary {
  id: string;
  game: string;
  options: unknown;
  status: MatchStatus;
  players: [Member, Member];
  createdBy: string;
  moveCount: number;
  turn: PlayerIndex | null;
  winner: PlayerIndex | null;
  finishReason: string | null;
  score: [number, number] | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface MatchMessage {
  id: number;
  by: PlayerIndex;
  text: string;
  afterMove: number;
  at: string;
}

export interface MatchDetail<S extends { status: GameStatus } = { status: GameStatus }> extends MatchSummary {
  state: S;
  /** What every move did, in order, for the Comms panel. */
  feed: GameEvent[];
  messages: MatchMessage[];
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

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers, credentials: "same-origin" });
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
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    throw new ApiError(res.status, "Unexpected answer");
  }
  return (await res.json()) as T;
}

export function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(`${API_BASE}${path}`, init);
}

const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/me");
}

// ── Online matches ───────────────────────────────────────────────────────────

export async function fetchMatches(): Promise<MatchSummary[]> {
  return (await apiFetch<{ matches: MatchSummary[] }>("/matches")).matches;
}

export function fetchMatch(id: string): Promise<MatchDetail> {
  return apiFetch<MatchDetail>(`/matches/${encodeURIComponent(id)}`);
}

export interface CreateMatchInput {
  game: string;
  options: unknown;
  opponent: Member;
  seat: PlayerIndex;
}

export function createMatch(input: CreateMatchInput): Promise<MatchSummary> {
  return post<MatchSummary>("/matches", input);
}

export function answerMatch(id: string, answer: "accept" | "decline" | "cancel"): Promise<MatchSummary> {
  return post<MatchSummary>(`/matches/${encodeURIComponent(id)}/${answer}`);
}

export function postMove(id: string, move: unknown, moveCount: number): Promise<MatchDetail> {
  return post<MatchDetail>(`/matches/${encodeURIComponent(id)}/moves`, { move, moveCount });
}

export function postMessage(id: string, text: string): Promise<MatchDetail> {
  return post<MatchDetail>(`/matches/${encodeURIComponent(id)}/messages`, { text });
}

export function resignMatch(id: string): Promise<MatchDetail> {
  return post<MatchDetail>(`/matches/${encodeURIComponent(id)}/resign`);
}

/**
 * Who can be invited. The home app answers this on its own origin (the same
 * session cookie rides along), which is the one read the contract allows. A
 * standalone development server has no home app, so the games server's made-up
 * family stands in when that answer is not there.
 */
export async function fetchMembers(): Promise<Member[]> {
  try {
    return (await request<{ members: Member[] }>("/api/games/members")).members;
  } catch {
    return (await apiFetch<{ members: Member[] }>("/dev/members")).members;
  }
}
