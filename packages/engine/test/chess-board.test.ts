import { describe, expect, it } from "vitest";
import { Position, START_FEN, perft, squareIndex } from "../src/chess/board.js";

// The published perft numbers (chessprogramming.org → Perft Results): every
// rule a move generator can get wrong — castling through check, en passant
// that uncovers a check, promotions, pins — shows up in these counts.
const CASES: { name: string; fen: string; counts: number[] }[] = [
  { name: "the start", fen: START_FEN, counts: [20, 400, 8902, 197281] },
  {
    name: "Kiwipete",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    counts: [48, 2039, 97862]
  },
  { name: "position 3", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", counts: [14, 191, 2812, 43238, 674624] },
  {
    name: "position 4",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    counts: [6, 264, 9467, 422333]
  },
  { name: "position 5", fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", counts: [44, 1486, 62379] },
  {
    name: "position 6",
    fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    counts: [46, 2079, 89890]
  }
];

describe("move generation", () => {
  for (const { name, fen, counts } of CASES) {
    it(`counts ${name} to depth ${counts.length}`, () => {
      const position = Position.fromFen(fen);
      counts.forEach((count, i) => expect(perft(position, i + 1)).toBe(count));
      // make/unmake left the position as it found it.
      expect(position.fen()).toBe(Position.fromFen(fen).fen());
    });
  }
});

describe("positions", () => {
  it("round-trips a FEN", () => {
    expect(Position.fromFen(START_FEN).fen()).toBe(START_FEN);
  });

  it("writes standard notation", () => {
    const position = Position.fromFen("r3k2r/8/8/8/8/8/8/R3K1NR w KQkq - 0 1");
    const san = position.legalMoves().map((move) => position.san(move));
    expect(san).toContain("O-O-O");
    // The g1 knight stands in the way of short castling and of the h1 rook.
    expect(san).toContain("Rd1");
    expect(san).toContain("Rxa8+");
  });

  it("names the file or rank when two knights can reach a square", () => {
    const position = Position.fromFen("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1");
    const sans = position.legalMoves().map((move) => position.san(move));
    expect(sans).toContain("Nbd2");
    expect(sans).toContain("Nfd2");
    expect(sans).toContain("Ng3");
    const stacked = Position.fromFen("4k3/8/8/8/8/1N6/8/1N2K3 w - - 0 1");
    const ranks = stacked.legalMoves().map((move) => stacked.san(move));
    expect(ranks).toContain("N1d2");
    expect(ranks).toContain("N3d2");
  });

  it("marks a mate", () => {
    const position = Position.fromFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    const mate = position.legalMoves().find((move) => position.san(move) === "Ra8#");
    expect(mate).toBeDefined();
  });

  it("only keeps the en passant square in the repetition key when a pawn can take", () => {
    const quiet = Position.fromFen("4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1");
    expect(quiet.repetitionKey()).toMatch(/ -$/);
    const live = Position.fromFen("4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
    expect(live.repetitionKey()).toMatch(/ e3$/);
  });

  it("knows when nobody can mate", () => {
    expect(Position.fromFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1").insufficientMaterial()).toBe(true);
    expect(Position.fromFen("4k3/8/8/8/8/8/8/4KN2 w - - 0 1").insufficientMaterial()).toBe(true);
    // Bishops on squares of one colour: c1 and f8 are both dark.
    expect(Position.fromFen("5b2/4k3/8/8/8/8/8/2B1K3 w - - 0 1").insufficientMaterial()).toBe(true);
    expect(Position.fromFen("k3b3/8/8/8/8/8/8/2B1K3 w - - 0 1").insufficientMaterial()).toBe(false);
    expect(Position.fromFen("4k3/8/8/8/8/8/8/3NKN2 w - - 0 1").insufficientMaterial()).toBe(false);
    expect(Position.fromFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1").insufficientMaterial()).toBe(false);
  });

  it("reads square names", () => {
    expect(squareIndex("a1")).toBe(0);
    expect(squareIndex("h8")).toBe(63);
    expect(squareIndex("e4")).toBe(28);
    expect(squareIndex("i9")).toBe(-1);
  });
});
