import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { openDatabase, type Db } from "../src/db.js";
import { answerInvitation, createMatch, playMove, rememberMember, resign } from "../src/matches.js";
import { familyStats, monthStart, recordComputerResult } from "../src/stats.js";

const mum = { id: "mum", name: "Мама" };
const dad = { id: "dad", name: "Dad" };
const kid = { id: "kid", name: "Kid" };
const guest = { id: "guest_abc123def456", name: "Alex" };

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
  for (const member of [mum, dad, kid]) rememberMember(db, member);
});

/** A finished match: `loser` resigns, so the other one wins. */
function played(game: "dots" | "chess", blue: typeof mum, red: typeof mum, loser: typeof mum, finishedAt?: string) {
  const options = game === "dots" ? { size: 10, targetCaptures: null } : {};
  const match = createMatch(db, blue, { game, options, opponent: red, seat: 0 });
  answerInvitation(db, red.id, match.id, "accept");
  resign(db, loser.id, match.id);
  if (finishedAt) db.prepare("UPDATE matches SET finished_at = ?, updated_at = ? WHERE id = ?").run(finishedAt, finishedAt, match.id);
  return match.id;
}

/** A finished match the two agreed to call a draw — by a stalemate in chess. */
function drawn(blue: typeof mum, red: typeof mum) {
  const match = createMatch(db, blue, { game: "chess", options: {}, opponent: red, seat: 0 });
  answerInvitation(db, red.id, match.id, "accept");
  // The fastest stalemate there is (Sam Loyd, ten moves).
  const moves = ["e2e3", "a7a5", "d1h5", "a8a6", "h5a5", "h7h5", "h2h4", "a6h6", "a5c7", "f7f6", "c7d7", "e8f7", "d7b7", "d8d3", "b7b8", "d3h7", "b8c8", "f7g6", "c8e6"];
  moves.forEach((m, count) => {
    playMove(db, count % 2 === 0 ? blue.id : red.id, match.id, { from: m.slice(0, 2), to: m.slice(2) }, count);
  });
  return match.id;
}

const row = (list: { id: string; game: string }[], id: string, game: string) => list.find((r) => r.id === id && r.game === game);

describe("family stats", () => {
  it("counts finished matches per member and game, and the month apart from all time", () => {
    played("dots", mum, dad, dad);
    played("dots", mum, dad, mum);
    played("chess", mum, kid, kid);
    played("chess", dad, mum, mum, "2026-01-15T12:00:00.000Z");

    const stats = familyStats(db, "mum", monthStart());
    expect(row(stats.month, "mum", "dots")).toMatchObject({ name: "Мама", played: 2, won: 1, drawn: 0 });
    expect(row(stats.month, "dad", "dots")).toMatchObject({ played: 2, won: 1 });
    expect(row(stats.month, "mum", "chess")).toMatchObject({ played: 1, won: 1 });
    // The January game counts for all time only.
    expect(row(stats.month, "dad", "chess")).toBeUndefined();
    expect(row(stats.all, "dad", "chess")).toMatchObject({ played: 1, won: 1 });
    expect(row(stats.all, "mum", "chess")).toMatchObject({ played: 2, won: 1 });
  });

  it("leaves out games with a guest and games not yet over", () => {
    played("dots", mum, guest, guest);
    const open = createMatch(db, mum, { game: "dots", options: { size: 10, targetCaptures: null }, opponent: dad, seat: 0 });
    answerInvitation(db, "dad", open.id, "accept");
    const stats = familyStats(db, "mum");
    expect(stats.all).toEqual([]);
  });

  it("counts a draw as played, not won", () => {
    drawn(mum, dad);
    const stats = familyStats(db, "mum");
    expect(row(stats.all, "mum", "chess")).toMatchObject({ played: 1, won: 0, drawn: 1 });
    expect(row(stats.all, "dad", "chess")).toMatchObject({ played: 1, won: 0, drawn: 1 });
  });

  it("counts the asker's run of wins back from the newest match", () => {
    played("dots", mum, dad, mum, "2026-10-01T10:00:00.000Z");
    played("dots", mum, dad, dad, "2026-10-02T10:00:00.000Z");
    played("chess", mum, kid, kid, "2026-10-03T10:00:00.000Z");
    played("dots", kid, dad, kid, "2026-10-04T10:00:00.000Z");
    expect(familyStats(db, "mum").streak).toBe(2);
    expect(familyStats(db, "dad").streak).toBe(1);
    expect(familyStats(db, "kid").streak).toBe(0);
  });
});

