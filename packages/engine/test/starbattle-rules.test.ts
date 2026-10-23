import { describe, expect, it } from "vitest";
import { IllegalMoveError } from "../src/game.js";
import { seededRandom } from "../src/random.js";
import {
  FLEETS,
  HIT,
  MISS,
  UNKNOWN,
  applyMove,
  canPlace,
  createGame,
  finish,
  fleetProblem,
  legalMoves,
  missingVessels,
  parseMove,
  parseOptions,
  phaseOf,
  randomFleet,
  replay,
  debrisField,
  destroyedVessels,
  viewFor,
  damagedCells,
  type StarBattleState,
  type Vessel
} from "../src/starbattle/rules.js";

// A legal classic fleet deployed out by hand: the four-decker along the top row,
// the rest in a grid with a square of water between every pair.
const FLEET_A: Vessel[] = [
  { x: 0, y: 0, length: 4, horizontal: true },
  { x: 0, y: 2, length: 3, horizontal: true },
  { x: 4, y: 2, length: 3, horizontal: true },
  { x: 0, y: 4, length: 2, horizontal: true },
  { x: 3, y: 4, length: 2, horizontal: true },
  { x: 6, y: 4, length: 2, horizontal: true },
  { x: 0, y: 6, length: 1, horizontal: true },
  { x: 2, y: 6, length: 1, horizontal: true },
  { x: 4, y: 6, length: 1, horizontal: true },
  { x: 6, y: 6, length: 1, horizontal: true }
];
// The same shapes, mirrored to the bottom-right, for the other seat.
const FLEET_B: Vessel[] = FLEET_A.map((s) => ({ ...s, x: 9 - s.x - (s.horizontal ? s.length - 1 : 0), y: 9 - s.y }));

const SMALL_FLEET: Vessel[] = [
  { x: 0, y: 0, length: 3, horizontal: false },
  { x: 2, y: 0, length: 2, horizontal: false },
  { x: 4, y: 0, length: 2, horizontal: false },
  { x: 6, y: 0, length: 1, horizontal: false },
  { x: 8, y: 0, length: 1, horizontal: false },
  { x: 0, y: 9, length: 1, horizontal: false }
];

function battle(fleet: "classic" | "small" = "classic"): StarBattleState {
  let state = createGame({ fleet });
  state = applyMove(state, { kind: "place", vessels: fleet === "classic" ? FLEET_A : SMALL_FLEET });
  state = applyMove(state, { kind: "place", vessels: fleet === "classic" ? FLEET_B : SMALL_FLEET });
  return state;
}

const shoot = (state: StarBattleState, x: number, y: number) => applyMove(state, { kind: "shoot", x, y });

describe("options and moves off the wire", () => {
  it("keeps the fleet kind and nothing else", () => {
    expect(parseOptions({ fleet: "small", extra: 1 })).toEqual({ fleet: "small" });
    expect(parseOptions({})).toEqual({ fleet: "classic" });
    expect(() => parseOptions({ fleet: "huge" })).toThrow();
    expect(() => parseOptions(null)).toThrow();
  });

  it("parses a placement and a shot, dropping what the game does not read", () => {
    expect(parseMove({ kind: "shoot", x: 1, y: 2, note: "hi" })).toEqual({ kind: "shoot", x: 1, y: 2 });
    expect(parseMove({ kind: "place", vessels: [{ x: 0, y: 0, length: 1, horizontal: true, colour: "red" }] }))
      .toEqual({ kind: "place", vessels: [{ x: 0, y: 0, length: 1, horizontal: true }] });
    expect(() => parseMove({ kind: "shoot", x: "1", y: 2 })).toThrow(IllegalMoveError);
    expect(() => parseMove({ kind: "place", vessels: "none" })).toThrow(IllegalMoveError);
    expect(() => parseMove({ kind: "dance" })).toThrow(IllegalMoveError);
  });
});

