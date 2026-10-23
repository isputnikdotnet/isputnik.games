import { describe, expect, it } from "vitest";
import { IllegalMoveError, narrateMoves } from "../src/game.js";
import { chess } from "../src/chess/index.js";
import {
  applyMove,
  createGame,
  finish,
  fromFen,
  isPromotion,
  legalMoves,
  material,
  parseMove,
  parseOptions,
  replay,
  sanList,
  targetsFrom,
  toFen,
  undoMove,
  type ChessMove,
  type ChessState
} from "../src/chess/rules.js";

const m = (from: string, to: string, promotion?: ChessMove["promotion"]): ChessMove => (promotion ? { from, to, promotion } : { from, to });

function play(state: ChessState, ...moves: string[]): ChessState {
  for (const move of moves) state = applyMove(state, m(move.slice(0, 2), move.slice(2, 4), (move[4] as ChessMove["promotion"]) || undefined));
  return state;
}

describe("a game of chess", () => {
  it("starts with White to move and twenty moves", () => {
    const state = createGame();
    expect(state.status).toEqual({ kind: "playing", turn: 0 });
    expect(legalMoves(state)).toHaveLength(20);
    expect(toFen(state)).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  });

  it("ends in checkmate", () => {
    const state = play(createGame(), "e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7");
    expect(state.check).toBe(true);
    expect(state.status).toEqual({ kind: "finished", winner: 0, reason: "checkmate" });
    expect(legalMoves(state)).toEqual([]);
    expect(() => applyMove(state, m("e8", "f7"))).toThrow(IllegalMoveError);
  });

  it("ends in stalemate", () => {
    const state = play(fromFen("7k/8/6Q1/8/8/8/8/K7 w - - 0 1"), "g6f7");
    expect(state.status).toEqual({ kind: "finished", winner: null, reason: "stalemate" });
  });

  it("is drawn on the third repetition", () => {
    let state = createGame();
    state = play(state, "g1f3", "g8f6", "f3g1", "f6g8");
    expect(state.status.kind).toBe("playing");
    state = play(state, "g1f3", "g8f6", "f3g1");
    expect(state.status.kind).toBe("playing");
    state = play(state, "f6g8");
    expect(state.status).toEqual({ kind: "finished", winner: null, reason: "repetition" });
  });

  it("forgets the old positions after a pawn move", () => {
    let state = play(createGame(), "g1f3", "g8f6", "f3g1", "f6g8", "e2e3");
    expect(state.history).toHaveLength(1);
    state = play(state, "g8f6", "g1f3", "f6g8", "f3g1", "g8f6", "g1f3", "f6g8");
    expect(state.status.kind).toBe("playing");
  });

  it("is drawn after fifty moves each without a capture or a pawn move", () => {
    const state = fromFen("4k3/8/8/8/8/8/R7/4K3 w - - 99 80");
    expect(play(state, "a2a3").status).toEqual({ kind: "finished", winner: null, reason: "fifty-moves" });
  });

  it("is drawn when the last piece that could mate is taken", () => {
    const state = play(fromFen("4k3/8/8/8/8/8/3r4/4KB2 w - - 0 1"), "e1d2");
    expect(state.status).toEqual({ kind: "finished", winner: null, reason: "material" });
  });

  it("asks which piece a pawn becomes, and makes it", () => {
    const state = fromFen("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1");
    expect(isPromotion(state, "e7", "e8")).toBe(true);
    expect(() => applyMove(state, m("e7", "e8"))).toThrow(/Choose the piece/);
    const knight = applyMove(state, m("e7", "e8", "n"));
    expect(knight.board[60]).toBe("N");
    expect(() => applyMove(createGame(), m("e2", "e4", "q"))).toThrow(IllegalMoveError);
  });

  it("takes en passant, and only at once", () => {
    let state = play(createGame(), "e2e4", "a7a6", "e4e5", "d7d5");
    expect(state.enPassant).toBe("d6");
    expect(targetsFrom(state, "e5")).toContain("d6");
    const taken = play(state, "e5d6");
    expect(taken.board[35]).toBe("."); // d5
    state = play(state, "a2a3", "a6a5");
    expect(targetsFrom(state, "e5")).not.toContain("d6");
  });

  it("castles, and loses the right when the king or a rook moves", () => {
    let state = play(createGame(), "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6");
    expect(targetsFrom(state, "e1")).toContain("g1");
    const castled = play(state, "e1g1");
    expect(castled.board.slice(4, 8)).toBe(".RK.");
    expect(castled.castling).toBe("kq");
    state = play(state, "h1g1", "f8e7", "g1h1", "e8g8");
    // The h1 rook went and came back: only the long way is left, and Black has castled.
    expect(state.castling).toBe("Q");
    expect(targetsFrom(state, "e1")).not.toContain("g1");
  });

  it("keeps the move list and takes moves back", () => {
    const state = play(createGame(), "e2e4", "e7e5");
    expect(state.moves).toEqual([m("e2", "e4"), m("e7", "e5")]);
    expect(undoMove(state).moves).toEqual([m("e2", "e4")]);
    expect(replay(state.moves)).toEqual(state);
  });

  it("writes the game in standard notation", () => {
    const moves = play(createGame(), "e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7").moves;
    expect(sanList(moves)).toEqual(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
  });

  it("narrates each move for the log", () => {
    const moves = play(createGame(), "e2e4", "d7d5", "e4d5").moves;
    const { events } = narrateMoves(chess, {}, moves);
    expect(events.map((event) => event.san)).toEqual(["e4", "d5", "exd5"]);
    expect(events[2]).toMatchObject({ by: 0, kind: "move", number: 2, capture: true, check: false });
    expect(events[1]).toMatchObject({ by: 1, number: 1 });
  });

  it("counts the pieces taken", () => {
    const state = play(createGame(), "e2e4", "d7d5", "e4d5", "d8d5");
    expect(material(state)).toEqual({ taken: ["p", "p"], points: [38, 38] });
  });

  it("ends early by agreement or resignation", () => {
    const state = createGame();
    expect(finish(state, "agreed").status).toEqual({ kind: "finished", winner: null, reason: "agreed" });
    expect(finish(state, "resigned", 0).status).toEqual({ kind: "finished", winner: 1, reason: "resigned" });
  });

  it("reads only what a move and the options say", () => {
    expect(parseMove({ from: "e2", to: "e4", note: "hello" })).toEqual({ from: "e2", to: "e4" });
    expect(parseMove({ from: "e7", to: "e8", promotion: "q" })).toEqual({ from: "e7", to: "e8", promotion: "q" });
    expect(() => parseMove({ from: "e2", to: "e9" })).toThrow(IllegalMoveError);
    expect(() => parseMove({ from: "e7", to: "e8", promotion: "k" })).toThrow(IllegalMoveError);
    expect(() => parseMove("e2e4")).toThrow(IllegalMoveError);
    expect(parseOptions({ anything: 1 })).toEqual({});
  });
});
