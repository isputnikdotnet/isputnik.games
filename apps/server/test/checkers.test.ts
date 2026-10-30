import { describe, expect, it } from "vitest";
import { Checkers, type CheckersState } from "@isputnik/games-engine";
import { openDatabase } from "../src/db.js";
import { createMatch, answerInvitation, playMove, getMatch, resign } from "../src/matches.js";
describe("online checkers", () => {
  it("invites, accepts, validates turns, replays moves and resigns", () => {
    const db = openDatabase(":memory:");
    try {
      const match = createMatch(
        db,
        { id: "w", name: "White" },
        {
          game: "checkers",
          options: {},
          opponent: { id: "b", name: "Black" },
          seat: 0
        }
      );
      expect(answerInvitation(db, "b", match.id, "accept").turn).toBe(0);
      expect(() => playMove(db, "b", match.id, { path: [17, 24] }, 0)).toThrow(/turn/);
      const next = playMove(db, "w", match.id, { path: [40, 33] }, 0);
      expect(next.turn).toBe(1);
      expect(next.feed[0]).toMatchObject({ by: 0, notation: "a3–b4" });
      expect((getMatch(db, "b", match.id).state as CheckersState).board).toEqual(
        Checkers.applyMove(Checkers.createGame(), { path: [40, 33] }).board
      );
      expect(() => playMove(db, "b", match.id, { path: [17, 24] }, 0)).toThrow(/moved on/);
      expect(resign(db, "b", match.id).winner).toBe(0);
    } finally {
      db.close();
    }
  });
});