describe("deploying the fleet", () => {
  it("knows the debris field around a vessel and refuses vessels that touch", () => {
    expect(debrisField({ x: 0, y: 0, length: 1, horizontal: true }, 10)).toHaveLength(3);
    expect(debrisField({ x: 4, y: 4, length: 2, horizontal: true }, 10)).toHaveLength(10);
    const first: Vessel = { x: 2, y: 2, length: 2, horizontal: true };
    expect(canPlace({ x: 4, y: 3, length: 1, horizontal: true }, [first], 10)).toBe(false); // corner touch
    expect(canPlace({ x: 5, y: 3, length: 1, horizontal: true }, [first], 10)).toBe(true);
    expect(canPlace({ x: 9, y: 0, length: 2, horizontal: true }, [], 10)).toBe(false); // off the edge
    expect(canPlace({ x: 9, y: 8, length: 2, horizontal: false }, [], 10)).toBe(true);
  });

  it("checks the fleet's composition", () => {
    expect(fleetProblem(FLEET_A, "classic", 10)).toBeNull();
    expect(fleetProblem(FLEET_A.slice(1), "classic", 10)).toMatch(/fleet is 4-3-3/);
    expect(fleetProblem(FLEET_A, "small", 10)).toMatch(/fleet is 3-2-2/);
    const touching = [...FLEET_A.slice(0, 9), { x: 7, y: 5, length: 1, horizontal: true }];
    expect(fleetProblem(touching, "classic", 10)).toMatch(/not touch/);
    expect(missingVessels(FLEET_A.slice(0, 3), "classic")).toEqual([2, 2, 2, 1, 1, 1, 1]);
  });

  it("lays a random fleet that is always legal, keeping the vessels already down", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seededRandom(seed);
      expect(fleetProblem(randomFleet("classic", 10, random), "classic", 10)).toBeNull();
      expect(fleetProblem(randomFleet("small", 10, random), "small", 10)).toBeNull();
      const kept = FLEET_A.slice(0, 2);
      const topped = randomFleet("classic", 10, random, kept);
      expect(topped.slice(0, 2)).toEqual(kept);
      expect(fleetProblem(topped, "classic", 10)).toBeNull();
    }
  });

  it("seat 0 deploys first, then seat 1, and seat 0 fires first", () => {
    let state = createGame({ fleet: "classic" });
    expect(phaseOf(state)).toBe("placing");
    expect(legalMoves(state)).toEqual([]);
    expect(() => shoot(state, 0, 0)).toThrow(/fleets must be deployed/);
    expect(() => applyMove(state, { kind: "place", vessels: FLEET_A.slice(1) })).toThrow(IllegalMoveError);
    state = applyMove(state, { kind: "place", vessels: FLEET_A });
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    expect(state.placed).toEqual([true, false]);
    state = applyMove(state, { kind: "place", vessels: FLEET_B });
    expect(state.status).toEqual({ kind: "playing", turn: 0 });
    expect(phaseOf(state)).toBe("battle");
    expect(legalMoves(state)).toHaveLength(100);
    expect(() => applyMove(state, { kind: "place", vessels: FLEET_A })).toThrow(/already deployed/);
  });
});

