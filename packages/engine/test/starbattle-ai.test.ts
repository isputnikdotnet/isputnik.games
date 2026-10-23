import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/random.js";
import { chooseMove, chooseShot } from "../src/starbattle/ai.js";
import {
  UNKNOWN,
  applyMove,
  createGame,
  fleetProblem,
  randomFleet,
  vesselAt,
  type StarBattleState
} from "../src/starbattle/rules.js";

function ready(seed = 1): StarBattleState {
  const random = seededRandom(seed);
  let state = createGame({ fleet: "classic" });
  state = applyMove(state, { kind: "place", vessels: randomFleet("classic", 10, random) });
  state = applyMove(state, { kind: "place", vessels: randomFleet("classic", 10, random) });
  return state;
}

/** Plays the computer against itself until one side wins; returns the shots fired. */
function playOut(level: "easy" | "normal" | "hard", seed: number): { shots: number; state: StarBattleState } {
  const random = seededRandom(seed);
  let state = ready(seed);
  let shots = 0;
  while (state.status.kind === "playing" && shots < 400) {
    const move = chooseMove(state, level, random);
    expect(move).not.toBeNull();
    if (move!.kind === "shoot") {
      expect(state.shots[state.status.turn][move!.y * 10 + move!.x]).toBe(UNKNOWN);
      shots++;
    }
    state = applyMove(state, move!);
  }
  return { shots, state };
}

describe("sector battle ai", () => {
  it("lays a legal fleet when it is its turn to place", () => {
    const state = createGame({ fleet: "small" });
    const move = chooseMove(state, "easy", seededRandom(3))!;
    expect(move.kind).toBe("place");
    if (move.kind === "place") expect(fleetProblem(move.vessels, "small", 10)).toBeNull();
    expect(chooseMove({ ...state, status: { kind: "finished", winner: null, reason: "agreed" } }, "easy", seededRandom(3))).toBeNull();
  });

  it("finishes a game at every level with legal shots only", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const { state } = playOut(level, 5);
      expect(state.status.kind).toBe("finished");
    }
  });

  it("the harder levels need fewer shots", () => {
    // Seat 0 alone, against a seat 1 that only ever fires at water, so the
    // count is the shots one level needs to sink a whole fleet.
    const shotsToSink = (level: "easy" | "normal" | "hard", seed: number) => {
      const random = seededRandom(seed);
      let state = ready(seed);
      const water: number[] = [];
      for (let i = 0; i < 100; i++) if (!vesselAt(state.vessels[0]!, i % 10, Math.floor(i / 10))) water.push(i);
      let shots = 0;
      let next = 0;
      while (state.status.kind === "playing") {
        if (state.status.turn === 0) {
          state = applyMove(state, { kind: "shoot", ...chooseShot(state, 0, level, random)! });
          shots++;
        } else {
          const i = water[next++];
          state = applyMove(state, { kind: "shoot", x: i % 10, y: Math.floor(i / 10) });
        }
      }
      expect(state.status.winner).toBe(0);
      return shots;
    };
    const average = (level: "easy" | "normal" | "hard") => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) total += shotsToSink(level, seed);
      return total / 40;
    };
    const easy = average("easy");
    const normal = average("normal");
    const hard = average("hard");
    expect(normal).toBeLessThan(easy);
    expect(hard).toBeLessThan(normal);
  });

  it("goes after a vessel it has found", () => {
    let state = ready(2);
    // Seat 0's turn. Find a deck of seat 1's four-decker and hit it.
    const four = state.vessels[1]!.find((s) => s.length === 4)!;
    const deck = four.horizontal ? { x: four.x + 1, y: four.y } : { x: four.x, y: four.y + 1 };
    state = applyMove(state, { kind: "shoot", ...deck });
    expect(state.status).toEqual({ kind: "playing", turn: 0 });
    for (const level of ["easy", "normal", "hard"] as const) {
      const shot = chooseShot(state, 0, level, seededRandom(1))!;
      expect(Math.abs(shot.x - deck.x) + Math.abs(shot.y - deck.y)).toBe(1);
    }
    // Two decks hit: the next shot extends the line.
    const second = four.horizontal ? { x: four.x + 2, y: four.y } : { x: four.x, y: four.y + 2 };
    state = applyMove(state, { kind: "shoot", ...second });
    for (const level of ["easy", "normal", "hard"] as const) {
      const shot = chooseShot(state, 0, level, seededRandom(1))!;
      if (four.horizontal) {
        expect(shot.y).toBe(four.y);
        expect([four.x, four.x + 3]).toContain(shot.x);
      } else {
        expect(shot.x).toBe(four.x);
        expect([four.y, four.y + 3]).toContain(shot.y);
      }
    }
  });

  it("at hard, never fires where nothing intact could lie", () => {
    // Sink everything but the four-decker of a known fleet, then see where hard aims.
    const random = seededRandom(9);
    let state = ready(9);
    const theirs = state.vessels[1]!;
    for (const vessel of theirs) {
      if (vessel.length === 4) continue;
      for (let i = 0; i < vessel.length; i++) {
        state = applyMove(state, { kind: "shoot", x: vessel.horizontal ? vessel.x + i : vessel.x, y: vessel.horizontal ? vessel.y : vessel.y + i });
      }
    }
    expect(state.status).toEqual({ kind: "playing", turn: 0 });
    for (let i = 0; i < 10; i++) {
      const shot = chooseShot(state, 0, "hard", random)!;
      // A four-decker through the chosen square must fit among the known misses.
      const fits = [true, false].some((horizontal) => {
        for (let offset = 0; offset < 4; offset++) {
          const x = horizontal ? shot.x - offset : shot.x;
          const y = horizontal ? shot.y : shot.y - offset;
          if (x < 0 || y < 0 || (horizontal ? x + 3 : x) >= 10 || (horizontal ? y : y + 3) >= 10) continue;
          let clear = true;
          for (let d = 0; d < 4; d++) {
            const cx = horizontal ? x + d : x;
            const cy = horizontal ? y : y + d;
            if (state.shots[0][cy * 10 + cx] !== UNKNOWN) clear = false;
          }
          if (clear) return true;
        }
        return false;
      });
      expect(fits).toBe(true);
    }
  });
});
