import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Sputnik, replayRun, seededRandom, sputnik, type SputnikRail, type SputnikVariant } from "@isputnik/games-engine";
import { buildApp } from "../src/app.js";
import { openDatabase, type Db } from "../src/db.js";
import { rememberMember } from "../src/matches.js";
import { arcadeStats, saveArcadeScore } from "../src/arcade.js";

/** A run played to its end by a player who follows the sputniks and slips now
 *  and then: its seed, its input log as the browser would send it, and the
 *  score it came to. */
function playRun(variant: SputnikVariant, seed: number, skill = 0.95) {
  const random = seededRandom(seed * 17 + 3);
  let state = Sputnik.createRun(variant, seed);
  let net: SputnikRail = 0;
  const log: [number, SputnikRail][] = [];
  while (!state.over) {
    const lead = [...state.sputniks].sort((a, b) => b.step - a.step)[0];
    let want: SputnikRail = lead ? lead.rail : net;
    if (random() > skill) want = Math.floor(random() * 4) as SputnikRail;
    if (want !== net) {
      net = want;
      log.push([state.tick, net]);
    }
    state = Sputnik.tick(state, net).state;
  }
  return { seed, log, score: state.caught };
}

let db: Db;
const names = new Map([["mum", "Мама"], ["kid", "Kid"]]);
beforeEach(() => {
  db = openDatabase(":memory:");
  rememberMember(db, { id: "mum", name: "Мама" });
  rememberMember(db, { id: "kid", name: "Kid" });
});

describe("arcade scores", () => {
  it("keeps the score the replay comes to, once per key", () => {
    const run = playRun("A", 11);
    expect(run.score).toBeGreaterThan(0);
    const first = saveArcadeScore(db, "kid", { game: "sputnik", variant: "A", seed: run.seed, key: "run-key-0001", log: run.log });
    expect(first).toEqual({ recorded: true, score: run.score, best: run.score });
    const again = saveArcadeScore(db, "kid", { game: "sputnik", variant: "A", seed: run.seed, key: "run-key-0001", log: run.log });
    expect(again).toEqual({ recorded: false, score: run.score, best: run.score });
  });

  it("scores what was played, whatever the log claims to be", () => {
    const run = playRun("B", 21);
    // This log on another seed is another run, and is scored as that run: a
    // good score cannot be carried over to sputniks that fell elsewhere.
    const other = saveArcadeScore(db, "kid", { game: "sputnik", variant: "B", seed: run.seed + 1, key: "run-key-0002", log: run.log });
    expect(other.score).toBe(replayRun(sputnik, "B", run.seed + 1, run.log, 1_000_000).caught);
    expect(other.score).toBeLessThan(run.score);
    // Doing nothing at all ends with only what fell into the net at rail 0.
    const idle = saveArcadeScore(db, "kid", { game: "sputnik", variant: "A", seed: 5, key: "run-key-0003", log: [] });
    expect(idle.score).toBe(replayRun(sputnik, "A", 5, [], 1_000_000).caught);
    expect(idle.score).toBeLessThan(run.score);
  });

  it("refuses an unknown game, a bad variant, seed or log", () => {
    const save = (over: object) => () => saveArcadeScore(db, "kid", { game: "sputnik", variant: "A", seed: 1, key: "run-key-0004", log: [], ...over });
    expect(save({ game: "tetris" })).toThrow(/No such game/);
    expect(save({ variant: "C" })).toThrow(/Not a run/);
    expect(save({ seed: -4 })).toThrow(/Not a run/);
    expect(save({ log: [[3, 1], [2, 0]] })).toThrow(/never go down/);
    expect(save({ log: [[0, 9]] })).toThrow(/bad input/);
  });

  it("tallies each member's best and runs per variant, this month and all time", () => {
    const a = playRun("A", 31);
    const b = playRun("A", 32);
    saveArcadeScore(db, "kid", { game: "sputnik", variant: "A", seed: a.seed, key: "run-key-0005", log: a.log });
    saveArcadeScore(db, "kid", { game: "sputnik", variant: "A", seed: b.seed, key: "run-key-0006", log: b.log });
    const old = playRun("B", 33);
    saveArcadeScore(db, "mum", { game: "sputnik", variant: "B", seed: old.seed, key: "run-key-0007", log: old.log });
    db.prepare("UPDATE arcade_scores SET finished_at = '2026-01-10T00:00:00.000Z' WHERE game_key = 'run-key-0007'").run();

    const stats = arcadeStats(db, names, "2026-10-01T00:00:00.000Z");
    expect(stats.month).toEqual([{ id: "kid", name: "Kid", game: "sputnik", variant: "A", best: Math.max(a.score, b.score), played: 2 }]);
    expect(stats.all).toContainEqual({ id: "mum", name: "Мама", game: "sputnik", variant: "B", best: old.score, played: 1 });
  });
});

describe("arcade scores API", () => {
  const SECRET = "test-secret-0123456789";
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

  it("takes a run once, logs it, and shows it on the stats", async () => {
    const run = playRun("A", 41);
    const body = { game: "sputnik", variant: "A", seed: run.seed, key: "run-key-0101", log: run.log };
    const first = await app.inject({ method: "POST", url: "/games/api/arcade/scores", headers: as("kid", "Kid"), payload: body });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ recorded: true, score: run.score, best: run.score });
    const again = await app.inject({ method: "POST", url: "/games/api/arcade/scores", headers: as("kid", "Kid"), payload: body });
    expect(again.statusCode).toBe(200);
    const stats = (await app.inject({ method: "GET", url: "/games/api/stats", headers: as("kid", "Kid") })).json();
    expect(stats.arcade.all).toEqual([{ id: "kid", name: "Kid", game: "sputnik", variant: "A", best: run.score, played: 1 }]);
    const log = await app.inject({ method: "GET", url: "/games/api/admin/events?event=arcade.score", headers: as("dad", "Dad", "admin") });
    const events = log.json().events as { actorId: string; detail: string }[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: "kid", detail: `sputnik A: ${run.score}` });
  });

  it("takes a long run's log past the usual body limit", async () => {
    // A log that moves the net every tick, far over the default 16 KB.
    const log = Array.from({ length: 4000 }, (_, tick) => [tick, tick % 4]);
    const reply = await app.inject({ method: "POST", url: "/games/api/arcade/scores", headers: as("kid", "Kid"), payload: { game: "sputnik", variant: "B", seed: 7, key: "run-key-0102", log } });
    expect(reply.statusCode).toBe(201);
  });

  it("refuses an unreplayable run, a two-player game, a guest and nobody", async () => {
    const post = (payload: object, headers: Record<string, string> = as("kid", "Kid")) =>
      app.inject({ method: "POST", url: "/games/api/arcade/scores", headers, payload });
    const ok = { game: "sputnik", variant: "A", seed: 1, key: "run-key-0103", log: [] };
    expect((await post({ ...ok, log: [[5, 1], [1, 2]] })).statusCode).toBe(400);
    expect((await post({ ...ok, game: "chess" })).statusCode).toBe(400);
    expect((await post({ ...ok, key: "x" })).statusCode).toBe(400);
    const asGuest = as("guest_abc123def456", "Alex", "guest", { "x-isputnik-guest-match": "m1234567890abcde" });
    expect((await post(ok, asGuest)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/games/api/arcade/scores", payload: ok })).statusCode).toBe(401);
  });
});