describe("firing", () => {
  it("a miss passes the turn, a hit keeps it, a square fires once", () => {
    let state = battle();
    state = shoot(state, 9, 0); // water on B's sector
    expect(state.lastShot).toEqual({ by: 0, x: 9, y: 0, result: "miss" });
    expect(state.shots[0][0 * 10 + 9]).toBe(MISS);
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    state = shoot(state, 0, 0); // A's four-decker
    expect(state.lastShot?.result).toBe("hit");
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    expect(() => shoot(state, 0, 0)).toThrow(/has been fired at/);
    expect(() => shoot(state, 10, 0)).toThrow(/off the board/);
    expect(state.shots[1][0]).toBe(HIT);
    expect(state.shots[0][0]).toBe(UNKNOWN);
  });

  it("sinking a vessel marks the water around it and counts the vessel", () => {
    let state = battle();
    state = shoot(state, 9, 0);
    // B's single-decker at (9 - 0, 9 - 6) = (9, 3)... A's fleet is on seat 0's sector;
    // seat 1 fires at it: A's single at (0, 6).
    state = shoot(state, 0, 6);
    expect(state.lastShot?.result).toBe("destroyed");
    expect(state.destroyed).toEqual([0, 1]);
    expect(destroyedVessels(state, 0)).toEqual([{ x: 0, y: 6, length: 1, horizontal: true }]);
    for (const [x, y] of [[1, 5], [1, 6], [1, 7], [0, 5], [0, 7]]) expect(state.shots[1][y * 10 + x]).toBe(MISS);
    expect(state.status).toEqual({ kind: "playing", turn: 1 });
    expect(damagedCells(state, 1)).toEqual([]);
    state = shoot(state, 0, 2);
    expect(damagedCells(state, 1)).toEqual([{ x: 0, y: 2 }]);
  });

  it("ends when the last vessel goes down, and keeps score", () => {
    let state = battle("small");
    // Seat 0 sinks all of seat 1's small fleet without a miss.
    for (const vessel of SMALL_FLEET) {
      for (let i = 0; i < vessel.length; i++) state = shoot(state, vessel.x, vessel.y + i);
    }
    expect(state.status).toEqual({ kind: "finished", winner: 0, reason: "target" });
    expect(state.destroyed).toEqual([FLEETS.small.length, 0]);
    expect(() => shoot(state, 9, 9)).toThrow(/game is over/);
    expect(legalMoves(state)).toEqual([]);
  });

  it("a resignation or an agreement ends it early", () => {
    let state = battle();
    expect(finish(state, "resigned", 0).status).toEqual({ kind: "finished", winner: 1, reason: "resigned" });
    expect(finish(state, "agreed").status).toEqual({ kind: "finished", winner: null, reason: "agreed" });
    state = shoot(state, 9, 3); // B's single-decker: A's (0, 6) mirrored
    expect(state.destroyed).toEqual([1, 0]);
    expect(finish(state, "agreed").status).toEqual({ kind: "finished", winner: 0, reason: "agreed" });
  });

  it("replays a move list to the same position", () => {
    const moves = [
      { kind: "place" as const, vessels: FLEET_A },
      { kind: "place" as const, vessels: FLEET_B },
      { kind: "shoot" as const, x: 9, y: 0 },
      { kind: "shoot" as const, x: 0, y: 0 }
    ];
    let state = createGame({ fleet: "classic" });
    for (const move of moves) state = applyMove(state, move);
    expect(replay({ fleet: "classic" }, moves)).toEqual(state);
    expect(state.moveCount).toBe(4);
  });
});

describe("a view for one seat", () => {
  it("hides the other fleet until vessels are destroyed, and keeps the rest", () => {
    let state = battle();
    const forB = viewFor(state, 1);
    expect(forB.vessels[1]).toEqual(FLEET_B);
    expect(forB.vessels[0]).toEqual([]);
    expect(forB.placed).toEqual([true, true]);
    expect(forB.shots).toBe(state.shots);

    state = shoot(state, 9, 0);
    state = shoot(state, 0, 6);
    expect(viewFor(state, 1).vessels[0]).toEqual([{ x: 0, y: 6, length: 1, horizontal: true }]);
    expect(viewFor(state, 0).vessels[1]).toEqual([]);
    expect(viewFor(state, 0).vessels[0]).toEqual(FLEET_A);
  });

  it("shows nothing of a fleet not yet deployed", () => {
    let state = createGame({ fleet: "classic" });
    state = applyMove(state, { kind: "place", vessels: FLEET_A });
    const forB = viewFor(state, 1);
    expect(forB.vessels).toEqual([[], null]);
    expect(forB.placed).toEqual([true, false]);
  });
});

describe("narrate", () => {
  it("logs a deployment without its squares, and every shot with its result", async () => {
    const { starbattle } = await import("../src/starbattle/index.js");
    const { narrateMoves } = await import("../src/game.js");
    const { events } = narrateMoves(starbattle, { fleet: "classic" }, [
      { kind: "place", vessels: FLEET_A },
      { kind: "place", vessels: FLEET_B },
      { kind: "shoot", x: 9, y: 0 },
      { kind: "shoot", x: 0, y: 6 }
    ]);
    expect(events).toEqual([
      { by: 0, kind: "deploy" },
      { by: 1, kind: "deploy" },
      { by: 0, kind: "fire", x: 9, y: 0, result: "miss" },
      { by: 1, kind: "fire", x: 0, y: 6, result: "destroyed" }
    ]);
    expect(JSON.stringify(events)).not.toContain("vessels");
  });
});
