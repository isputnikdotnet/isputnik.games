import { describe, expect, it } from "vitest";
import { Chess, chess, clockRunning, flagged, parseTimeControl, timeLeft } from "../src/index.js";

const blitz = { minutes: 3, increment: 2 };

describe("the chess clock", () => {
  it("lets each side's first move go free, then counts and adds the increment", () => {
    expect(timeLeft(blitz, [])).toEqual([180_000, 180_000]);
    // The first two moves cost nothing however long they took; each still earns the increment.
    expect(timeLeft(blitz, [40_000, 90_000])).toEqual([182_000, 182_000]);
    expect(clockRunning(1)).toBe(false);
    expect(clockRunning(2)).toBe(true);
    // White's second move took 10 s; Black has been thinking 5 s on theirs.
    expect(timeLeft(blitz, [0, 0, 10_000], 5_000)).toEqual([174_000, 177_000]);
  });

  it("says who ran out: only the side to move, and only once the clock runs", () => {
    expect(flagged(blitz, [0], 999_999)).toBeNull();
    expect(flagged(blitz, [0, 0], 181_999)).toBeNull();
    expect(flagged(blitz, [0, 0], 182_000)).toBe(0);
    expect(flagged(blitz, [0, 0, 1_000], 182_000)).toBe(1);
  });

  it("is offered only in the listed controls", () => {
    expect(parseTimeControl(undefined)).toBeNull();
    expect(parseTimeControl({ minutes: 5, increment: 0 })).toEqual({ minutes: 5, increment: 0 });
    expect(() => parseTimeControl({ minutes: 2, increment: 0 })).toThrow();
    expect(chess.parseOptions({ clock: { minutes: 1, increment: 0 }, extra: 1 })).toEqual({ clock: { minutes: 1, increment: 0 } });
    expect(chess.parseOptions({})).toEqual({});
    expect(chess.clockOf!({ clock: blitz })).toEqual(blitz);
  });
});

describe("losing on time", () => {
  it("gives the game to the other side", () => {
    const state = Chess.replay([{ from: "e2", to: "e4" }, { from: "e7", to: "e5" }]);
    expect(Chess.timeout(state, 0).status).toEqual({ kind: "finished", winner: 1, reason: "timeout" });
  });

  it("is a draw when the other side could never mate", () => {
    // White: king and pawn; Black: a bare king. Black flags: White wins. White flags: a draw.
    const state = Chess.fromFen("8/8/4k3/8/8/8/4P3/4K3 w - - 0 1");
    expect(Chess.timeout(state, 1).status).toMatchObject({ winner: 0 });
    expect(Chess.timeout(state, 0).status).toMatchObject({ winner: null, reason: "timeout" });
    // A lone knight mates only with the other side's own pieces in the way.
    const knight = Chess.fromFen("8/8/4k3/8/8/8/4N3/4K3 w - - 0 1");
    expect(Chess.timeout(knight, 1).status).toMatchObject({ winner: null });
    const crowded = Chess.fromFen("8/8/4k3/4p3/8/8/4N3/4K3 w - - 0 1");
    expect(Chess.timeout(crowded, 1).status).toMatchObject({ winner: 0 });
  });
});
