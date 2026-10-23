import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Chess } from "@isputnik/games-engine";
import { buildApp } from "../src/app.js";
import { openDatabase, type Db } from "../src/db.js";
import { rememberMember } from "../src/matches.js";
import { nextPuzzle, puzzleMe, puzzleSet, recordPuzzleResult } from "../src/puzzles.js";
import { familyStats } from "../src/stats.js";

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
  rememberMember(db, { id: "mum", name: "Мама" });
  rememberMember(db, { id: "kid", name: "Kid" });
});

describe("the puzzle set", () => {
  it("is about a thousand puzzles across the five levels, every line legal", () => {
    const set = puzzleSet();
    expect(set.length).toBeGreaterThan(900);
    for (const level of Chess.PUZZLE_LEVELS) {
      expect(set.filter((puzzle) => Chess.puzzleLevel(puzzle.rating) === level).length).toBeGreaterThan(150);
    }
    expect(new Set(set.map((puzzle) => puzzle.id)).size).toBe(set.length);
    for (const puzzle of set) {
      let state = Chess.fromFen(puzzle.fen);
      for (const uci of puzzle.moves) state = Chess.applyMove(state, Chess.uciMove(uci));
      // The line's own moves are always the answer.
      const start = Chess.puzzleStart(puzzle);
      expect(Chess.checkPuzzleMove(puzzle, 0, start.state, Chess.uciMove(puzzle.moves[1])).kind).not.toBe("wrong");
    }
  });
});

describe("puzzles", () => {
  it("starts a member at 800 and offers a puzzle near it", () => {
    expect(puzzleMe(db, "mum")).toEqual({ rating: 800, played: 0, solved: 0, streak: 0 });
    const offer = nextPuzzle(db, "mum", "auto", () => 0.5);
    expect(Math.abs(offer.puzzle.rating - 800)).toBeLessThanOrEqual(150);
    expect(offer.repeat).toBe(false);
  });

  it("offers a chosen level", () => {
    const offer = nextPuzzle(db, "mum", "expert", () => 0);
    expect(offer.puzzle.level).toBe("expert");
    expect(offer.puzzle.rating).toBeGreaterThanOrEqual(2100);
  });

  it("moves the rating on a first try only, and skips tried puzzles", () => {
    const offer = nextPuzzle(db, "mum", "auto", () => 0);
    const first = recordPuzzleResult(db, "mum", offer.puzzle.id, { solved: true, hints: 0 });
    expect(first.recorded).toBe(true);
    expect(first.before).toBe(800);
    expect(first.after).toBe(Chess.nextPuzzleRating(800, 0, offer.puzzle.rating, 1));
    expect(first.me).toMatchObject({ rating: first.after, played: 1, solved: 1, streak: 1 });

    // Again: practice.
    const again = recordPuzzleResult(db, "mum", offer.puzzle.id, { solved: false, hints: 0 });
    expect(again).toMatchObject({ recorded: false, before: first.after, after: first.after });

    expect(nextPuzzle(db, "mum", "auto", () => 0).puzzle.id).not.toBe(offer.puzzle.id);
  });

  it("counts a solve with the move shown as no solve, and breaks the streak", () => {
    const [a, b] = puzzleSet();
    recordPuzzleResult(db, "kid", a.id, { solved: true, hints: 1 });
    expect(puzzleMe(db, "kid")).toMatchObject({ solved: 1, streak: 1 });
    recordPuzzleResult(db, "kid", b.id, { solved: true, hints: 2 });
    expect(puzzleMe(db, "kid")).toMatchObject({ played: 2, solved: 1, streak: 0 });
  });

  it("calls every puzzle in reach a repeat once all are tried", () => {
    const expert = puzzleSet().filter((puzzle) => Chess.puzzleLevel(puzzle.rating) === "expert");
    for (const puzzle of expert) recordPuzzleResult(db, "mum", puzzle.id, { solved: false, hints: 0 });
    const offer = nextPuzzle(db, "mum", "expert", () => 0);
    expect(offer.repeat).toBe(true);
    expect(offer.puzzle.level).toBe("expert");
  });

  it("puts the ratings on the family stats", () => {
    const [a, b] = puzzleSet();
    recordPuzzleResult(db, "mum", a.id, { solved: true, hints: 0 });
    recordPuzzleResult(db, "kid", b.id, { solved: false, hints: 0 });
    const rows = familyStats(db, "mum").puzzles;
    expect(rows.find((row) => row.id === "mum")).toMatchObject({ name: "Мама", played: 1, solved: 1, solvedSince: 1 });
    expect(rows.find((row) => row.id === "kid")).toMatchObject({ played: 1, solved: 0, solvedSince: 0 });
  });
});

describe("puzzles API", () => {
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

  it("hands out a puzzle and records the try", async () => {
    const next = await app.inject({ method: "GET", url: "/games/api/puzzles/next?level=easy", headers: as("mum", "Мама") });
    expect(next.statusCode).toBe(200);
    const offer = next.json();
    expect(offer.puzzle.level).toBe("easy");
    expect(offer.me.rating).toBe(800);

    const result = await app.inject({
      method: "POST",
      url: `/games/api/puzzles/${offer.puzzle.id}/result`,
      headers: as("mum", "Мама"),
      payload: { solved: true, hints: 1 }
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ recorded: true, before: 800 });
  });

  it("refuses a bad level, an unknown puzzle, bad hints and a guest", async () => {
    expect((await app.inject({ method: "GET", url: "/games/api/puzzles/next?level=impossible", headers: as("mum", "Мама") })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/games/api/puzzles/nope0/result", headers: as("mum", "Мама"), payload: { solved: true, hints: 0 } })).statusCode).toBe(404);
    const id = puzzleSet()[0].id;
    expect((await app.inject({ method: "POST", url: `/games/api/puzzles/${id}/result`, headers: as("mum", "Мама"), payload: { solved: true, hints: 3 } })).statusCode).toBe(400);
    const asGuest = as("guest_abc123def456", "Alex", "guest", { "x-isputnik-guest-match": "m1234567890abcde" });
    expect((await app.inject({ method: "GET", url: "/games/api/puzzles/next", headers: asGuest })).statusCode).toBe(403);
  });
});