describe("results against the computer", () => {
  let n = 0;
  const vsComputer = (id: string, game: string, level: "easy" | "normal" | "hard", result: "won" | "lost" | "drawn", at?: string) => {
    const key = `game-key-${++n}`;
    recordComputerResult(db, id, { game, level, result, key });
    if (at) db.prepare("UPDATE computer_results SET finished_at = ? WHERE game_key = ?").run(at, key);
    return key;
  };

  it("scores a win by its level and keeps the hardest level beaten", () => {
    vsComputer("kid", "chess", "hard", "won");
    vsComputer("kid", "chess", "easy", "won");
    vsComputer("kid", "chess", "normal", "lost");
    vsComputer("kid", "chess", "normal", "drawn");
    vsComputer("mum", "dots", "normal", "won");
    const stats = familyStats(db, "mum");
    expect(row(stats.computer.all, "kid", "chess")).toMatchObject({ name: "Kid", played: 4, won: 2, drawn: 1, score: 4, best: "hard" });
    expect(row(stats.computer.all, "mum", "dots")).toMatchObject({ played: 1, won: 1, score: 2, best: "normal" });
    // Games against the computer are not on the Each other board.
    expect(stats.all).toEqual([]);
  });

  it("counts a game from before the month for all time only", () => {
    vsComputer("dad", "starbattle", "easy", "won", "2026-01-15T12:00:00.000Z");
    vsComputer("dad", "starbattle", "easy", "lost");
    const stats = familyStats(db, "dad", monthStart());
    expect(row(stats.computer.month, "dad", "starbattle")).toMatchObject({ played: 1, won: 0, score: 0, best: null });
    expect(row(stats.computer.all, "dad", "starbattle")).toMatchObject({ played: 2, won: 1, score: 1, best: "easy" });
  });

  it("keeps one result per game key and member", () => {
    expect(recordComputerResult(db, "mum", { game: "dots", level: "hard", result: "won", key: "same-key-1" })).toBe(true);
    expect(recordComputerResult(db, "mum", { game: "dots", level: "hard", result: "won", key: "same-key-1" })).toBe(false);
    expect(row(familyStats(db, "mum").computer.all, "mum", "dots")).toMatchObject({ played: 1, score: 3 });
  });
});

describe("stats API", () => {
  const SECRET = "s3cret-s3cret-s3cret";
  const as = (id: string, name: string, role = "member", extra: Record<string, string> = {}) => ({
    "x-isputnik-gateway": SECRET,
    "x-isputnik-user-id": id,
    "x-isputnik-user-name": encodeURIComponent(name),
    "x-isputnik-user-role": role,
    ...extra
  });
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildApp({ gatewaySecret: SECRET, devUser: null, staticPath: "", dbPath: ":memory:", version: "0.0.0-test", stage: null });
  });
  afterEach(async () => {
    await app.close();
  });

  it("answers a member, from the month start they send", async () => {
    const reply = await app.inject({ method: "GET", url: "/games/api/stats?since=2026-10-01T05:00:00.000Z", headers: as("mum", "Мама") });
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({ since: "2026-10-01T05:00:00.000Z", month: [], all: [], streak: 0, computer: { month: [], all: [] }, puzzles: [], chessRatings: [], arcade: { month: [], all: [] } });
  });

  it("refuses a bad date, a guest, and nobody at all", async () => {
    expect((await app.inject({ method: "GET", url: "/games/api/stats?since=soon", headers: as("mum", "Мама") })).statusCode).toBe(400);
    const asGuest = as("guest_abc123def456", "Alex", "guest", { "x-isputnik-guest-match": "m1234567890abcde" });
    expect((await app.inject({ method: "GET", url: "/games/api/stats", headers: asGuest })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/games/api/stats" })).statusCode).toBe(401);
  });

  it("takes a member's game against the computer once, and it shows on the vs Computer board", async () => {
    const body = { game: "chess", level: "hard", result: "won", key: "k-12345678" };
    const first = await app.inject({ method: "POST", url: "/games/api/computer-results", headers: as("kid", "Kid"), payload: body });
    expect(first.statusCode).toBe(201);
    const again = await app.inject({ method: "POST", url: "/games/api/computer-results", headers: as("kid", "Kid"), payload: body });
    expect(again.statusCode).toBe(200);
    // A chess game answers with the chess rating too; the repeat moved nothing.
    expect(again.json()).toEqual({ recorded: false, chessRating: first.json().chessRating });
    expect(first.json().chessRating).toMatchObject({ games: 1, provisional: true });
    const stats = (await app.inject({ method: "GET", url: "/games/api/stats", headers: as("mum", "Мама") })).json();
    expect(stats.computer.all).toEqual([{ id: "kid", name: "Kid", game: "chess", played: 1, won: 1, drawn: 0, score: 3, best: "hard" }]);
  });

  it("refuses an unknown game or level, a bad key, and a guest", async () => {
    const post = (payload: object, headers = as("kid", "Kid")) =>
      app.inject({ method: "POST", url: "/games/api/computer-results", headers, payload });
    expect((await post({ game: "poker", level: "hard", result: "won", key: "k-12345678" })).statusCode).toBe(400);
    expect((await post({ game: "dots", level: "insane", result: "won", key: "k-12345678" })).statusCode).toBe(400);
    expect((await post({ game: "dots", level: "easy", result: "won", key: "x" })).statusCode).toBe(400);
    const asGuest = as("guest_abc123def456", "Alex", "guest", { "x-isputnik-guest-match": "m1234567890abcde" });
    expect((await post({ game: "dots", level: "easy", result: "won", key: "k-12345678" }, asGuest)).statusCode).toBe(403);
  });
});
