import { describe, expect, it } from "vitest";
import { GAME_IDS } from "../src/registry.js";
import { seededRandom } from "../src/random.js";
import { ArcadeOverError, ArcadeReplayError, parseInputLog, parseSeed, replayRun } from "../src/arcade/game.js";
import { ARCADE_IDS, getArcadeGame } from "../src/arcade/registry.js";
import { sputnik } from "../src/arcade/sputnik/index.js";
import {
  ALIEN_MS,
  ALIEN_STEPS,
  FLOOR_MS,
  STEPS,
  createRun,
  displayScore,
  maxFlying,
  parseInput,
  parseVariant,
  periodOf,
  tick,
  type Rail,
  type SputnikState,
  type SputnikVariant
} from "../src/arcade/sputnik/rules.js";

/** A run in a chosen position: Belka away for good unless the test says so. */
function run(over: Partial<SputnikState> = {}): SputnikState {
  return { ...createRun("A", 1), belka: { out: false, ticks: 1000 }, ...over };
}

const kinds = (cues: { kind: string }[]) => cues.map((cue) => cue.kind);

/** A player who holds the net under the lowest sputnik, and is wrong now and
 *  then. Returns the end of the run and the input log it made. */
function play(variant: SputnikVariant, seed: number, skill: number, check?: (state: SputnikState, cues: { kind: string }[]) => void) {
  const random = seededRandom(seed * 31 + 7);
  let state = createRun(variant, seed);
  let net: Rail = 0;
  const log: [number, Rail][] = [];
  while (!state.over && state.tick < 100_000) {
    const lead = state.sputniks.reduce<SputnikState["sputniks"][number] | null>((a, b) => (!a || b.step > a.step ? b : a), null);
    let want: Rail = lead ? lead.rail : net;
    if (random() > skill) want = Math.floor(random() * 4) as Rail;
    if (want !== net) {
      net = want;
      log.push([state.tick, net]);
    }
    const result = tick(state, net);
    check?.(result.state, result.cues);
    state = result.state;
  }
  return { state, log };
}

describe("Sputnik Catch rules", () => {
  it("starts empty, deterministic and plain JSON", () => {
    const state = createRun("B", 42);
    expect(state).toEqual(createRun("B", 42));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(state).toMatchObject({ variant: "B", tick: 0, caught: 0, halves: 0, sputniks: [], crash: null, over: false });
  });

  it("catches a sputnik that lands in the net", () => {
    const { state, cues } = tick(run({ sputniks: [{ rail: 2, step: STEPS - 1 }] }), 2);
    expect(state.caught).toBe(1);
    expect(state.sputniks.some((sputnik) => sputnik.step >= STEPS)).toBe(false);
    expect(cues).toContainEqual({ kind: "catch", rail: 2, caught: 1 });
    expect(state.halves).toBe(0);
  });

  it("crashes one that lands anywhere else, and the alien runs off before play resumes", () => {
    let { state, cues } = tick(run({ sputniks: [{ rail: 3, step: STEPS - 1 }, { rail: 0, step: 1 }] }), 0);
    expect(cues).toContainEqual({ kind: "crash", rail: 3, side: "right", half: false });
    expect(state.halves).toBe(2);
    expect(state.sputniks).toEqual([]);
    expect(state.crash).toEqual({ side: "right", step: 0 });
    expect(periodOf(state)).toBe(ALIEN_MS);

    for (let step = 1; step <= ALIEN_STEPS; step++) {
      ({ state, cues } = tick(state, 1));
      expect(cues).toEqual([{ kind: "alien", side: "right", step }]);
      expect(state.sputniks).toEqual([]);
    }
    expect(state.crash).toBeNull();
    expect(state.over).toBe(false);
  });

  it("counts half an alien while Belka is at the porthole", () => {
    const { state, cues } = tick(run({ belka: { out: true, ticks: 10 }, sputniks: [{ rail: 1, step: STEPS - 1 }] }), 0);
    expect(state.halves).toBe(1);
    expect(cues).toContainEqual({ kind: "crash", rail: 1, side: "left", half: true });
  });

  it("rounds every alien up at 200 and 500, and only there", () => {
    const at = (caught: number) => tick(run({ caught, halves: 4, sputniks: [{ rail: 0, step: STEPS - 1 }] }), 0);
    for (const pardon of [200, 500]) {
      const { state, cues } = at(pardon - 1);
      expect(state.halves).toBe(0);
      expect(cues).toContainEqual({ kind: "pardon", caught: pardon });
    }
    const { state, cues } = at(299);
    expect(state.halves).toBe(4);
    expect(kinds(cues)).not.toContain("pardon");
  });

  it("ends when the third alien has run off, and then refuses to tick", () => {
    let { state } = tick(run({ halves: 4, sputniks: [{ rail: 2, step: STEPS - 1 }] }), 0);
    expect(state.halves).toBe(6);
    let cues: { kind: string }[] = [];
    for (let step = 1; step <= ALIEN_STEPS; step++) ({ state, cues } = tick(state, 0));
    expect(state.over).toBe(true);
    expect(cues).toContainEqual({ kind: "over", caught: 0 });
    expect(() => tick(state, 0)).toThrow(ArcadeOverError);
  });

  it("brings Belka out and back on her own clock", () => {
    let state = run({ belka: { out: false, ticks: 1 } });
    let result = tick(state, 0);
    expect(result.state.belka.out).toBe(true);
    expect(result.cues).toContainEqual({ kind: "belka", out: true });
    state = { ...result.state, belka: { out: true, ticks: 1 } };
    result = tick(state, 0);
    expect(result.state.belka.out).toBe(false);
    expect(result.state.belka.ticks).toBeGreaterThanOrEqual(40);
  });

  it("never lands two sputniks on one tick, crowds a rail, or flies too many", () => {
    let runs = 0;
    for (const variant of ["A", "B"] as const) {
      for (let seed = 1; seed <= 60; seed++) {
        play(variant, seed, 0.97, (state, cues) => {
          const steps = state.sputniks.map((sputnik) => sputnik.step);
          expect(new Set(steps).size).toBe(steps.length);
          for (const a of state.sputniks) {
            for (const b of state.sputniks) {
              if (a !== b && a.rail === b.rail) expect(Math.abs(a.step - b.step)).toBeGreaterThanOrEqual(2);
            }
          }
          expect(state.sputniks.length).toBeLessThanOrEqual(maxFlying(state));
          expect(cues.filter((cue) => cue.kind === "catch" || cue.kind === "crash").length).toBeLessThanOrEqual(1);
        });
        runs++;
      }
    }
    expect(runs).toBe(120);
  });

  it("speeds up within each hundred and per hundred, down to the floor", () => {
    expect(periodOf(run({ variant: "A", caught: 0 }))).toBe(620);
    expect(periodOf(run({ variant: "B", caught: 0 }))).toBe(460);
    expect(periodOf(run({ variant: "A", caught: 50 }))).toBe(500);
    expect(periodOf(run({ variant: "A", caught: 150 }))).toBe(460);
    expect(periodOf(run({ variant: "B", caught: 2000 }))).toBe(FLOOR_MS);
  });

  it("lets more fly as the score climbs, up to each game's most", () => {
    expect(maxFlying({ variant: "A", caught: 0 })).toBe(1);
    expect(maxFlying({ variant: "A", caught: 20 })).toBe(2);
    expect(maxFlying({ variant: "A", caught: 400 })).toBe(4);
    expect(maxFlying({ variant: "B", caught: 0 })).toBe(2);
    expect(maxFlying({ variant: "B", caught: 400 })).toBe(5);
  });

  it("wraps the display at 9999 but keeps the score of record", () => {
    const state = run({ caught: 10003 });
    expect(displayScore(state)).toBe(3);
    expect(sputnik.scoreOf(state)).toBe(10003);
  });

  it("never changes the state it was given", () => {
    const deepFreeze = <T>(value: T): T => {
      if (value && typeof value === "object") Object.values(value).forEach(deepFreeze);
      return Object.freeze(value);
    };
    const state = deepFreeze(run({ sputniks: [{ rail: 0, step: STEPS - 1 }, { rail: 2, step: 2 }], belka: { out: true, ticks: 1 } }));
    expect(() => tick(state, 1)).not.toThrow();
    expect(() => tick(state, 0)).not.toThrow();
  });

  it("parses variants and net positions strictly", () => {
    expect(parseVariant("B")).toBe("B");
    expect(() => parseVariant("C")).toThrow();
    expect(parseInput(3)).toBe(3);
    expect(() => parseInput(4)).toThrow();
    expect(() => parseInput("1")).toThrow();
  });
});

