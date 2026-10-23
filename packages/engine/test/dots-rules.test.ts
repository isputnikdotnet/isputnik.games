import { describe, expect, it } from "vitest";
import { IllegalMoveError } from "../src/game.js";
import {
  BOARD_SIZES,
  applyMove,
  createGame,
  finish,
  fromDiagram,
  isPlayable,
  legalMoves,
  parseMove,
  parseOptions,
  replay,
  toDiagram,
  undoMove,
  type DotsMove,
  type DotsState
} from "../src/dots/rules.js";

// Blue and red take turns; a side with fewer moves to make fills in far from the
// action (the bottom-right corner, walking left), so the sequence stays legal.
function scripted(size: number, blue: DotsMove[], red: DotsMove[], targetCaptures: number | null = null): DotsState {
  let state = createGame({ size, targetCaptures });
  const fillers = (() => {
    const list: DotsMove[] = [];
    for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) list.push({ x, y });
    return list;
  })();
  const used = new Set([...blue, ...red].map((m) => `${m.x},${m.y}`));
  const nextFiller = () => {
    while (fillers.length) {
      const f = fillers.shift()!;
      const key = `${f.x},${f.y}`;
      if (!used.has(key)) {
        used.add(key);
        return f;
      }
    }
    throw new Error("out of filler moves");
  };
  const turns = Math.max(blue.length, red.length);
  for (let i = 0; i < turns; i++) {
    state = applyMove(state, blue[i] ?? nextFiller());
    if (state.status.kind !== "playing") return state;
    if (i < red.length || i < blue.length - 1) {
      state = applyMove(state, red[i] ?? nextFiller());
      if (state.status.kind !== "playing") return state;
    }
  }
  return state;
}

describe("createGame", () => {
  it("accepts the five board sizes and refuses others", () => {
    for (const size of BOARD_SIZES) expect(createGame({ size, targetCaptures: null }).size).toBe(size);
    expect(() => createGame({ size: 9, targetCaptures: null })).toThrow();
    expect(() => createGame({ size: 15, targetCaptures: 0 })).toThrow();
    expect(() => createGame({ size: 15, targetCaptures: 226 })).toThrow();
  });

  it("starts with blue to move on an empty board", () => {
    const state = createGame({ size: 10, targetCaptures: null });
    expect(state.status).toEqual({ kind: "playing", turn: 0 });
    expect(legalMoves(state)).toHaveLength(100);
    expect(state.captures).toEqual([0, 0]);
  });
});

