// Torpedo Run, the rules (docs/plan.md → Torpedo Run). A submarine's periscope
// looks out over three lanes of sea — near, mid and far — where ships cross
// from one side to the other, far off under the horizon. The player turns the
// periscope a little either way (±20°) and fires. The torpedo leaves from under
// the sight and leans the way the periscope is turned (owner, 2026-10-29, after
// the old cabinet): it runs on a straight course from the sight's bearing to
// LEAN more of it again on the horizon, so turned left 20° it is off to the left
// of the sight by the time it gets out to the ships. A torpedo is slow, reaching the near lane
// first and the far lane last, so a ship must be led. One torpedo in the water at a time, ten to
// a round. A round that comes to 1 500 earns one bonus round of ten more,
// played on in the same run, so a run is one replayable score.
//
// Everything is whole numbers: bearings in tenths of a degree, ship positions
// on the same scale, time in ticks. The replay is exact on any engine.
import { randomStep } from "../../random.js";
import { ArcadeOverError, type ArcadeCue, type ArcadeTick } from "../game.js";

export type TorpedoVariant = "standard";
export const VARIANTS: readonly TorpedoVariant[] = ["standard"];

/** Which way the sight moves this tick: -1 left, 0 still, 1 right. */
export type Turn = -1 | 0 | 1;

/** What the player does on a tick: which way the sight moves, and whether
 *  the fire button is down. Fire launches only when the tube is free. */
export interface TorpedoInput {
  turn: Turn;
  fire: boolean;
}

export const INITIAL_INPUT: TorpedoInput = { turn: 0, fire: false };

export type Lane = "near" | "mid" | "far";
export const LANES: readonly Lane[] = ["near", "mid", "far"];

export type ShipKind = "tanker" | "cargo" | "destroyer" | "patrol";
export const SHIP_KINDS: readonly ShipKind[] = ["tanker", "cargo", "destroyer", "patrol"];

interface ShipClass {
  points: number;
  lane: Lane;
  /** Bearing units a tick (tenths of a degree). */
  speed: number;
  /** Half the ship's width as seen through the periscope, in bearing units. */
  half: number;
}

export const SHIPS: Record<ShipKind, ShipClass> = {
  tanker: { points: 100, lane: "near", speed: 2, half: 52 },
  cargo: { points: 200, lane: "mid", speed: 3, half: 38 },
  destroyer: { points: 300, lane: "far", speed: 4, half: 26 },
  patrol: { points: 500, lane: "mid", speed: 6, half: 19 }
};

/** One tick, in milliseconds: twenty a second. */
export const TICK_MS = 50;
/** Half the field of attack: the lens shows this far either side of dead
 *  ahead, all of it at once. Ships come in and go out at its edges. ±36°, so
 *  the ships are big enough in the lens to read as ships. */
export const FIELD_HALF = 360;
/** The sight moves at most this far either way of dead ahead: ±20°. With
 *  the lean, a torpedo still reaches the edge of the field. */
export const MAX_BEARING = 200;
/** Bearing units the sight moves in a tick. */
export const SIGHT_SPEED = 10;
/** Ticks a torpedo runs before it reaches each lane. */
export const RANGE: Record<Lane, number> = { near: 24, mid: 38, far: 56 };
/** How far out to the horizon each lane is, in percent of the way: the
 *  ships keep far off, under the horizon, with the lanes far enough apart to
 *  see which one a torpedo has got to. */
export const REACH: Record<Lane, number> = { near: 86, mid: 92, far: 97 };
/** How much a torpedo leans the way the periscope is turned, in percent of
 *  the turn: on the horizon its course is off dead ahead by the sight's
 *  bearing and LEAN of it again. */
export const LEAN = 75;
/** Torpedoes a round. */
export const TORPEDOES = 10;
/** A round's clock: ninety seconds, so a run without a shot still ends. */
export const ROUND_TICKS = 1800;
/** The score that earns the bonus round. */
export const BONUS_AT = 1500;
/** Rounds at most: the first and the bonus one. */
export const ROUNDS = 2;
/** Ticks a hit ship takes to go under. */
export const SINK_TICKS = 24;
/** A patrol boat changes speed this often… */
const ZIGZAG_TICKS: [from: number, span: number] = [20, 30];
/** …to one of these, never stopping and never turning back. */
const PATROL_SPEEDS: readonly number[] = [3, 5, 7, 9];
/** Chance the mid lane sends a patrol boat rather than a cargo ship. */
const PATROL_CHANCE = 0.25;
/** Ticks an empty lane waits before its next ship comes in. */
const LANE_WAIT: [from: number, span: number] = [20, 60];

export interface Ship {
  /** Numbered from 1 in the order they came in, for the web app's keys. */
  id: number;
  kind: ShipKind;
  /** Bearing of the ship's middle; off the field until it comes in. */
  x: number;
  /** 1 heading right, -1 heading left. */
  dir: 1 | -1;
  speed: number;
  /** Ticks to the patrol boat's next change of speed (0 for the others). */
  zig: number;
  /** Ticks left going under, once hit; null afloat. */
  sinking: number | null;
}

