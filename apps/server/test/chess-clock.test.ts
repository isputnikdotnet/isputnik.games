import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, upgradeDatabase, type Db } from "../src/db.js";
import { answerInvitation, createMatch, getMatch, listMatches, playMove, rememberMember } from "../src/matches.js";

const mum = { id: "mum", name: "Мама" };
const dad = { id: "dad", name: "Dad" };
const T0 = Date.parse("2026-11-13T10:00:00.000Z");

let db: Db;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  db = openDatabase(":memory:");
  rememberMember(db, mum);
  rememberMember(db, dad);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Moves the clock on, and the database's "now" with it (strftime reads the real clock). */
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);

/** A 1-minute chess match, mum White, accepted, with both free first moves played. */
function bullet() {
  const created = createMatch(db, mum, { game: "chess", options: { clock: { minutes: 1, increment: 0 } }, opponent: dad, seat: 0 });
  answerInvitation(db, "dad", created.id, "accept");
  // The database stamps the turn with its own clock; pin it to the test's.
  db.prepare("UPDATE matches SET turn_started_at = ? WHERE id = ?").run(new Date(Date.now()).toISOString(), created.id);
  playMove(db, "mum", created.id, { from: "e2", to: "e4" }, 0);
  playMove(db, "dad", created.id, { from: "e7", to: "e5" }, 1);
  return created.id;
}

describe("chess on the clock, online", () => {
  it("keeps the clock in the options and starts it after one move each", () => {
    const created = createMatch(db, mum, { game: "chess", options: { clock: { minutes: 3, increment: 2 }, junk: 1 }, opponent: dad, seat: 0 });
    expect(created.options).toEqual({ clock: { minutes: 3, increment: 2 } });
    answerInvitation(db, "dad", created.id, "accept");
    const fresh = getMatch(db, "mum", created.id);
    expect(fresh.clock).toEqual({ control: { minutes: 3, increment: 2 }, left: [180_000, 180_000], running: null });
  });

  it("charges each move to its side, as the server timed it", () => {
    const id = bullet();
    wait(10_000);
    const after = playMove(db, "mum", id, { from: "g1", to: "f3" }, 2);
    expect(after.clock?.left[0]).toBe(50_000);
    expect(after.clock?.running).toBe(1);
    wait(4_000);
    expect(getMatch(db, "mum", id).clock?.left).toEqual([50_000, 56_000]);
  });

  it("ends the match on time when it is read after the flag fell", () => {
    const id = bullet();
    wait(60_001);
    const seen = getMatch(db, "dad", id);
    expect(seen.status).toBe("finished");
    expect(seen.finishReason).toBe("timeout");
    expect(seen.winner).toBe(1);
    expect(seen.state.status).toEqual({ kind: "finished", winner: 1, reason: "timeout" });
    expect(listMatches(db, "mum")[0]).toMatchObject({ status: "finished", finishReason: "timeout" });
  });

  it("does not play a move that arrives after the flag fell", () => {
    const id = bullet();
    wait(61_000);
    const answer = playMove(db, "mum", id, { from: "g1", to: "f3" }, 2);
    expect(answer.status).toBe("finished");
    expect(answer.moveCount).toBe(2);
    expect(answer.winner).toBe(1);
  });

  it("leaves a match without a clock alone, however long it waits", () => {
    const created = createMatch(db, mum, { game: "chess", options: {}, opponent: dad, seat: 0 });
    answerInvitation(db, "dad", created.id, "accept");
    wait(30 * 86_400_000);
    const match = getMatch(db, "mum", created.id);
    expect(match.status).toBe("playing");
    expect(match.clock).toBeUndefined();
  });

  it("adds the clock's columns to a database made before them", () => {
    const old = openDatabase(":memory:");
    old.exec("ALTER TABLE matches DROP COLUMN move_times; ALTER TABLE matches DROP COLUMN turn_started_at;");
    upgradeDatabase(old);
    const names = (old.prepare("PRAGMA table_info(matches)").all() as { name: string }[]).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["move_times", "turn_started_at"]));
  });
});
