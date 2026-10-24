// Sputnik Catch («Лови спутник!»), the rules (docs/plan.md → Sputnik Catch).
// Four station modules launch sputniks down four rails; robot РОБ-1 holds his
// net at the foot of one. Each tick every sputnik moves one step; off the end
// of its rail it lands in the net or crashes, and a little alien climbs out of
// the wreck and runs off. Three aliens loose ends the run. While Belka the
// space dog looks out of her porthole a crash counts half an alien.
import { randomStep } from "../../random.js";
import { ArcadeOverError, type ArcadeCue, type ArcadeTick } from "../game.js";

export type SputnikVariant = "A" | "B";
export const VARIANTS: readonly SputnikVariant[] = ["A", "B"];

/** A rail, and the net position at its foot: 0 upper left, 1 lower left,
 *  2 upper right, 3 lower right. */
export type Rail = 0 | 1 | 2 | 3;
export const RAILS: readonly Rail[] = [0, 1, 2, 3];

export type Side = "left" | "right";
export const sideOf = (rail: Rail): Side => (rail < 2 ? "left" : "right");

/** Steps along a rail: a sputnik shows at 0…STEPS-1 and lands on the next tick. */
export const STEPS = 5;
/** Ticks the alien takes to run off the screen. */
export const ALIEN_STEPS = 4;
/** Aliens loose, in halves, that end the run: three whole ones. */
export const LOST_HALVES = 6;
/** Scores at which every alien is rounded up again. */
export const PARDONS: readonly number[] = [200, 500];
/** The score display has four digits and wraps, as the handheld's did. */
export const DISPLAY_WRAP = 10000;

/** Chance a free rail launches on a tick when fewer than the most are flying. */
const LAUNCH_CHANCE = 0.6;
/** A rail waits while its own last sputnik is still this near the top. */
const LAUNCH_GAP = 1;

interface Curve {
  /** The first tick's length, in ms. */
  period: number;
  /** Sputniks in flight at most, at the start and at the most. */
  flying: number;
  maxFlying: number;
}
const CURVES: Record<SputnikVariant, Curve> = {
  A: { period: 620, flying: 1, maxFlying: 4 },
  B: { period: 460, flying: 2, maxFlying: 5 }
};
/** The tick shortens this much per point within each hundred… */
const PER_POINT_MS = 2.4;
/** …and this much per hundred, never below the floor. */
const PER_HUNDRED_MS = 40;
export const FLOOR_MS = 210;
/** One more sputnik may fly per this many points. */
const POINTS_PER_SPUTNIK = 20;
/** The alien's ticks are slow, whatever the speed. */
export const ALIEN_MS = 240;

export interface Sputnik {
  rail: Rail;
  step: number;
}

export interface SputnikState {
  variant: SputnikVariant;
  /** The generator's state (random.ts randomStep): the run stays plain JSON. */
  rng: number;
  tick: number;
  /** Sputniks caught, the score of record. The display wraps; this does not. */
  caught: number;
  /** Aliens loose, in halves. */
  halves: number;
  /** Where the net was on the last tick. */
  net: Rail;
  sputniks: Sputnik[];
  belka: { out: boolean; ticks: number };
  /** A crash in progress: the wreck's side and how far the alien has run. */
  crash: { side: Side; step: number } | null;
  over: boolean;
}

/** Draws from the run's generator, keeping it in a local copy of the state. */
class Dice {
  constructor(public rng: number) {}
  next(): number {
    const [value, next] = randomStep(this.rng);
    this.rng = next;
    return value;
  }
  /** A whole number from `from` to `from + span - 1`. */
  between(from: number, span: number): number {
    return from + Math.floor(this.next() * span);
  }
}

/** Ticks before Belka looks out first, and between her visits. */
const belkaAway = (dice: Dice, first: boolean) => (first ? dice.between(25, 30) : dice.between(40, 60));
/** Ticks she stays at the porthole. */
const belkaStays = (dice: Dice) => dice.between(16, 16);

export function parseVariant(input: unknown): SputnikVariant {
  if (input !== "A" && input !== "B") throw new Error("Sputnik Catch is played as Game A or Game B");
  return input;
}

