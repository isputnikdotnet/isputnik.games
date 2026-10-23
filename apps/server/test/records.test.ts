import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDatabase, type Db } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { answerInvitation, createMatch, rememberMember, resign } from "../src/matches.js";
import { getRecord, listReviews, saveRecord } from "../src/records.js";

const mv = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
// Fool's mate: Black mates on move two.
const FOOLS = ["f2f3", "e7e5", "g2g4", "d8h4"].map(mv);

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
  rememberMember(db, { id: "mum", name: "Мама" });
  rememberMember(db, { id: "dad", name: "Dad" });
});

describe("game records", () => {
  it("keeps a finished game against the computer, once per key", () => {
    const first = saveRecord(db, "mum", { game: "chess", key: "game-key-0001", mode: "computer", level: "hard", seat: 0, moves: FOOLS });
    expect(first.recorded).toBe(true);
    const again = saveRecord(db, "mum", { game: "chess", key: "game-key-0001", mode: "computer", level: "hard", seat: 0, moves: FOOLS });
    expect(again).toEqual({ recorded: false, id: first.id });

    const record = getRecord(db, "mum", first.id)!;
    expect(record).toMatchObject({ mode: "computer", level: "hard", seat: 0, winner: 1, reason: "checkmate", moveCount: 4 });
    expect(record.moves).toEqual(FOOLS);
    // Somebody else's game is not theirs to read.
    expect(getRecord(db, "dad", first.id)).toBeNull();
  });

  it("keeps a resignation or an agreed draw, and refuses a game still on or an illegal one", () => {
    const resigned = saveRecord(db, "mum", { game: "chess", key: "game-key-0002", mode: "local", moves: [mv("e2e4")], finish: { reason: "resigned", resigning: 1 } });
    expect(getRecord(db, "mum", resigned.id)).toMatchObject({ mode: "local", seat: null, level: null, winner: 0, reason: "resigned" });
    expect(() => saveRecord(db, "mum", { game: "chess", key: "game-key-0003", mode: "local", moves: [mv("e2e4")] })).toThrow(/not over/);
    expect(() => saveRecord(db, "mum", { game: "chess", key: "game-key-0004", mode: "local", moves: [mv("e2e5")], finish: { reason: "agreed" } })).toThrow(/Not a legal game/);
    expect(() => saveRecord(db, "mum", { game: "chess", key: "game-key-0005", mode: "local", moves: [{ nonsense: true }], finish: { reason: "agreed" } })).toThrow(/Not a legal game/);
  });

  it("lists the member's own games, local and online, newest first", () => {
    saveRecord(db, "mum", { game: "chess", key: "game-key-0010", mode: "computer", level: "easy", seat: 1, moves: FOOLS });
    db.prepare("UPDATE game_records SET finished_at = '2026-10-01T10:00:00.000Z'").run();
    const match = createMatch(db, { id: "mum", name: "Мама" }, { game: "chess", options: {}, opponent: { id: "dad", name: "Dad" }, seat: 0 });
    answerInvitation(db, "dad", match.id, "accept");
    resign(db, "dad", match.id);

    const mine = listReviews(db, "mum", "chess");
    expect(mine.map((item) => [item.source, item.mode])).toEqual([["match", "online"], ["record", "computer"]]);
    expect(mine[0]).toMatchObject({ id: match.id, seat: 0, opponent: "Dad", winner: 0, reason: "resigned" });
    expect(mine[1]).toMatchObject({ seat: 1, level: "easy", winner: 1 });
    expect("moves" in mine[1]).toBe(false);
    // Dad sees the match, not Mum's game against the computer.
    expect(listReviews(db, "dad", "chess").map((item) => item.source)).toEqual(["match"]);
  });
});

describe("records API", () => {
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

  it("saves, lists and opens a game", async () => {
    const body = { game: "chess", key: "game-key-0100", mode: "computer", level: "normal", seat: 0, moves: FOOLS };
    const saved = await app.inject({ method: "POST", url: "/games/api/records", headers: as("mum", "Мама"), payload: body });
    expect(saved.statusCode).toBe(201);
    const { id } = saved.json();
    expect((await app.inject({ method: "POST", url: "/games/api/records", headers: as("mum", "Мама"), payload: body })).statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/games/api/records?game=chess", headers: as("mum", "Мама") });
    expect(list.json().items).toHaveLength(1);
    const one = await app.inject({ method: "GET", url: `/games/api/records/${id}`, headers: as("mum", "Мама") });
    expect(one.json()).toMatchObject({ id, reason: "checkmate", moves: FOOLS });
    expect((await app.inject({ method: "GET", url: `/games/api/records/${id}`, headers: as("dad", "Dad") })).statusCode).toBe(404);
  });

  it("refuses a game still on, a computer game without its level, and a guest", async () => {
    const on = { game: "chess", key: "game-key-0101", mode: "local", moves: [mv("e2e4")] };
    expect((await app.inject({ method: "POST", url: "/games/api/records", headers: as("mum", "Мама"), payload: on })).statusCode).toBe(400);
    const noLevel = { game: "chess", key: "game-key-0102", mode: "computer", moves: FOOLS };
    expect((await app.inject({ method: "POST", url: "/games/api/records", headers: as("mum", "Мама"), payload: noLevel })).statusCode).toBe(400);
    const asGuest = as("guest_abc123def456", "Alex", "guest", { "x-isputnik-guest-match": "m1234567890abcde" });
    expect((await app.inject({ method: "GET", url: "/games/api/records", headers: asGuest })).statusCode).toBe(403);
  });
});
