import { describe, expect, it } from "vitest";
import { IllegalMoveError, narrateMoves, type PlayerIndex } from "../src/game.js";
import { seededRandom } from "../src/random.js";
import { dominoes } from "../src/dominoes/index.js";
import {
  applyMove,
  createGame,
  deal,
  endsOf,
  finish,
  firstLead,
  fullSet,
  handPips,
  legalMoves,
  parseMove,
  parseOptions,
  replay,
  viewFor,
  type DominoesMove,
  type DominoesState,
  type LaidTile,
  type Tile
} from "../src/dominoes/rules.js";

const key = (tile: Tile) => `${tile[0]}:${tile[1]}`;

/** A hand in progress, set out by hand: the hands, the boneyard, the line, whose turn. */
function table(hands: [Tile[], Tile[]], boneyard: Tile[], line: LaidTile[], turn: PlayerIndex, over: Partial<DominoesState> = {}): DominoesState {
  return {
    ...createGame({ target: 101 }, 1),
    hands,
    handCounts: [hands[0].length, hands[1].length],
    boneyard,
    boneyardCount: boneyard.length,
    line,
    leadIndex: 0,
    mustLead: null,
    lastPlayer: null,
    status: { kind: "playing", turn },
    ...over
  };
}

describe("dominoes options and moves", () => {
  it("defaults to 101 and allows 51", () => {
    expect(parseOptions({})).toEqual({ target: 101 });
    expect(parseOptions({ target: 51, extra: 1 })).toEqual({ target: 51 });
    expect(() => parseOptions({ target: 77 })).toThrow();
  });

  it("reads a move and nothing else, the tile low number first", () => {
    expect(parseMove({ kind: "play", tile: [5, 2], end: "left", x: 1 })).toEqual({ kind: "play", tile: [2, 5], end: "left" });
    expect(parseMove({ kind: "draw", tile: [1, 1] })).toEqual({ kind: "draw" });
    expect(() => parseMove({ kind: "play", tile: [7, 1], end: "left" })).toThrow(IllegalMoveError);
    expect(() => parseMove({ kind: "play", tile: [1, 1], end: "up" })).toThrow(IllegalMoveError);
    expect(() => parseMove({ kind: "shoot" })).toThrow(IllegalMoveError);
  });
});

describe("the deal", () => {
  it("needs a seed", () => {
    expect(() => createGame({ target: 101 })).toThrow(/seed/);
  });

  it("deals seven each and fourteen to the boneyard, every tile once", () => {
    const { hands, boneyard } = deal(42, 1);
    expect(hands[0]).toHaveLength(7);
    expect(hands[1]).toHaveLength(7);
    expect(boneyard).toHaveLength(14);
    const all = [...hands[0], ...hands[1], ...boneyard].map(key).sort();
    expect(all).toEqual(fullSet().map(key).sort());
  });

  it("deals the same from the same seed, and a new deal each hand", () => {
    expect(deal(42, 1)).toEqual(deal(42, 1));
    expect(deal(42, 2)).not.toEqual(deal(42, 1));
    expect(deal(43, 1)).not.toEqual(deal(42, 1));
  });

  it("opens with the lowest double, 0:0 last of them", () => {
    expect(firstLead([[[3, 3], [0, 1]], [[2, 2], [5, 6]]])).toEqual({ seat: 1, tile: [2, 2] });
    expect(firstLead([[[0, 0], [1, 2]], [[6, 6], [3, 4]]])).toEqual({ seat: 1, tile: [6, 6] });
    expect(firstLead([[[0, 0]], [[2, 3]]])).toEqual({ seat: 0, tile: [0, 0] });
  });

  it("with no double, opens with the lowest tile", () => {
    expect(firstLead([[[2, 3], [1, 5]], [[0, 4], [0, 1]]])).toEqual({ seat: 1, tile: [0, 1] });
  });

  it("gives the first move to the lead tile's holder, and only that tile", () => {
    const state = createGame({ target: 101 }, 7);
    const lead = firstLead(state.hands);
    expect(state.status).toEqual({ kind: "playing", turn: lead.seat });
    expect(legalMoves(state)).toEqual([{ kind: "play", tile: lead.tile, end: "right" }]);
    const other = state.hands[lead.seat].find((tile) => key(tile) !== key(lead.tile))!;
    expect(() => applyMove(state, { kind: "play", tile: other, end: "right" })).toThrow(/opens with/);
  });
});

