import { describe, expect, it } from "vitest";
import { seededRandom } from "../src/random.js";
import { replayRun } from "../src/arcade/game.js";
import { ARCADE_IDS, getArcadeGame } from "../src/arcade/registry.js";
import { torpedo } from "../src/arcade/torpedo/index.js";
import {
  BONUS_AT,
  MAX_BEARING,
  RANGE,
  ROUND_TICKS,
  SHIPS,
  SINK_TICKS,
  TORPEDOES,
  SIGHT_SPEED,
  createRun,
  inSights,
  parseInput,
  parseVariant,
  tick,
  type Ship,
  type ShipKind,
  type TorpedoInput,
  type TorpedoState,
  type Turn
} from "../src/arcade/torpedo/rules.js";

const still: TorpedoInput = { turn: 0, fire: false };
const fire: TorpedoInput = { turn: 0, fire: true };
const kinds = (cues: { kind: string }[]) => cues.map((cue) => cue.kind);

/** A run in a chosen position, with no ship coming in unless the test says so. */
function run(over: Partial<TorpedoState> = {}): TorpedoState {
  return { ...createRun("standard", 1), waits: { near: 10_000, mid: 10_000, far: 10_000 }, ...over };
}

function ship(kind: ShipKind, x: number, over: Partial<Ship> = {}): Ship {
  return { id: 1, kind, x, dir: 1, speed: 0, zig: 1000, sinking: null, ...over };
}

/** Where a ship will be when a torpedo fired now reaches its lane. */
const lead = (s: Ship) => s.x + s.dir * s.speed * (RANGE[SHIPS[s.kind].lane] + 1);

/** A player who swings onto the most valuable ship's lead and fires when on
 *  it, and is wrong now and then. Returns the end of the run and its log. */
function play(seed: number, skill: number, check?: (state: TorpedoState, cues: { kind: string }[]) => void) {
  const random = seededRandom(seed * 13 + 5);
  let state = createRun("standard", seed);
  let last: TorpedoInput = still;
  const log: [number, TorpedoInput][] = [];
  while (!state.over && state.tick < 100_000) {
    let input: TorpedoInput = still;
    if (state.phase === "bonus") {
      input = fire;
    } else {
      const target = state.ships
        .filter((s) => s.sinking === null && Math.abs(lead(s)) <= MAX_BEARING)
        .sort((a, b) => SHIPS[b.kind].points - SHIPS[a.kind].points)[0];
      if (target) {
        const aim = lead(target);
        const turn: Turn = Math.abs(aim - state.bearing) <= SIGHT_SPEED / 2 ? 0 : aim > state.bearing ? 1 : -1;
        const on = Math.abs(aim - state.bearing) <= SHIPS[target.kind].half / 2;
        input = { turn, fire: on && !state.torpedo && random() < skill };
      }
      if (random() > skill) input = { turn: (Math.floor(random() * 3) - 1) as Turn, fire: random() < 0.3 };
    }
    if (input.turn !== last.turn || input.fire !== last.fire) {
      log.push([state.tick, input]);
      last = input;
    }
    const result = tick(state, input);
    check?.(result.state, result.cues);
    state = result.state;
  }
  return { state, log };
}

