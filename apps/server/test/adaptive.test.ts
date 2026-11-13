import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "@isputnik/games-engine";
import { openDatabase, upgradeDatabase, type Db } from "../src/db.js";
import { rememberMember } from "../src/matches.js";
import { recordComputerResult } from "../src/stats.js";
import { puzzleSet, recordPuzzleResult } from "../src/puzzles.js";
import { ADAPTIVE_GAMES, CHESS_START_RATING, PUZZLE_OFFSET, adaptiveStrength, chessRatingOf } from "../src/chess-rating.js";

let db: Db;
let keys = 0;
beforeEach(() => {
  db = openDatabase(":memory:");
  rememberMember(db, { id: "mum", name: "Мама" });
});

const vs = (result: "won" | "lost", strength?: number, level: "easy" | "normal" | "hard" = "normal") =>
  recordComputerResult(db, "mum", { game: "chess", level, result, key: `adaptive-key-${String(++keys).padStart(4, "0")}`, ...(strength === undefined ? {} : { strength }) });

describe("the computer at a strength", () => {
  it("is rated at its strength, not at the named level it was filed under", () => {
    // A win over strength 100 (1800) moves the rating far more than one over Normal (1100).
    vs("won", 100, "hard");
    const strong = chessRatingOf(db, "mum").change!;
    db = openDatabase(":memory:");
    rememberMember(db, { id: "mum", name: "Мама" });
    vs("won");
    const normal = chessRatingOf(db, "mum").change!;
    expect(strong).toBeGreaterThan(normal);
    expect(db.prepare("SELECT strength FROM computer_results").get()).toEqual({ strength: null });
  });

  it("adds its column to a database made before it", () => {
    const old = openDatabase(":memory:");
    old.exec("ALTER TABLE computer_results DROP COLUMN strength");
    upgradeDatabase(old);
    const names = (old.prepare("PRAGMA table_info(computer_results)").all() as { name: string }[]).map((c) => c.name);
    expect(names).toContain("strength");
  });
});

describe("the adaptive computer", () => {
  it("starts at the starting rating for someone new", () => {
    expect(adaptiveStrength(db, "mum")).toEqual({
      strength: Chess.strengthFor(CHESS_START_RATING), elo: Chess.strengthElo(Chess.strengthFor(CHESS_START_RATING)), source: "start", target: CHESS_START_RATING
    });
  });

  it("goes by the puzzle rating until there are games, a little below it", () => {
    for (const puzzle of puzzleSet().slice(0, 5)) recordPuzzleResult(db, "mum", puzzle.id, { solved: true, hints: 0 });
    const puzzleRating = (db.prepare("SELECT rating_after FROM puzzle_attempts ORDER BY id DESC LIMIT 1").get() as { rating_after: number }).rating_after;
    const adaptive = adaptiveStrength(db, "mum");
    expect(adaptive.source).toBe("puzzles");
    expect(adaptive.target).toBe(puzzleRating - PUZZLE_OFFSET);
  });

  it("follows the chess rating once there are games: up after wins, down after losses", () => {
    for (let i = 0; i < ADAPTIVE_GAMES; i++) vs("won", 50);
    const up = adaptiveStrength(db, "mum");
    expect(up.source).toBe("games");
    expect(up.target).toBe(chessRatingOf(db, "mum").rating);
    expect(up.strength).toBeGreaterThan(Chess.strengthFor(CHESS_START_RATING));
    for (let i = 0; i < 6; i++) vs("lost", up.strength);
    expect(adaptiveStrength(db, "mum").strength).toBeLessThan(up.strength);
  });
});
