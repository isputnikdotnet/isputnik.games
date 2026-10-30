import { describe, expect, it } from "vitest";
import { applyMove, createGame, legalMoves, parseMove, replay, type CheckersState } from "../src/checkers/rules.js";
import { chooseMove } from "../src/checkers/ai.js";
const square = (name: string) => (8 - Number(name[1])) * 8 + "abcdefgh".indexOf(name[0]!);
const path = (...names: string[]) => ({ path: names.map(square) });
function position(white: string[], black: string[], kings: string[] = []): CheckersState {
  const state = createGame();
  state.board.fill(null);
  for (const [player, names] of [
    [0, white],
    [1, black]
  ] as const)
    for (const name of names) state.board[square(name)] = { player, king: kings.includes(name) };
  return state;
}
describe("Russian draughts", () => {
  it("starts with twelve pieces each, a1 dark and White's seven opening moves", () => {
    const state = createGame();
    expect(state.board.filter((p) => p?.player === 0)).toHaveLength(12);
    expect(state.board.filter((p) => p?.player === 1)).toHaveLength(12);
    expect(state.board[square("a1")]?.player).toBe(0);
    expect(legalMoves(state)).toHaveLength(7);
    const next = applyMove(state, path("a3", "b4"));
    expect(next.status).toEqual({ kind: "playing", turn: 1 });
    expect(state.board[square("a3")]).not.toBeNull();
    expect(replay(next.moves)).toEqual(next);
  });
  it("requires backward captures and rejects a quiet move while any capture exists", () => {
    const s = position(["c5", "a3"], ["d4", "h8"]);
    expect(legalMoves(s)).toEqual([path("c5", "e3")]);
    expect(() => applyMove(s, path("a3", "b4"))).toThrow();
    expect(applyMove(s, path("c5", "e3")).board[square("d4")]).toBeNull();
  });
  it("requires a complete multi-jump and keeps a single turn for the sequence", () => {
    const s = position(["a3"], ["b4", "d6", "h8"]);
    expect(legalMoves(s)).toEqual([path("a3", "c5", "e7")]);
    expect(() => applyMove(s, path("a3", "c5"))).toThrow();
    expect(applyMove(s, path("a3", "c5", "e7")).status).toEqual({
      kind: "playing",
      turn: 1
    });
  });
  it("allows choosing a shorter complete capture instead of forcing a majority", () => {
    const moves = legalMoves(position(["c3"], ["b4", "d4", "f6"]));
    expect(moves).toContainEqual(path("c3", "a5"));
    expect(moves).toContainEqual(path("c3", "e5", "g7"));
  });
  it("crowns mid-capture and continues as a flying king", () => {
    const s = position(["b6"], ["c7", "f6", "h2"]);
    expect(legalMoves(s)).toContainEqual(path("b6", "d8", "g5"));
    const next = applyMove(s, path("b6", "d8", "g5"));
    expect(next.board[square("g5")]).toEqual({ player: 0, king: true });
    expect(next.board[square("c7")]).toBeNull();
  });
  it("lets kings land on any free square beyond a distant enemy", () => {
    const moves = legalMoves(position(["a1"], ["d4"], ["a1"]));
    for (const to of ["e5", "f6", "g7", "h8"]) expect(moves).toContainEqual(path("a1", to));
  });
  it("makes a capturing king stop where it can go on capturing", () => {
    // After taking c3 the king may land d4–g7, but only from e5 can it take f4.
    expect(legalMoves(position(["a1"], ["c3", "f4", "h8"], ["a1"]))).toEqual([path("a1", "e5", "g3"), path("a1", "e5", "h2")]);
    expect(() => applyMove(position(["a1"], ["c3", "f4", "h8"], ["a1"]), path("a1", "d4"))).toThrow();
    // Deeper in a chain: after c3 it must stop on b4, not a5; after c5 on d6,
    // not e7 or f8, since only those squares let it go on capturing.
    const chain = legalMoves(position(["e1"], ["c3", "c5", "e5", "e3", "h8"], ["e1"]));
    expect(chain).not.toContainEqual(path("e1", "a5"));
    expect(chain).not.toContainEqual(path("e1", "b4", "e7"));
    expect(chain).not.toContainEqual(path("e1", "b4", "f8"));
    expect(chain.every((m) => m.path.slice(0, 3).join() === path("e1", "b4", "d6").path.join())).toBe(true);
  });
  it("does not cross a captured piece again before the sequence ends", () => {
    const moves = legalMoves(position(["c3"], ["b2", "e5"], ["c3"]));
    expect(moves).toContainEqual(path("c3", "a1"));
    expect(moves).toContainEqual(path("c3", "f6"));
    expect(moves.every((m) => m.path.length === 2)).toBe(true);
  });
  it("wins by taking the final piece or leaving the opponent blocked", () => {
    expect(applyMove(position(["a3"], ["b4"]), path("a3", "c5")).status).toMatchObject({ kind: "finished", winner: 0 });
    expect(applyMove(position(["a3"], ["a1"]), path("a3", "b4")).status).toMatchObject({ kind: "finished", winner: 0 });
  });
  it("draws on a third occurrence with the same player to move", () => {
    let s = position(["a1"], ["h6"], ["a1", "h6"]);
    const cycle = [path("a1", "b2"), path("h6", "g5"), path("b2", "a1"), path("g5", "h6")];
    // Custom test positions have no initial position hash; record it on the first cycle.
    for (let i = 0; i < 3 && s.status.kind === "playing"; i++)
      for (const m of cycle) {
        if (s.status.kind === "playing") s = applyMove(s, m);
      }
    expect(s.status).toMatchObject({
      kind: "finished",
      winner: null,
      reason: "repetition"
    });
  });
  it("rejects malformed wire moves", () => {
    for (const bad of [null, {}, { path: [1] }, { path: [1, 64] }, { path: [0, 9] }, { path: [1, "2"] }])
      expect(() => parseMove(bad)).toThrow();
  });
  it("all computer levels choose legal moves and prefer an immediate win", () => {
    const s = position(["a3"], ["b4"]);
    for (const level of ["easy", "normal", "hard"] as const)
      expect(chooseMove(s, level, () => 0.5)).toEqual(path("a3", "c5"));
  });
});