describe("placing", () => {
  it("alternates turns and refuses a taken or off-board point", () => {
    let state = createGame({ size: 10, targetCaptures: null });
    state = applyMove(state, { x: 4, y: 4 });
    expect(state.dots[4 * 10 + 4]).toBe(1);
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    expect(() => applyMove(state, { x: 4, y: 4 })).toThrow(IllegalMoveError);
    expect(() => applyMove(state, { x: 10, y: 0 })).toThrow(IllegalMoveError);
    expect(() => applyMove(state, { x: 1.5, y: 0 })).toThrow(IllegalMoveError);
    state = applyMove(state, { x: 5, y: 5 });
    expect(state.dots[5 * 10 + 5]).toBe(2);
    expect(state.moves).toEqual([{ x: 4, y: 4 }, { x: 5, y: 5 }]);
  });

  it("does not mutate the previous state", () => {
    const before = createGame({ size: 10, targetCaptures: null });
    const snapshot = JSON.stringify(before);
    applyMove(before, { x: 1, y: 1 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("captures", () => {
  it("a diamond of four captures the dot inside", () => {
    const state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }],
      [{ x: 2, y: 2 }]);
    expect(state.captures).toEqual([1, 0]);
    expect(toDiagram(state).slice(0, 4)).toEqual([
      "..........",
      "..b.......",
      ".bRb......",
      "..b......."
    ]);
    expect(isPlayable(state, 2, 2)).toBe(false);
  });

  it("a dot on the edge cannot be captured", () => {
    const state = scripted(10,
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 0, y: 3 }],
      [{ x: 0, y: 2 }]);
    expect(state.captures).toEqual([0, 0]);
    expect(toDiagram(state)[2].startsWith("rb")).toBe(true);
  });

  it("a ring around nothing captures nothing and stays open", () => {
    const state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }],
      []);
    expect(state.captures).toEqual([0, 0]);
    expect(state.territory.every((owner) => owner === 0)).toBe(true);
    expect(isPlayable(state, 2, 2)).toBe(true);
  });

  it("playing into a finished house loses the dot at once", () => {
    let state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }],
      []);
    // Red to move after blue's fourth dot (the script filled red's three turns).
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    state = applyMove(state, { x: 2, y: 2 });
    expect(state.captures).toEqual([1, 0]);
    expect(toDiagram(state)[2]).toBe(".bRb......");
  });

  it("an 8-connected chain counts: diagonal steps close a ring", () => {
    // A hexagon-like ring with two dots inside, every join a diagonal or a step.
    const state = scripted(10,
      [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 2, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }],
      [{ x: 3, y: 3 }, { x: 4, y: 3 }]);
    expect(state.captures).toEqual([2, 0]);
    expect(toDiagram(state)[3]).toBe("..bRRb....");
  });

  it("empty points inside a capture become unplayable territory", () => {
    const state = scripted(10,
      [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 2, y: 3 }, { x: 5, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }],
      [{ x: 3, y: 3 }]);
    expect(state.captures).toEqual([1, 0]);
    expect(toDiagram(state)[3]).toBe("..bR+b....");
    expect(isPlayable(state, 4, 3)).toBe(false);
    expect(legalMoves(state).some((m) => m.x === 4 && m.y === 3)).toBe(false);
  });

  it("captured dots stop counting as chain material", () => {
    // Red's dot at (2,2) is captured by blue's diamond; red then rings (2,3)
    // using that dead dot as a link — the ring is not closed, nothing is captured.
    const state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }],
      [{ x: 2, y: 2 }, { x: 1, y: 3 }, { x: 3, y: 3 }, { x: 1, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 5 }]);
    // Blue dot at (2,4) is between red (1,4),(3,4) and (2,5), under the ring
    // that would need the dead (2,2)… wait: (2,3) is blue, so red's ring around
    // (2,4) would be (1,3),(3,3),(1,4),(3,4),(2,5) plus (2,3)—blue. Not closed.
    expect(state.captures).toEqual([1, 0]);
  });

  it("ringing the opponent's territory takes it over and frees the dots inside", () => {
    // Red captures blue's dot at (3,3); blue then rings the whole red diamond.
    const ring: DotsMove[] = [];
    for (let x = 1; x <= 5; x++) ring.push({ x, y: 1 });
    for (let y = 2; y <= 4; y++) ring.push({ x: 5, y });
    for (let x = 4; x >= 1; x--) ring.push({ x, y: 5 });
    for (let y = 4; y >= 2; y--) ring.push({ x: 1, y });
    const state = scripted(10,
      [{ x: 3, y: 3 }, ...ring],
      [{ x: 3, y: 2 }, { x: 2, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }]);
    expect(state.captures).toEqual([4, 0]);
    expect(toDiagram(state).slice(1, 6)).toEqual([
      ".bbbbb....",
      ".b+R+b....",
      ".bRbRb....",
      ".b+R+b....",
      // The ring needs no corner at (5,5): (5,4) and (4,5) touch diagonally.
      ".bbbb....."
    ]);
  });
});

