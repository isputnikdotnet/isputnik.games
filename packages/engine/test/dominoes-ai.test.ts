import { describe, expect, it } from "vitest";
import { AI_LEVELS, type AiLevel } from "../src/game.js";
import { seededRandom } from "../src/random.js";
import { chooseMove, sampleWorld } from "../src/dominoes/ai.js";
import {
  applyMove,
  createGame,
  legalMoves,
  viewFor,
  type DominoesState,
  type LaidTile,
  type Tile
} from "../src/dominoes/rules.js";

const key = (tile: Tile) => `${tile[0]}:${tile[1]}`;

function table(hands: [Tile[], Tile[]], boneyard: Tile[], line: LaidTile[], over: Partial<DominoesState> = {}): DominoesState {
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
    lacks: [[], []],
    status: { kind: "playing", turn: 0 },
    ...over
  };
}

/** Plays a game to the target between two levels; returns the winner's seat. */
function match(levels: [AiLevel, AiLevel], seed: number): 0 | 1 | null {
  const random = seededRandom(seed * 7919 + 13);
  let state = createGame({ target: 51 }, seed);
  while (state.status.kind === "playing") {
    const move = chooseMove(state, levels[state.status.turn], random);
    expect(legalMoves(state)).toContainEqual(move);
    state = applyMove(state, move!);
  }
  return state.status.winner;
}

describe("dominoes computer", () => {
  it("draws and passes when that is all there is, and stops at the end", () => {
    const line: LaidTile[] = [{ left: 2, right: 5 }];
    for (const level of AI_LEVELS) {
      expect(chooseMove(table([[[0, 0]], [[3, 3]]], [[4, 4]], line), level, seededRandom(1))).toEqual({ kind: "draw" });
      expect(chooseMove(table([[[0, 0]], [[3, 3]]], [], line), level, seededRandom(1))).toEqual({ kind: "pass" });
    }
    const over = { ...createGame({ target: 101 }, 1), status: { kind: "finished" as const, winner: 0 as const, reason: "target" as const } };
    expect(chooseMove(over, "hard", seededRandom(1))).toBeNull();
  });

  it("leaves an end the other hand is known to lack", () => {
    // 2:4 or the heavier 5:6 — the other side has no 4, so 2:4 on the left (ends 4 and 5) is the better play.
    const state = table([[[2, 4], [5, 6], [1, 1]], [[0, 0], [3, 3], [0, 3]]], [], [{ left: 2, right: 5 }], { lacks: [[], [4]] });
    expect(chooseMove(state, "normal", seededRandom(3))).toEqual({ kind: "play", tile: [2, 4], end: "left" });
  });

  it("never reads the other hand or the boneyard", () => {
    const base = createGame({ target: 101 }, 99);
    // Play to a position where the computer has a choice.
    let state = base;
    const random = seededRandom(5);
    for (let i = 0; i < 6; i++) state = applyMove(state, chooseMove(state, "normal", random)!);
    const me = (state.status as { turn: 0 | 1 }).turn;
    const them = me === 0 ? 1 : 0;
    // The same view with the unseen tiles shuffled between the other hand and the boneyard.
    const unseen = [...state.hands[them], ...state.boneyard].reverse();
    const hands: [Tile[], Tile[]] = [state.hands[0], state.hands[1]];
    hands[them] = unseen.slice(0, state.hands[them].length);
    const twin: DominoesState = { ...state, hands, boneyard: unseen.slice(state.hands[them].length) };
    expect(viewFor(twin, me)).toEqual(viewFor(state, me));
    for (const level of AI_LEVELS) {
      expect(chooseMove(twin, level, seededRandom(8))).toEqual(chooseMove(state, level, seededRandom(8)));
    }
  });

  it("samples worlds that fit what it knows", () => {
    const view = viewFor(table([[[5, 6], [2, 2]], [[3, 3], [1, 1], [0, 1]]], [[4, 4], [0, 4]], [{ left: 2, right: 5 }], { lacks: [[], [4]] }), 0);
    for (let s = 0; s < 50; s++) {
      const world = sampleWorld(view, 0, seededRandom(s));
      expect(world.hands[0]).toEqual(view.hands[0]);
      expect(world.hands[1]).toHaveLength(3);
      expect(world.hands[1].some((t) => t[0] === 4 || t[1] === 4)).toBe(false);
      const all = [...world.hands[0], ...world.hands[1], ...world.boneyard, [2, 5] as Tile].map(key);
      expect(new Set(all).size).toBe(28);
    }
  });

  it("is stronger at each level", () => {
    // Seats alternate; a fixed set of deals, so the count is the same every run.
    let normalOverEasy = 0;
    let hardOverNormal = 0;
    const games = 24;
    for (let g = 0; g < games; g++) {
      const swap = g % 2 === 1;
      const a = match(swap ? ["easy", "normal"] : ["normal", "easy"], g + 1);
      if (a === (swap ? 1 : 0)) normalOverEasy++;
      const b = match(swap ? ["normal", "hard"] : ["hard", "normal"], g + 101);
      if (b === (swap ? 1 : 0)) hardOverNormal++;
    }
    expect(normalOverEasy).toBeGreaterThan(games / 2);
    expect(hardOverNormal).toBeGreaterThan(games / 2);
  });
});