export function parseInput(input: unknown): Rail {
  if (input !== 0 && input !== 1 && input !== 2 && input !== 3) throw new Error("The net is at rail 0, 1, 2 or 3");
  return input;
}

export function createRun(variant: SputnikVariant, seed: number): SputnikState {
  const dice = new Dice(seed >>> 0);
  const away = belkaAway(dice, true);
  return {
    variant,
    rng: dice.rng,
    tick: 0,
    caught: 0,
    halves: 0,
    net: 0,
    sputniks: [],
    belka: { out: false, ticks: away },
    crash: null,
    over: false
  };
}

/** Most sputniks in flight at this score. */
export function maxFlying(state: Pick<SputnikState, "variant" | "caught">): number {
  const curve = CURVES[state.variant];
  return Math.min(curve.maxFlying, curve.flying + Math.floor(state.caught / POINTS_PER_SPUTNIK));
}

export function periodOf(state: SputnikState): number {
  if (state.crash) return ALIEN_MS;
  const { caught } = state;
  const period = CURVES[state.variant].period - (caught % 100) * PER_POINT_MS - Math.floor(caught / 100) * PER_HUNDRED_MS;
  return Math.max(FLOOR_MS, Math.round(period));
}

/** What the four LCD digits show. */
export function displayScore(state: Pick<SputnikState, "caught">): number {
  return state.caught % DISPLAY_WRAP;
}

export function tick(state: SputnikState, net: Rail): ArcadeTick<SputnikState> {
  if (state.over) throw new ArcadeOverError();
  const cues: ArcadeCue[] = [];
  const next: SputnikState = { ...state, net, tick: state.tick + 1, belka: { ...state.belka } };

  // The alien runs off; the rails stay empty until it is gone.
  if (state.crash) {
    const step = state.crash.step + 1;
    cues.push({ kind: "alien", side: state.crash.side, step });
    if (step < ALIEN_STEPS) {
      next.crash = { side: state.crash.side, step };
    } else {
      next.crash = null;
      if (next.halves >= LOST_HALVES) {
        next.over = true;
        cues.push({ kind: "over", caught: next.caught });
      }
    }
    return { state: next, cues };
  }

  const moved = state.sputniks.map((sputnik) => ({ rail: sputnik.rail, step: sputnik.step + 1 }));
  // One launch a tick means no two sputniks share a step, so at most one lands.
  const landed = moved.find((sputnik) => sputnik.step >= STEPS);
  next.sputniks = moved.filter((sputnik) => sputnik.step < STEPS);

  if (landed && landed.rail !== net) {
    const half = state.belka.out;
    next.halves = state.halves + (half ? 1 : 2);
    next.sputniks = [];
    next.crash = { side: sideOf(landed.rail), step: 0 };
    cues.push({ kind: "crash", rail: landed.rail, side: sideOf(landed.rail), half });
    return { state: next, cues };
  }
  if (landed) {
    next.caught = state.caught + 1;
    cues.push({ kind: "catch", rail: landed.rail, caught: next.caught });
    if (PARDONS.includes(next.caught)) {
      next.halves = 0;
      cues.push({ kind: "pardon", caught: next.caught });
    }
  } else if (next.sputniks.length > 0) {
    const lead = next.sputniks.reduce((a, b) => (b.step > a.step ? b : a));
    cues.push({ kind: "step", rail: lead.rail });
  }

  const dice = new Dice(state.rng);
  if (next.sputniks.length < maxFlying(next) && dice.next() < LAUNCH_CHANCE) {
    const free = RAILS.filter((rail) => !next.sputniks.some((sputnik) => sputnik.rail === rail && sputnik.step <= LAUNCH_GAP));
    if (free.length > 0) {
      const rail = free[dice.between(0, free.length)];
      next.sputniks = [...next.sputniks, { rail, step: 0 }];
      cues.push({ kind: "launch", rail });
    }
  }

  if (next.belka.out) {
    if (--next.belka.ticks <= 0) {
      next.belka = { out: false, ticks: belkaAway(dice, false) };
      cues.push({ kind: "belka", out: false });
    }
  } else if (--next.belka.ticks <= 0) {
    next.belka = { out: true, ticks: belkaStays(dice) };
    cues.push({ kind: "belka", out: true });
  }

  next.rng = dice.rng;
  return { state: next, cues };
}