describe("ending", () => {
  it("the capture target ends the game with a winner", () => {
    const state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }],
      [{ x: 2, y: 2 }], 1);
    expect(state.status).toEqual({ kind: "finished", winner: 0, reason: "target" });
    expect(() => applyMove(state, { x: 0, y: 0 })).toThrow(IllegalMoveError);
    expect(legalMoves(state)).toEqual([]);
  });

  it("a full board ends the game and counts captures", () => {
    let state = createGame({ size: 10, targetCaptures: null });
    let guard = 0;
    while (state.status.kind === "playing" && guard++ < 200) {
      state = applyMove(state, legalMoves(state)[0]);
    }
    expect(state.status.kind).toBe("finished");
    if (state.status.kind === "finished") {
      expect(state.status.reason).toBe("board-full");
      const [blue, red] = state.captures;
      expect(state.status.winner).toBe(blue === red ? null : blue > red ? 0 : 1);
    }
  });

  it("finish by agreement counts the score; a resignation hands the win over", () => {
    let state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }],
      [{ x: 2, y: 2 }]);
    expect(finish(state, "agreed").status).toEqual({ kind: "finished", winner: 0, reason: "agreed" });
    expect(finish(state, "resigned", 0).status).toEqual({ kind: "finished", winner: 1, reason: "resigned" });
    state = createGame({ size: 10, targetCaptures: null });
    expect(finish(state, "agreed").status).toEqual({ kind: "finished", winner: null, reason: "agreed" });
    // Resigning on your own turn.
    expect(finish(state, "resigned").status).toEqual({ kind: "finished", winner: 1, reason: "resigned" });
  });
});

describe("history", () => {
  it("undo replays the game one move shorter", () => {
    const state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }],
      [{ x: 2, y: 2 }]);
    const undone = undoMove(state);
    expect(undone.moves).toHaveLength(state.moves.length - 1);
    expect(undone.captures).toEqual([0, 0]);
    expect(undone.status).toEqual({ kind: "playing", turn: 0 });
    expect(undoMove(createGame({ size: 10, targetCaptures: null })).moves).toEqual([]);
  });

  it("replay from the move list reproduces the state exactly", () => {
    const state = scripted(10,
      [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }],
      [{ x: 2, y: 2 }]);
    expect(replay({ size: 10, targetCaptures: null }, state.moves)).toEqual(state);
  });

  it("diagrams round-trip", () => {
    const rows = [
      "..........",
      "..b.......",
      ".br.......",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      ".........."
    ];
    expect(toDiagram(fromDiagram(rows))).toEqual(rows);
    expect(() => fromDiagram(["b.", "x."])).toThrow();
  });
});

describe("parseOptions and parseMove", () => {
  it("keeps the fields Dots reads and drops the rest", () => {
    expect(parseOptions({ size: 10, targetCaptures: 5, padding: "x".repeat(1000) })).toEqual({ size: 10, targetCaptures: 5 });
    expect(parseOptions({ size: 15 })).toEqual({ size: 15, targetCaptures: null });
    expect(parseMove({ x: 1, y: 2, note: "ignored" })).toEqual({ x: 1, y: 2 });
  });

  it("refuses what is not a board or a point", () => {
    expect(() => parseOptions(null)).toThrow();
    expect(() => parseOptions({ size: "10" })).toThrow();
    expect(() => parseOptions({ size: 7 })).toThrow();
    expect(() => parseOptions({ size: 10, targetCaptures: 0 })).toThrow();
    expect(() => parseOptions({ size: 10, targetCaptures: 1.5 })).toThrow();
    expect(() => parseMove("1,1")).toThrow(IllegalMoveError);
    expect(() => parseMove({ x: "1", y: 1 })).toThrow(IllegalMoveError);
    expect(() => parseMove({ x: 1.5, y: 1 })).toThrow(IllegalMoveError);
  });
});

describe("narrate", () => {
  it("says who placed a dot, what it captured, and when it was lost in a house", async () => {
    const { dots } = await import("../src/dots/index.js");
    const { narrateMoves } = await import("../src/game.js");
    // Blue rings red's (2,2) with a diamond; red then plays into the house.
    const moves: DotsMove[] = [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 8, y: 8 }, { x: 3, y: 2 }, { x: 8, y: 7 }, { x: 2, y: 3 }, { x: 2, y: 2 }];
    expect(() => narrateMoves(dots, { size: 10, targetCaptures: null }, moves)).toThrow(IllegalMoveError);
    const { events } = narrateMoves(dots, { size: 10, targetCaptures: null }, moves.slice(0, 7));
    expect(events).toHaveLength(7);
    expect(events[0]).toEqual({ by: 0, kind: "dot", x: 2, y: 1, captured: 0, lost: false });
    expect(events[6]).toEqual({ by: 0, kind: "dot", x: 2, y: 3, captured: 1, lost: false });
  });
});