describe("playing", () => {
  const line: LaidTile[] = [{ left: 2, right: 5 }];

  it("turns a tile to match the end it goes on", () => {
    const state = table([[[1, 2], [5, 6], [0, 0]], [[3, 3]]], [], line, 0);
    const left = applyMove(state, { kind: "play", tile: [1, 2], end: "left" });
    expect(left.line).toEqual([{ left: 1, right: 2 }, { left: 2, right: 5 }]);
    expect(left.leadIndex).toBe(1);
    expect(endsOf(left)).toEqual([1, 5]);
    const right = applyMove(state, { kind: "play", tile: [5, 6], end: "right" });
    expect(right.line).toEqual([{ left: 2, right: 5 }, { left: 5, right: 6 }]);
    expect(right.status).toEqual({ kind: "playing", turn: 1 });
    expect(right.handCounts).toEqual([2, 1]);
  });

  it("refuses a tile that does not match, or is not held", () => {
    const state = table([[[1, 2], [5, 6]], [[3, 3]]], [], line, 0);
    expect(() => applyMove(state, { kind: "play", tile: [1, 2], end: "right" })).toThrow(IllegalMoveError);
    expect(() => applyMove(state, { kind: "play", tile: [2, 2], end: "left" })).toThrow(/not in your hand/);
  });

  it("draws only when stuck, and drawing keeps the turn", () => {
    const stuck = table([[[0, 0], [1, 1]], [[3, 3], [2, 4]]], [[4, 4], [0, 5]], line, 0);
    expect(legalMoves(stuck)).toEqual([{ kind: "draw" }]);
    const once = applyMove(stuck, { kind: "draw" });
    expect(once.hands[0]).toEqual([[0, 0], [1, 1], [4, 4]]);
    expect(once.boneyardCount).toBe(1);
    expect(once.status).toEqual({ kind: "playing", turn: 0 });
    const twice = applyMove(once, { kind: "draw" });
    expect(legalMoves(twice)).toEqual([{ kind: "play", tile: [0, 5], end: "right" }]);
    expect(() => applyMove(twice, { kind: "draw" })).toThrow(IllegalMoveError);
  });

  it("passes when stuck with the boneyard empty", () => {
    const state = table([[[0, 0], [1, 1]], [[2, 3], [4, 4]]], [], line, 0);
    expect(legalMoves(state)).toEqual([{ kind: "pass" }]);
    expect(applyMove(state, { kind: "pass" }).status).toEqual({ kind: "playing", turn: 1 });
  });
});

describe("the end of a hand", () => {
  it("going out makes the other hand pay, and the winner leads the next", () => {
    const state = table([[[5, 6]], [[3, 4], [1, 1]]], [[0, 6]], [{ left: 2, right: 5 }], 0);
    const next = applyMove(state, { kind: "play", tile: [5, 6], end: "right" });
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ hand: 1, winner: 0, fish: false, pips: [0, 9], points: [0, 9], totals: [0, 9] });
    expect(next.totals).toEqual([0, 9]);
    expect(next.hand).toBe(2);
    expect(next.line).toEqual([]);
    expect(next.handCounts).toEqual([7, 7]);
    expect(next.mustLead).toBeNull();
    expect(next.status).toEqual({ kind: "playing", turn: 0 });
    expect(legalMoves(next)).toHaveLength(7);
  });

  it("counts a lone 0:0 as 25", () => {
    expect(handPips([[0, 0]])).toBe(25);
    expect(handPips([[0, 0], [0, 1]])).toBe(1);
    expect(handPips([[6, 6]])).toBe(12);
  });

  it("a closed line is a «рыба»: the lower hand wins, the higher pays its own", () => {
    // Every five is out but the 5:5 about to close the line: the ends become 5 and 5.
    const line: LaidTile[] = [
      { left: 5, right: 0 }, { left: 0, right: 5 }, { left: 5, right: 1 }, { left: 1, right: 5 },
      { left: 5, right: 2 }, { left: 2, right: 5 }, { left: 5, right: 3 }, { left: 3, right: 5 }, { left: 5, right: 4 }, { left: 4, right: 5 }
    ];
    // The line repeats tiles a real set has once — only its ends matter to the rules.
    const state = table([[[5, 5], [1, 1]], [[6, 6], [2, 3]]], [[0, 6], [4, 4]], line, 0);
    const after = applyMove(state, { kind: "play", tile: [5, 5], end: "right" });
    expect(after.history[0]).toMatchObject({ winner: 0, fish: true, pips: [2, 17], points: [0, 17] });
    expect(after.hand).toBe(2);
    expect(after.status).toEqual({ kind: "playing", turn: 0 });
  });

  it("an equal «рыба» scores nothing, and the last to play leads", () => {
    const state = table([[[5, 5], [1, 2]], [[0, 3], [4, 6]]], [], [{ left: 5, right: 4 }], 1, { totals: [10, 20] });
    // Seat 1 plays 4:6 → ends 5 and 6; nothing left anywhere has a 5 or a 6 but the 5:5…
    const one = applyMove(state, { kind: "play", tile: [4, 6], end: "right" });
    expect(one.history).toHaveLength(0);
    // …which seat 0 plays: ends 5 and 6, and only 1:2 (3) and 0:3 (3) remain.
    const two = applyMove(one, { kind: "play", tile: [5, 5], end: "left" });
    expect(two.history[0]).toMatchObject({ winner: null, fish: true, pips: [3, 3], points: [0, 0], totals: [10, 20] });
    expect(two.status).toEqual({ kind: "playing", turn: 0 });
  });

  it("whoever reaches the target is «козёл» and loses", () => {
    const state = table([[[5, 6]], [[6, 6], [4, 4]]], [], [{ left: 2, right: 5 }], 0, { totals: [40, 90] });
    const over = applyMove(state, { kind: "play", tile: [5, 6], end: "right" });
    expect(over.totals).toEqual([40, 110]);
    expect(over.status).toEqual({ kind: "finished", winner: 0, reason: "target" });
    expect(legalMoves(over)).toEqual([]);
  });

  it("resigning loses; by agreement the lower total wins", () => {
    const state = table([[[1, 2]], [[3, 4]]], [], [], 0, { totals: [30, 12] });
    expect(finish(state, "resigned", 1).status).toEqual({ kind: "finished", winner: 0, reason: "resigned" });
    expect(finish(state, "agreed").status).toEqual({ kind: "finished", winner: 1, reason: "agreed" });
  });
});