export interface Torpedo {
  bearing: number;
  /** Ticks since launch. */
  run: number;
}

/** One round's account, for the round-over card. */
export interface RoundTally {
  fired: number;
  hits: Record<ShipKind, number>;
  score: number;
}

export type Phase =
  /** Torpedoes running and ships crossing. */
  | "play"
  /** The first round is over and earned the bonus: waiting for fire to start it. */
  | "bonus";

export interface TorpedoState {
  variant: TorpedoVariant;
  rng: number;
  tick: number;
  phase: Phase;
  /** 1 for the first round, 2 for the bonus round. */
  round: number;
  /** Ticks left on this round's clock. */
  clock: number;
  /** Where the sight is on the horizon. */
  bearing: number;
  torpedoesLeft: number;
  torpedo: Torpedo | null;
  /** At most one ship to a lane. */
  ships: Ship[];
  /** Ticks each empty lane waits before its next ship. */
  waits: Record<Lane, number>;
  nextId: number;
  /** The whole run's score, the score of record. */
  score: number;
  /** One per round started. */
  rounds: RoundTally[];
  /** The bonus round has been earned. */
  bonus: boolean;
  over: boolean;
}

class Dice {
  constructor(public rng: number) {}
  next(): number {
    const [value, next] = randomStep(this.rng);
    this.rng = next;
    return value;
  }
  between(from: number, span: number): number {
    return from + Math.floor(this.next() * span);
  }
}

const emptyTally = (): RoundTally => ({ fired: 0, hits: { tanker: 0, cargo: 0, destroyer: 0, patrol: 0 }, score: 0 });

export function parseVariant(input: unknown): TorpedoVariant {
  if (input !== "standard") throw new Error("Torpedo Run is played as the standard game");
  return input;
}

export function parseInput(input: unknown): TorpedoInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("An input is { turn, fire }");
  const { turn, fire } = input as Record<string, unknown>;
  if (turn !== -1 && turn !== 0 && turn !== 1) throw new Error("The sight moves -1, 0 or 1");
  if (typeof fire !== "boolean") throw new Error("Fire is true or false");
  return { turn, fire };
}

export function createRun(variant: TorpedoVariant, seed: number): TorpedoState {
  const dice = new Dice(seed >>> 0);
  // The far lane fills first, the near one last, so the sea opens out.
  const waits = { near: dice.between(30, 30), mid: dice.between(10, 20), far: dice.between(0, 10) };
  return {
    variant,
    rng: dice.rng,
    tick: 0,
    phase: "play",
    round: 1,
    clock: ROUND_TICKS,
    bearing: 0,
    torpedoesLeft: TORPEDOES,
    torpedo: null,
    ships: [],
    waits,
    nextId: 1,
    score: 0,
    rounds: [emptyTally()],
    bonus: false,
    over: false
  };
}

export function periodOf(): number {
  return TICK_MS;
}

/** The lane a torpedo has just reached on this run tick, if any. */
const laneAt = (run: number): Lane | undefined => LANES.find((lane) => RANGE[lane] === run);

/** Where a torpedo fired down `bearing` crosses a lane: it leaves from under
 *  the sight and has leant LEAN of the turn, as far as the lane is out. */
export const courseAt = (bearing: number, lane: Lane) => Math.round((bearing * (10_000 + LEAN * REACH[lane])) / 10_000);

/** The bearing to fire down for a torpedo to cross a lane at `x`. */
export const aimFor = (x: number, lane: Lane) => Math.round((x * 10_000) / (10_000 + LEAN * REACH[lane]));

/** Whether a ship afloat covers a bearing. */
export const covers = (ship: Ship, bearing: number) => ship.sinking === null && Math.abs(ship.x - bearing) <= SHIPS[ship.kind].half;

/** The ship a torpedo fired now down `bearing` would meet if nothing moved
 *  but the torpedo — what the crosshair has on it. */
export function inSights(state: Pick<TorpedoState, "ships">, bearing: number): Ship | undefined {
  return LANES.map((lane) => state.ships.find((ship) => SHIPS[ship.kind].lane === lane && covers(ship, courseAt(bearing, lane)))).find(Boolean);
}

function launchShip(dice: Dice, lane: Lane, id: number): Ship {
  const kind: ShipKind = lane === "near" ? "tanker" : lane === "far" ? "destroyer" : dice.next() < PATROL_CHANCE ? "patrol" : "cargo";
  const dir = dice.next() < 0.5 ? 1 : -1;
  const ship = SHIPS[kind];
  const patrol = kind === "patrol";
  return {
    id,
    kind,
    x: -dir * (FIELD_HALF + ship.half),
    dir,
    speed: patrol ? PATROL_SPEEDS[dice.between(0, PATROL_SPEEDS.length)] : ship.speed,
    zig: patrol ? dice.between(...ZIGZAG_TICKS) : 0,
    sinking: null
  };
}

