import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "../src/db.js";
import { answerInvitation, createMatch, rememberMember, resign } from "../src/matches.js";
import { recordComputerResult, familyStats } from "../src/stats.js";
import { CHESS_START_RATING, PROVISIONAL_GAMES, chessRatingOf, chessRatings } from "../src/chess-rating.js";

const mum = { id: "mum", name: "Мама" };
const dad = { id: "dad", name: "Dad" };
const guest = { id: "guest_abc123def456", name: "Alex" };

let db: Db;
let keys = 0;
beforeEach(() => {
  db = openDatabase(":memory:");
  for (const member of [mum, dad]) rememberMember(db, member);
});

function vsComputer(member: string, level: "easy" | "normal" | "hard", result: "won" | "lost" | "drawn", game = "chess") {
  recordComputerResult(db, member, { game, level, result, key: `game-key-${String(++keys).padStart(4, "0")}` });
}

function online(white: typeof mum, black: typeof mum, loser: typeof mum) {
  const match = createMatch(db, white, { game: "chess", options: {}, opponent: black, seat: 0 });
  answerInvitation(db, black.id, match.id, "accept");
  resign(db, loser.id, match.id);
}

describe("chess rating", () => {
  it("starts at 1000, provisional, before any game", () => {
    expect(chessRatingOf(db, "mum")).toEqual({ rating: CHESS_START_RATING, games: 0, provisional: true, change: null });
  });

  it("counts the computer's level as the opponent's rating", () => {
    vsComputer("mum", "hard", "won");
    const afterHard = chessRatingOf(db, "mum");
    expect(afterHard.games).toBe(1);
    expect(afterHard.change).toBeGreaterThan(20); // beating a 1500 from 1000 is worth a lot
    vsComputer("dad", "easy", "won");
    expect(chessRatingOf(db, "dad").change!).toBeLessThan(10); // beating a 600 is worth little
    vsComputer("dad", "easy", "lost");
    expect(chessRatingOf(db, "dad").change!).toBeLessThan(-30);
  });

  it("ignores other games against the computer", () => {
    vsComputer("mum", "hard", "won", "dots");
    expect(chessRatings(db).has("mum")).toBe(false);
  });

  it("moves both members in an online game, and skips a guest", () => {
    online(mum, dad, dad);
    const ratings = chessRatings(db);
    expect(ratings.get("mum")).toMatchObject({ rating: 1020, games: 1, change: 20 });
    expect(ratings.get("dad")).toMatchObject({ rating: 980, games: 1, change: -20 });
    rememberMember(db, guest);
    const match = createMatch(db, mum, { game: "chess", options: {}, opponent: guest, seat: 0 });
    answerInvitation(db, guest.id, match.id, "accept");
    resign(db, guest.id, match.id);
    expect(chessRatings(db).get("mum")?.games).toBe(1);
  });

  it("settles after the provisional games", () => {
    for (let i = 0; i < PROVISIONAL_GAMES; i++) vsComputer("mum", "normal", i % 2 ? "won" : "lost");
    expect(chessRatingOf(db, "mum")).toMatchObject({ games: PROVISIONAL_GAMES, provisional: false });
  });

  it("is on the family stats", () => {
    vsComputer("mum", "normal", "drawn");
    expect(familyStats(db, "mum").chessRatings).toEqual([expect.objectContaining({ id: "mum", name: "Мама", games: 1 })]);
  });
});