/** Plays a whole game with random legal moves, keeping the moves. */
function randomGame(seed: number, target: 101 | 51 = 51): { moves: DominoesMove[]; states: DominoesState[] } {
  const random = seededRandom(seed * 31 + 5);
  let state = createGame({ target }, seed);
  const moves: DominoesMove[] = [];
  const states = [state];
  while (state.status.kind === "playing") {
    const legal = legalMoves(state);
    const move = legal[Math.floor(random() * legal.length)];
    state = applyMove(state, move);
    moves.push(move);
    states.push(state);
    if (moves.length > 5000) throw new Error("The game did not end");
  }
  return { moves, states };
}

describe("whole games", () => {
  it("end, keep all 28 tiles, and replay exactly", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { moves, states } = randomGame(seed);
      for (const state of states) {
        if (state.status.kind !== "playing") continue;
        const tiles = [...state.hands[0], ...state.hands[1], ...state.boneyard].map(key);
        const laid = state.line.map((t) => key([Math.min(t.left, t.right), Math.max(t.left, t.right)]));
        expect(new Set([...tiles, ...laid]).size).toBe(28);
        expect(state.handCounts).toEqual([state.hands[0].length, state.hands[1].length]);
      }
      const last = states[states.length - 1];
      expect(last.status.kind).toBe("finished");
      expect(Math.max(...last.totals)).toBeGreaterThanOrEqual(51);
      expect(replay({ target: 51 }, seed, moves)).toEqual(last);
    }
  });

  it("never shows a seat a tile it may not see", () => {
    for (let seed = 100; seed < 140; seed++) {
      const { moves, states } = randomGame(seed);
      for (const state of states) {
        for (const seat of [0, 1] as const) {
          const view = viewFor(state, seat);
          expect(view.seed).toBe(0);
          expect(view.boneyard).toEqual([]);
          expect(view.hands[seat === 0 ? 1 : 0]).toEqual([]);
          expect(view.hands[seat]).toEqual(state.hands[seat]);
          expect(view.handCounts).toEqual(state.handCounts);
        }
      }
      // Draws and passes carry nothing; the feed names only tiles that were laid.
      for (const move of moves) if (move.kind !== "play") expect(Object.keys(move)).toEqual(["kind"]);
      const { events } = narrateMoves(dominoes, { target: 51 }, moves, seed);
      for (const event of events) if (event.kind !== "play") expect(Object.keys(event).sort()).toEqual(["by", "kind"]);
    }
  });

  it("narrates the play that ends a hand with the hand's result", () => {
    const { moves, states } = randomGame(7);
    const { events } = narrateMoves(dominoes, { target: 51 }, moves, 7);
    const hands = events.filter((event) => event.hand);
    expect(hands).toHaveLength(states[states.length - 1].history.length);
  });
});