export function tick(state: TorpedoState, input: TorpedoInput): ArcadeTick<TorpedoState> {
  if (state.over) throw new ArcadeOverError();
  const cues: ArcadeCue[] = [];
  const next: TorpedoState = { ...state, tick: state.tick + 1 };

  // Between rounds the sea waits for the player to fire the bonus round in.
  if (state.phase === "bonus") {
    if (input.fire) {
      next.phase = "play";
      next.round = state.round + 1;
      next.clock = ROUND_TICKS;
      next.torpedoesLeft = TORPEDOES;
      next.rounds = [...state.rounds, emptyTally()];
      cues.push({ kind: "round", round: next.round });
    }
    return { state: next, cues };
  }

  const dice = new Dice(state.rng);
  const tally: RoundTally = { ...state.rounds[state.rounds.length - 1] };
  tally.hits = { ...tally.hits };
  next.waits = { ...state.waits };
  next.clock = Math.max(0, state.clock - 1);

  // The sight moves along the horizon, as far as it goes.
  next.bearing = Math.max(-MAX_BEARING, Math.min(MAX_BEARING, state.bearing + input.turn * SIGHT_SPEED));

  // Ships move; a sunk one is gone, and so is one that has crossed the sea.
  const ships: Ship[] = [];
  for (const old of state.ships) {
    const ship = { ...old };
    if (ship.sinking !== null) {
      ship.sinking -= 1;
      if (ship.sinking > 0) ships.push(ship);
      continue;
    }
    if (ship.kind === "patrol" && --ship.zig <= 0) {
      ship.speed = PATROL_SPEEDS[dice.between(0, PATROL_SPEEDS.length)];
      ship.zig = dice.between(...ZIGZAG_TICKS);
      cues.push({ kind: "zig", ship: ship.id });
    }
    ship.x += ship.dir * ship.speed;
    if (Math.abs(ship.x) > FIELD_HALF + SHIPS[ship.kind].half) continue;
    ships.push(ship);
  }
  next.ships = ships;

  // The torpedo runs on, and meets what is in its lane when it gets there.
  if (state.torpedo) {
    const torpedo = { bearing: state.torpedo.bearing, run: state.torpedo.run + 1 };
    const lane = laneAt(torpedo.run);
    const target = lane && next.ships.find((ship) => SHIPS[ship.kind].lane === lane && covers(ship, courseAt(torpedo.bearing, lane)));
    if (target) {
      const points = SHIPS[target.kind].points;
      next.ships = next.ships.map((ship) => (ship === target ? { ...ship, sinking: SINK_TICKS } : ship));
      next.score = state.score + points;
      tally.hits[target.kind] += 1;
      tally.score += points;
      next.torpedo = null;
      cues.push({ kind: "hit", ship: target.id, shipKind: target.kind, lane, points, bearing: torpedo.bearing, score: next.score });
      if (state.round === 1 && !state.bonus && next.score >= BONUS_AT) {
        next.bonus = true;
        cues.push({ kind: "bonus", score: next.score });
      }
    } else if (torpedo.run >= RANGE.far) {
      next.torpedo = null;
      cues.push({ kind: "miss", bearing: torpedo.bearing });
    } else {
      next.torpedo = torpedo;
      if (lane) cues.push({ kind: "pass", lane });
    }
  }

  // Fire, when the tube is free and the round has torpedoes and time left.
  if (input.fire && !next.torpedo && !state.torpedo && next.torpedoesLeft > 0 && next.clock > 0) {
    next.torpedo = { bearing: next.bearing, run: 0 };
    next.torpedoesLeft = state.torpedoesLeft - 1;
    tally.fired += 1;
    cues.push({ kind: "launch", bearing: next.bearing, left: next.torpedoesLeft });
  }

  // Empty lanes count down to their next ship.
  for (const lane of LANES) {
    if (next.ships.some((ship) => SHIPS[ship.kind].lane === lane)) continue;
    if (next.waits[lane] > 0) {
      next.waits[lane] -= 1;
    } else {
      const ship = launchShip(dice, lane, next.nextId);
      next.nextId += 1;
      next.ships = [...next.ships, ship];
      next.waits[lane] = dice.between(...LANE_WAIT);
      cues.push({ kind: "ship", ship: ship.id, shipKind: ship.kind });
    }
  }

  next.rounds = [...state.rounds.slice(0, -1), tally];
  next.rng = dice.rng;

  // The round ends with its last torpedo spent, or its clock, once the water is clear.
  const spent = next.torpedoesLeft === 0 || next.clock === 0;
  if (spent && !next.torpedo) {
    if (next.bonus && next.round < ROUNDS) {
      next.phase = "bonus";
      next.torpedo = null;
      cues.push({ kind: "roundOver", round: next.round, score: next.score, bonus: true });
    } else {
      next.over = true;
      cues.push({ kind: "roundOver", round: next.round, score: next.score, bonus: false });
      cues.push({ kind: "over", score: next.score });
    }
  }
  return { state: next, cues };
}
