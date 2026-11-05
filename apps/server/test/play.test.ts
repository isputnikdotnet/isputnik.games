import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { play } from "../src/play.js";

const SECRET = "s3cret-s3cret-s3cret";

const as = (id: string, name: string, role: "admin" | "member" | "guest" = "member") => ({
  "x-isputnik-gateway": SECRET,
  "x-isputnik-user-id": id,
  "x-isputnik-user-name": encodeURIComponent(name),
  "x-isputnik-user-role": role
});
const mum = as("mum", "Мама");
const dad = as("dad", "Dad");

describe("play (a screen without rules)", () => {
  it("answers the opening position with White's twenty moves", () => {
    const answer = play({ game: "chess", options: {}, moves: [] });
    expect(answer.state.status).toEqual({ kind: "playing", turn: 0 });
    expect(answer.legalMoves).toHaveLength(20);
    expect(answer.computerMove).toBeNull();
  });

  it("plays the computer's reply and gives the person's moves after it", () => {
    const answer = play({ game: "chess", options: {}, moves: [{ from: "e2", to: "e4" }], computer: { seat: 1, level: "easy" } }, () => 0.5);
    expect(answer.moves).toHaveLength(2);
    expect(answer.computerMove).toEqual(answer.moves[1]);
    expect(answer.state.status).toEqual({ kind: "playing", turn: 0 });
    expect(answer.legalMoves.length).toBeGreaterThan(0);
    expect(answer.feed).toHaveLength(2);
  });

  it("opens with the computer's move when it has White", () => {
    const answer = play({ game: "checkers", options: {}, moves: [], computer: { seat: 0, level: "normal" } });
    expect(answer.moves).toHaveLength(1);
    expect(answer.state.status).toEqual({ kind: "playing", turn: 1 });
  });

  it("refuses an illegal move and games with hidden hands", () => {
    expect(() => play({ game: "chess", options: {}, moves: [{ from: "e2", to: "e5" }] })).toThrow(/Move 1/);
    expect(() => play({ game: "dominoes", options: {}, moves: [] })).toThrow(/not played this way/);
    expect(() => play({ game: "starbattle", options: {}, moves: [] })).toThrow(/not played this way/);
  });

  it("finishes a fool's mate", () => {
    const moves = [{ from: "f2", to: "f3" }, { from: "e7", to: "e5" }, { from: "g2", to: "g4" }, { from: "d8", to: "h4" }];
    const answer = play({ game: "chess", options: {}, moves });
    expect(answer.state.status).toEqual({ kind: "finished", winner: 1, reason: "checkmate" });
    expect(answer.legalMoves).toEqual([]);
  });
});

describe("play and legal moves over HTTP", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildApp({ gatewaySecret: SECRET, devUser: null, staticPath: "", dbPath: ":memory:", version: "0.0.0-test", stage: null });
  });
  afterEach(async () => {
    await app.close();
  });
  const post = (url: string, headers: Record<string, string>, payload?: unknown) =>
    app.inject({ method: "POST", url, headers, ...(payload === undefined ? {} : { payload }) });

  it("answers a member and refuses a guest", async () => {
    const ok = await post("/games/api/play", mum, { game: "checkers", options: {}, moves: [] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().legalMoves).toHaveLength(7);
    const guest = await post("/games/api/play", { ...as("guest_x", "Guest", "guest"), "x-isputnik-guest-match": "abcdefghijklmnop" }, { game: "checkers", options: {}, moves: [] });
    expect(guest.statusCode).toBe(403);
    const bad = await post("/games/api/play", mum, { game: "chess", options: {}, moves: [{ from: "a1", to: "a8" }] });
    expect(bad.statusCode).toBe(400);
  });

  it("adds legal moves to a match only when asked, and only on your move", async () => {
    const created = await post("/games/api/matches", mum, { game: "chess", options: {}, opponent: { id: "dad", name: "Dad" }, seat: 0 });
    const id = created.json().id as string;
    await post(`/games/api/matches/${id}/accept`, dad);
    const plain = await app.inject({ method: "GET", url: `/games/api/matches/${id}`, headers: mum });
    expect(plain.json().legalMoves).toBeUndefined();
    const mine = await app.inject({ method: "GET", url: `/games/api/matches/${id}?legal=1`, headers: mum });
    expect(mine.json().legalMoves).toHaveLength(20);
    const theirs = await app.inject({ method: "GET", url: `/games/api/matches/${id}?legal=1`, headers: dad });
    expect(theirs.json().legalMoves).toBeUndefined();
  });
});