describe("arcade replay", () => {
  it("replays a run from its seed and input log to the same end", () => {
    for (const variant of ["A", "B"] as const) {
      for (const seed of [3, 77, 4021]) {
        const { state, log } = play(variant, seed, 0.95);
        expect(state.over).toBe(true);
        expect(state.caught).toBeGreaterThan(0);
        const replayed = replayRun(sputnik, variant, seed, parseInputLog(sputnik.parseInput, JSON.parse(JSON.stringify(log)), 100_000), 100_000);
        expect(replayed).toEqual(state);
      }
    }
  });

  it("carries on the same after a trip through JSON, as a paused run would", () => {
    let state = createRun("A", 9);
    for (let i = 0; i < 60; i++) {
      const lead = [...state.sputniks].sort((a, b) => b.step - a.step)[0];
      state = tick(state, lead?.rail ?? 0).state;
    }
    expect(state.over).toBe(false);
    expect(state.caught).toBeGreaterThan(0);
    const thawed = JSON.parse(JSON.stringify(state)) as SputnikState;
    expect(tick(thawed, 1)).toEqual(tick(state, 1));
  });

  it("gives up on a log that keeps a run going past the limit", () => {
    expect(() => replayRun(sputnik, "A", 5, [], 3)).toThrow(ArcadeReplayError);
  });

  it("rejects a malformed log or seed", () => {
    expect(() => parseInputLog(sputnik.parseInput, "nope", 10)).toThrow(ArcadeReplayError);
    expect(() => parseInputLog(sputnik.parseInput, [[5, 1], [4, 2]], 10)).toThrow(/never go down/);
    expect(() => parseInputLog(sputnik.parseInput, [[1, 7]], 10)).toThrow(/bad input at tick 1/);
    expect(() => parseInputLog(sputnik.parseInput, [[1, 1], [2, 2]], 1)).toThrow(/too long/);
    expect(parseInputLog(sputnik.parseInput, [[0, 1], [0, 2], [9, 3]], 10)).toEqual([[0, 1], [0, 2], [9, 3]]);
    expect(parseSeed(4294967295)).toBe(4294967295);
    expect(() => parseSeed(-1)).toThrow(ArcadeReplayError);
    expect(() => parseSeed(1.5)).toThrow(ArcadeReplayError);
  });

  it("keeps arcade games out of the two-player registry", () => {
    expect(ARCADE_IDS).toContain("sputnik");
    expect(GAME_IDS).not.toContain("sputnik");
    expect(getArcadeGame("sputnik")).toBe(sputnik);
  });
});
