import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Crossmath, type CrossmathLevel } from "@isputnik/games-engine";
import { buildApp } from "../src/app.js";
import { crossmathMe, recordCrossmathResult } from "../src/crossmath.js";
import { openDatabase, type Db } from "../src/db.js";
import { MatchError } from "../src/matches.js";
import { UnknownPuzzleError } from "../src/puzzles.js";

/** The finished tiles of a puzzle, as the page would send them. */
function solvedPlay(level: CrossmathLevel, number: number) {
  const puzzle = Crossmath.puzzleOf(level, number);
  let play = Crossmath.emptyPlay(puzzle);
  for (;;) {
    const hint = Crossmath.hintFor(puzzle, play);
    if (hint?.kind !== "place") return play;
    play = Crossmath.placeTile(puzzle, play, hint.tile, hint.cell);
  }
}

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

const solve = (level: CrossmathLevel, number: number, seconds: number | null, hints = 0) =>
  recordCrossmathResult(db, "kid", `${level}-${number}`, { play: solvedPlay(level, number), hints, seconds });

describe("Crossmath results", () => {
  it("starts a member at the starting rating with nothing solved", () => {
    const me = crossmathMe(db, "kid");
    expect(me.rating).toBe(Crossmath.START_RATING);
    expect(me.levels.easy).toEqual({ solved: 0, count: 60, bestSeconds: null, ready: false });
    expect(me.puzzles).toEqual({});
  });

  it("rates a first solve, and treats a second as practice that can better the time", () => {
    const first = solve("easy", 1, 50);
    expect(first).toMatchObject({ recorded: true, before: 800, after: 820, newBest: false });
    expect(first.me.levels.easy).toMatchObject({ solved: 1, bestSeconds: 50 });

    const slower = solve("easy", 1, 70);
    expect(slower).toMatchObject({ recorded: false, before: 820, after: 820, newBest: false });
    const quicker = solve("easy", 1, 30);
    expect(quicker).toMatchObject({ recorded: false, after: 820, newBest: true });
    expect(quicker.me.puzzles["easy-1"]).toEqual({ seconds: 50, hints: 0, bestSeconds: 30 });
    expect(quicker.me.played).toBe(1);
  });

  it("pays less for a slow solve and for hints, and keeps hinted times out of the best", () => {
    const quick = solve("easy", 1, 40).after;
    db = openDatabase(":memory:");
    const slow = solve("easy", 1, 170).after;
    db = openDatabase(":memory:");
    const hinted = solve("easy", 1, 40, 3);
    expect(slow).toBeLessThan(quick);
    expect(hinted.after).toBeLessThan(quick);
    expect(hinted.me.levels.easy.bestSeconds).toBeNull();
  });

  it("offers the next level after three solves in a row going well", () => {
    solve("easy", 1, 50);
    solve("easy", 2, 50);
    expect(crossmathMe(db, "kid").levels.easy.ready).toBe(false);
    expect(solve("easy", 3, 50).me.levels.easy.ready).toBe(true);
    // One that went badly takes the offer back until the run is good again.
    expect(solve("easy", 4, 400).me.levels.easy.ready).toBe(false);
    expect(crossmathMe(db, "kid").levels.medium.ready).toBe(false);
  });

  it("accepts only a real solve of a real puzzle", () => {
    const puzzle = Crossmath.puzzleOf("easy", 1);
    expect(() => recordCrossmathResult(db, "kid", "easy-1", { play: Crossmath.emptyPlay(puzzle), hints: 0, seconds: 10 })).toThrow(MatchError);
    expect(() => recordCrossmathResult(db, "kid", "easy-1", { play: "nonsense", hints: 0, seconds: 10 })).toThrow(MatchError);
    for (const id of ["easy-61", "easy-0", "easy-x", "chess-1"]) {
      expect(() => recordCrossmathResult(db, "kid", id, { play: solvedPlay("easy", 1), hints: 0, seconds: 10 })).toThrow(UnknownPuzzleError);
    }
    expect(crossmathMe(db, "kid").played).toBe(0);
  });

});

describe("Crossmath API", () => {
  const SECRET = "s3cret-s3cret-s3cret";
  const as = (id: string, role = "member") => ({
    "x-isputnik-gateway": SECRET,
    "x-isputnik-user-id": id,
    "x-isputnik-user-name": id,
    "x-isputnik-user-role": role
  });
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildApp({ gatewaySecret: SECRET, devUser: null, staticPath: "", dbPath: ":memory:", version: "0.0.0-test", stage: null });
  });
  afterEach(async () => {
    await app.close();
  });
  const post = (id: string, payload: object, headers: Record<string, string> = as("kid")) =>
    app.inject({ method: "POST", url: `/games/api/crossmath/${id}/result`, headers, payload });

  it("records a solve and answers with the member's standing", async () => {
    const posted = await post("easy-1", { play: solvedPlay("easy", 1), hints: 0, seconds: 50 });
    expect(posted.statusCode).toBe(200);
    expect(posted.json()).toMatchObject({ recorded: true, before: 800, after: 820 });
    const me = await app.inject({ method: "GET", url: "/games/api/crossmath/me", headers: as("kid") });
    expect(me.json().levels.easy.solved).toBe(1);
    // One member's results are not another's.
    const other = await app.inject({ method: "GET", url: "/games/api/crossmath/me", headers: as("mum") });
    expect(other.json().played).toBe(0);
  });

  it("refuses what is not a solve, what does not exist, and a guest", async () => {
    expect((await post("easy-1", { play: {}, hints: 0, seconds: 5 })).statusCode).toBe(400);
    expect((await post("easy-99", { play: {}, hints: 0, seconds: 5 })).statusCode).toBe(404);
    expect((await post("easy-1", { play: solvedPlay("easy", 1), hints: 0, seconds: 0 })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/games/api/crossmath/me" })).statusCode).toBe(401);
  });
});