describe("Torpedo Run rules", () => {
  it("starts deterministic, plain JSON, with ten torpedoes and the clock full", () => {
    const state = createRun("standard", 42);
    expect(state).toEqual(createRun("standard", 42));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state).toMatchObject({ tick: 0, phase: "play", round: 1, clock: ROUND_TICKS, bearing: 0, torpedoesLeft: TORPEDOES, torpedo: null, score: 0, over: false });
  });

  it("moves the sight as far as it goes and no further", () => {
    let state = run();
    state = tick(state, { turn: 1, fire: false }).state;
    expect(state.bearing).toBe(SIGHT_SPEED);
    for (let i = 0; i < 200; i++) state = tick(state, { turn: -1, fire: false }).state;
    expect(state.bearing).toBe(-MAX_BEARING);
  });

  it("launches down the bearing and keeps one torpedo in the water at a time", () => {
    let { state, cues } = tick(run({ bearing: 120 }), fire);
    expect(cues).toContainEqual({ kind: "launch", bearing: 120, left: TORPEDOES - 1 });
    expect(state.torpedo).toEqual({ bearing: 120, run: 0 });
    // Holding fire while it runs launches nothing more.
    for (let i = 0; i < RANGE.far - 1; i++) {
      ({ state, cues } = tick(state, fire));
      expect(kinds(cues)).not.toContain("launch");
    }
    expect(state.torpedoesLeft).toBe(TORPEDOES - 1);
    ({ state, cues } = tick(state, fire));
    expect(cues).toContainEqual({ kind: "miss", bearing: 120 });
    expect(state.torpedo).toBeNull();
    // The tube is free again on the next tick, not the one the torpedo ended on.
    ({ state, cues } = tick(state, fire));
    expect(kinds(cues)).toContain("launch");
    expect(state.torpedoesLeft).toBe(TORPEDOES - 2);
  });

  it.each([
    ["tanker", 100],
    ["cargo", 200],
    ["destroyer", 300],
    ["patrol", 500]
  ] as const)("scores a %s at %i", (kind, points) => {
    const lane = SHIPS[kind].lane;
    let state = run({ ships: [ship(kind, 20)], torpedo: { bearing: 0, run: RANGE[lane] - 1 }, torpedoesLeft: 5 });
    const { state: after, cues } = tick(state, still);
    state = after;
    expect(cues).toContainEqual(expect.objectContaining({ kind: "hit", shipKind: kind, lane, points, score: points }));
    expect(state.score).toBe(points);
    expect(state.rounds[0].hits[kind]).toBe(1);
    expect(state.rounds[0].score).toBe(points);
    expect(state.torpedo).toBeNull();
    expect(state.ships[0].sinking).toBe(SINK_TICKS);
    // It goes under and is gone.
    for (let i = 0; i < SINK_TICKS; i++) state = tick(state, still).state;
    expect(state.ships).toEqual([]);
  });

  it("is stopped by the nearer ship, and misses wide of everything", () => {
    const near = ship("tanker", 0, { id: 1 });
    const far = ship("destroyer", 0, { id: 2 });
    const { cues } = tick(run({ ships: [near, far], torpedo: { bearing: 0, run: RANGE.near - 1 } }), still);
    expect(cues).toContainEqual(expect.objectContaining({ kind: "hit", ship: 1 }));
    expect(inSights({ ships: [far, near] }, 0)?.id).toBe(1);

    let state = run({ ships: [ship("cargo", SHIPS.cargo.half + 5)], torpedo: { bearing: 0, run: 0 } });
    let all: string[] = [];
    for (let i = 0; i < RANGE.far; i++) {
      const result = tick(state, still);
      state = result.state;
      all = all.concat(kinds(result.cues));
    }
    expect(all).toContain("miss");
    expect(all).not.toContain("hit");
  });

  it("ends a round without the bonus after its last torpedo", () => {
    let state = run({ torpedoesLeft: 1 });
    let cues;
    ({ state } = tick(state, fire));
    expect(state.torpedoesLeft).toBe(0);
    expect(state.over).toBe(false);
    for (let i = 0; i < RANGE.far; i++) ({ state, cues } = tick(state, still));
    expect(state.over).toBe(true);
    expect(cues).toContainEqual({ kind: "over", score: 0 });
    expect(() => tick(state, still)).toThrow(/over/);
  });

  it("ends a round when its clock runs out", () => {
    let state = run({ clock: 2 });
    state = tick(state, still).state;
    expect(state.over).toBe(false);
    state = tick(state, still).state;
    expect(state.over).toBe(true);
    expect(state.torpedoesLeft).toBe(TORPEDOES);
  });

  it("earns one bonus round at 1 500, waits for fire, then plays it on to the end", () => {
    let state = run({ score: BONUS_AT - 300, torpedoesLeft: 0, ships: [ship("destroyer", 0)], torpedo: { bearing: 0, run: RANGE.far - 1 } });
    let cues;
    ({ state, cues } = tick(state, still));
    expect(kinds(cues)).toEqual(expect.arrayContaining(["hit", "bonus", "roundOver"]));
    expect(cues).toContainEqual({ kind: "roundOver", round: 1, score: BONUS_AT, bonus: true });
    expect(state).toMatchObject({ phase: "bonus", bonus: true, over: false, score: BONUS_AT });

    // The sea waits for the player.
    const waiting = tick(state, still).state;
    expect(waiting).toMatchObject({ phase: "bonus", tick: state.tick + 1, ships: state.ships });

    ({ state, cues } = tick(waiting, fire));
    expect(cues).toEqual([{ kind: "round", round: 2 }]);
    expect(state).toMatchObject({ phase: "play", round: 2, torpedoesLeft: TORPEDOES, clock: ROUND_TICKS, score: BONUS_AT });
    expect(state.rounds).toHaveLength(2);

    // The bonus round earns no other: it ends the run however it scores.
    state = { ...state, torpedoesLeft: 1, score: 5000 };
    ({ state } = tick(state, fire));
    for (let i = 0; i < RANGE.far; i++) ({ state, cues } = tick(state, still));
    expect(state.over).toBe(true);
    expect(cues).toContainEqual({ kind: "roundOver", round: 2, score: 5000, bonus: false });
  });

  it("brings ships in lane by lane, at most one to a lane, and patrol boats change speed", () => {
    let zigs = 0;
    let patrols = 0;
    for (let seed = 1; seed <= 5; seed++) {
      play(seed, 0.9, (state, cues) => {
        for (const lane of ["near", "mid", "far"] as const) {
          expect(state.ships.filter((s) => SHIPS[s.kind].lane === lane).length).toBeLessThanOrEqual(1);
        }
        if (kinds(cues).includes("zig")) zigs += 1;
        if (cues.some((cue) => cue.kind === "ship" && (cue as { shipKind?: string }).shipKind === "patrol")) patrols += 1;
      });
    }
    expect(patrols).toBeGreaterThan(0);
    expect(zigs).toBeGreaterThan(0);
  });

  it("replays a played run exactly from its seed and input log", () => {
    for (const seed of [3, 17, 99]) {
      const played = play(seed, 0.92);
      expect(played.state.over).toBe(true);
      const replayed = replayRun(torpedo, "standard", seed, played.log, 1_000_000);
      expect(replayed).toEqual(played.state);
      expect(torpedo.scoreOf(replayed)).toBe(played.state.score);
    }
  });

  it("scores a good player well, often into the bonus round", () => {
    const scores = [1, 2, 3, 4, 5, 6].map((seed) => play(seed, 0.97).state);
    expect(scores.every((state) => state.score > 0)).toBe(true);
    expect(scores.some((state) => state.rounds.length === 2)).toBe(true);
    for (const state of scores) {
      const fired = state.rounds.reduce((sum, round) => sum + round.fired, 0);
      expect(fired).toBeLessThanOrEqual(TORPEDOES * state.rounds.length);
      expect(state.rounds.reduce((sum, round) => sum + round.score, 0)).toBe(state.score);
    }
  });

  it("reads variants and inputs off the wire strictly", () => {
    expect(parseVariant("standard")).toBe("standard");
    expect(() => parseVariant("A")).toThrow();
    expect(parseInput({ turn: -1, fire: true })).toEqual({ turn: -1, fire: true });
    expect(() => parseInput({ turn: 2, fire: false })).toThrow();
    expect(() => parseInput({ turn: 0 })).toThrow();
    expect(() => parseInput([0, false])).toThrow();
    expect(ARCADE_IDS).toContain("torpedo");
    expect(getArcadeGame("torpedo")).toBe(torpedo);
  });
});
