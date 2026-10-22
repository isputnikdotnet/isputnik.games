import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "../src/db.js";
import {
  MatchError,
  answerInvitation,
  cancelInvitation,
  createMatch,
  expireInvitations,
  getMatch,
  listMatches,
  playMove,
  rememberMember,
  resign
} from "../src/matches.js";

const mum = { id: "mum", name: "Мама" };
const dad = { id: "dad", name: "Dad" };
const kid = { id: "kid", name: "Kid" };

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
  rememberMember(db, mum);
  rememberMember(db, dad);
});

const invite = (seat: 0 | 1 = 0) =>
  createMatch(db, mum, { game: "dots", options: { size: 10, targetCaptures: 1 }, opponent: dad, seat });

describe("invitations", () => {
  it("creates an invitation the other player can accept", () => {
    const match = invite();
    expect(match.status).toBe("invited");
    expect(match.players.map((p) => p.id)).toEqual(["mum", "dad"]);
    expect(match.createdBy).toBe("mum");
    expect(match.turn).toBeNull();

    const accepted = answerInvitation(db, "dad", match.id, "accept");
    expect(accepted.status).toBe("playing");
    expect(accepted.turn).toBe(0);
  });

  it("gives the invited player the other seat, and names them before they visit", () => {
    const match = createMatch(db, mum, { game: "dots", options: { size: 10, targetCaptures: null }, opponent: kid, seat: 1 });
    expect(match.players[0]).toEqual({ id: "kid", name: "Kid" });
    expect(match.players[1]).toEqual({ id: "mum", name: "Мама" });
    // A visit of their own then sets the name the home app knows.
    rememberMember(db, { id: "kid", name: "Kiddo" });
    expect(getMatch(db, "kid", match.id).players[0].name).toBe("Kiddo");
  });

  it("refuses a self-invite, an unknown game and bad options", () => {
    expect(() => createMatch(db, mum, { game: "dots", options: { size: 10, targetCaptures: null }, opponent: mum, seat: 0 })).toThrow(MatchError);
    expect(() => createMatch(db, mum, { game: "chess", options: {}, opponent: dad, seat: 0 })).toThrow(MatchError);
    expect(() => createMatch(db, mum, { game: "dots", options: { size: 7, targetCaptures: null }, opponent: dad, seat: 0 })).toThrow(MatchError);
  });

  it("only the invited player answers; only the sender withdraws; once", () => {
    const match = invite();
    expect(() => answerInvitation(db, "mum", match.id, "accept")).toThrow(/other player/);
    expect(() => cancelInvitation(db, "dad", match.id)).toThrow(/sender/);
    expect(() => getMatch(db, "kid", match.id)).toThrow(/not found/);
    expect(answerInvitation(db, "dad", match.id, "decline").status).toBe("declined");
    expect(() => answerInvitation(db, "dad", match.id, "accept")).toThrow(/already/);

    const second = invite();
    expect(cancelInvitation(db, "mum", second.id).status).toBe("cancelled");
  });

  it("expires an invitation nobody answered", () => {
    const match = invite();
    db.prepare("UPDATE matches SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(match.id);
    expect(expireInvitations(db)).toBe(1);
    expect(listMatches(db, "dad").find((m) => m.id === match.id)).toBeUndefined();
  });
});

describe("playing", () => {
  it("accepts moves from the seat to move, in order, and refuses the rest", () => {
    const match = invite();
    answerInvitation(db, "dad", match.id, "accept");

    expect(() => playMove(db, "dad", match.id, { x: 1, y: 1 }, 0)).toThrow(/not your turn/);
    let detail = playMove(db, "mum", match.id, { x: 2, y: 1 }, 0);
    expect(detail.moveCount).toBe(1);
    expect(detail.turn).toBe(1);
    // A stale client (still at move 0) is refused rather than applied.
    expect(() => playMove(db, "dad", match.id, { x: 2, y: 2 }, 0)).toThrow(/moved on/);
    expect(() => playMove(db, "dad", match.id, { x: 2, y: 1 }, 1)).toThrow(/taken/);
    detail = playMove(db, "dad", match.id, { x: 2, y: 2 }, 1);
    expect(detail.score).toEqual([0, 0]);
  });

  it("finishes the match when the engine does, with the winner recorded", () => {
    const match = invite();
    answerInvitation(db, "dad", match.id, "accept");
    const moves: [string, { x: number; y: number }][] = [
      ["mum", { x: 2, y: 1 }], ["dad", { x: 2, y: 2 }], ["mum", { x: 1, y: 2 }], ["dad", { x: 8, y: 8 }],
      ["mum", { x: 3, y: 2 }], ["dad", { x: 8, y: 7 }], ["mum", { x: 2, y: 3 }]
    ];
    let detail = getMatch(db, "mum", match.id);
    for (const [who, move] of moves) detail = playMove(db, who, match.id, move, detail.moveCount);
    expect(detail.status).toBe("finished");
    expect(detail.finishReason).toBe("target");
    expect(detail.winner).toBe(0);
    expect(detail.score).toEqual([1, 0]);
    expect(detail.state.status).toEqual({ kind: "finished", winner: 0, reason: "target" });
    expect(() => playMove(db, "dad", match.id, { x: 5, y: 5 }, 7)).toThrow(/not being played/);
    // The stored record replays to the same end.
    expect(getMatch(db, "dad", match.id).state.status).toEqual({ kind: "finished", winner: 0, reason: "target" });
  });

  it("a resignation hands the win to the other seat and replays as such", () => {
    const match = invite(1);
    answerInvitation(db, "dad", match.id, "accept");
    playMove(db, "dad", match.id, { x: 4, y: 4 }, 0);
    const detail = resign(db, "dad", match.id);
    expect(detail.status).toBe("finished");
    expect(detail.winner).toBe(1);
    expect(detail.finishReason).toBe("resigned");
    expect(getMatch(db, "mum", match.id).state.status).toEqual({ kind: "finished", winner: 1, reason: "resigned" });
  });

  it("lists a player's matches newest first, both seats", () => {
    const a = invite();
    const b = createMatch(db, dad, { game: "dots", options: { size: 10, targetCaptures: null }, opponent: mum, seat: 0 });
    answerInvitation(db, "mum", b.id, "accept");
    const mine = listMatches(db, "mum");
    expect(mine.map((m) => m.id)).toEqual([b.id, a.id]);
    expect(listMatches(db, "kid")).toEqual([]);
  });
});
