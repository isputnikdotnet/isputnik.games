// The games API, under the same /games prefix the pages live at. The home gateway
// authenticates every call; this module only needs to echo its CSRF token on
// state-changing requests, the way the home SPA does.
import type { AiLevel, ChessMove, ChessPuzzle, GameEvent, GameStatus, PlayerIndex, PuzzleLevel } from "@isputnik/games-engine";

export const API_BASE = "/games/api";

export interface Me {
  id: string;
  name: string;
  role: "admin" | "member" | "guest";
  lang: string;
  theme: string;
  /** A guest's one match (docs/plan.md → Guests); absent for members. */
  guestMatch?: string;
}

export interface MeResponse {
  user: Me;
  games: string[];
  /** Whether guest links can be made: only behind the home gateway. */
  guests: boolean;
  version: string;
  stage: string | null;
}

export interface Member {
  id: string;
  name: string;
  /** Someone let in by guest link, not a member of the household. */
  guest?: boolean;
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

// ── The family's results (the lobby's leaderboard and "Your month") ─────────

/** One member's results in one game. */
export interface StatsRow {
  id: string;
  name: string;
  game: string;
  played: number;
  won: number;
  drawn: number;
}

export interface FamilyStats {
  since: string;
  month: StatsRow[];
  all: StatsRow[];
  /** The asking member's current run of wins. */
  streak: number;
  /** Games against the computer, the same two periods (the leaderboard's vs Computer tab). */
  computer: { month: ComputerRow[]; all: ComputerRow[] };
  /** Chess puzzles: each member's rating and solves (the leaderboard's Puzzles tab). */
  puzzles: PuzzleRow[];
  /** Chess ratings, all time (the leaderboard's Chess rating tab). */
  chessRatings: ChessRatingRow[];
}

/** A chess rating: games against the computer (its levels rated) and online games with members. */
export interface ChessRating {
  rating: number;
  games: number;
  /** Fewer than ten games: still finding its level. */
  provisional: boolean;
  /** What the latest game did to it; null before any. */
  change: number | null;
}

export interface ChessRatingRow extends ChessRating {
  id: string;
  name: string;
}

export function fetchChessRating(): Promise<ChessRating> {
  return apiFetch<ChessRating>("/chess/rating");
}

export interface PuzzleRow {
  id: string;
  name: string;
  rating: number;
  played: number;
  solved: number;
  /** Solved this month. */
  solvedSince: number;
}

/** One member's games against the computer in one game. */
export interface ComputerRow extends StatsRow {
  /** Points for wins: Easy 1, Normal 2, Hard 3. */
  score: number;
  /** The hardest level beaten, if any. */
  best: AiLevel | null;
}

/** `since` is where "this month" begins for this reader: their own midnight on the 1st. */
export async function fetchStats(since: string): Promise<FamilyStats> {
  return apiFetch<FamilyStats>(`/stats?since=${encodeURIComponent(since)}`);
}

export interface ComputerResult {
  game: string;
  level: AiLevel;
  result: "won" | "lost" | "drawn";
  /** The local game's own id: the server keeps one result per key. */
  key: string;
}

/** A game against the computer has ended on this device. */
export function reportComputerResult(result: ComputerResult): Promise<{ recorded: boolean; chessRating?: ChessRating }> {
  return post<{ recorded: boolean; chessRating?: ChessRating }>("/computer-results", result);
}

// ── Game review ─────────────────────────────────────────────────────────────

export type ReviewMode = "computer" | "local" | "online";

/** One finished game of the member's, for "My games". */
export interface ReviewItem {
  source: "record" | "match";
  id: string;
  game: string;
  mode: ReviewMode;
  level: AiLevel | null;
  /** The member's seat; null at one screen. */
  seat: PlayerIndex | null;
  /** The other member online; null against the computer or at one screen. */
  opponent: string | null;
  winner: PlayerIndex | null;
  reason: string | null;
  moveCount: number;
  finishedAt: string;
}

export interface ReviewRecord extends ReviewItem {
  moves: ChessMove[];
}

export interface RecordInput {
  game: "chess";
  key: string;
  mode: "computer" | "local";
  level?: AiLevel;
  seat?: PlayerIndex;
  moves: ChessMove[];
  finish?: { reason: "agreed" | "resigned"; resigning?: PlayerIndex };
}

/** A finished game on this device, kept for review; resending it changes nothing. */
export function saveGameRecord(input: RecordInput): Promise<{ recorded: boolean; id: string }> {
  return post<{ recorded: boolean; id: string }>("/records", input);
}

export async function fetchMyGames(): Promise<ReviewItem[]> {
  return (await apiFetch<{ items: ReviewItem[] }>("/records?game=chess")).items;
}

export function fetchGameRecord(id: string): Promise<ReviewRecord> {
  return apiFetch<ReviewRecord>(`/records/${encodeURIComponent(id)}`);
}

// ── Chess puzzles ───────────────────────────────────────────────────────────

export interface PuzzleMe {
  rating: number;
  played: number;
  solved: number;
  streak: number;
}

export interface PuzzleOffer {
  puzzle: ChessPuzzle & { level: PuzzleLevel };
  /** Every puzzle in reach was tried already: practice, the rating stays. */
  repeat: boolean;
  me: PuzzleMe;
}

export interface PuzzleResult {
  recorded: boolean;
  before: number;
  after: number;
  me: PuzzleMe;
}

/** The next puzzle: near your rating ("auto") or at a level you chose. */
export function fetchNextPuzzle(level: PuzzleLevel | "auto"): Promise<PuzzleOffer> {
  return apiFetch<PuzzleOffer>(`/puzzles/next?level=${level}`);
}

/** How a first try went; a second try is practice and moves nothing. */
export function reportPuzzleResult(id: string, result: { solved: boolean; hints: number }): Promise<PuzzleResult> {
  return post<PuzzleResult>(`/puzzles/${encodeURIComponent(id)}/result`, result);
}

// ── Online matches ───────────────────────────────────────────────────────────

export async function fetchMatches(): Promise<MatchSummary[]> {
  return (await apiFetch<{ matches: MatchSummary[] }>("/matches")).matches;
}

export interface MatchActivity {
  invitations: { id: string; game: string; from: Member; createdAt: string }[];
  yourMove: { id: string; game: string; opponent: Member; updatedAt: string }[];
  counts: { invitations: number; yourMove: number };
}

/** What waits on the signed-in member: the same answer the home app shows. */
export function fetchSummary(): Promise<MatchActivity> {
  return apiFetch<MatchActivity>("/summary");
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

// ── Guest links (docs/plan.md → Guests) ──────────────────────────────────────
// Minted, renewed and revoked by the home server, which owns identity; the
// games front end calls it on the home origin, the way it asks for the members.

export interface GuestInvite {
  id: string;
  guestId: string;
  guestName: string;
  game: string;
  matchId: string | null;
  createdBy: Member;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  openedCount: number;
  firstOpenedAt: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  state: "live" | "expired" | "revoked" | "pending";
}

export interface CreateGuestInviteInput {
  game: string;
  options: unknown;
  seat: PlayerIndex;
  guestName: string;
}

export interface GuestInviteCreated {
  invite: GuestInvite;
  /** The link, shown once: only its hash is kept. */
  url: string;
  match: MatchSummary;
}

const home = <T>(path: string, init: RequestInit = {}) => request<T>(`/api/games/guest-invites${path}`, init);

export function createGuestInvite(input: CreateGuestInviteInput): Promise<GuestInviteCreated> {
  return home<GuestInviteCreated>("", { method: "POST", body: JSON.stringify(input) });
}

/** The link for one match — the inviter's own, or null when there is none. */
export async function fetchGuestInvite(matchId: string): Promise<GuestInvite | null> {
  const { invites } = await home<{ invites: GuestInvite[] }>(`?match=${encodeURIComponent(matchId)}`);
  return invites[0] ?? null;
}

export function renewGuestInvite(id: string): Promise<{ invite: GuestInvite; url: string }> {
  return home<{ invite: GuestInvite; url: string }>(`/${encodeURIComponent(id)}/renew`, { method: "POST" });
}

export function revokeGuestInvite(id: string): Promise<{ invite: GuestInvite }> {
  return home<{ invite: GuestInvite }>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
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
