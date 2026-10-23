// Star Battle (Звёздный бой): the squared-paper game of hidden fleets, in orbit
// since the app is called iSputnik. Each player deploys a fleet of spacecraft in
// their own 10×10 sector, then they take turns calling a square of the other's.
// The rules are the common Russian ones for the sea version, Морской бой:
//
//  - Fleet: one four-module vessel, two three-module, three two-module, four
//    single-module sputniks ("classic"); a "small" fleet for a quick game is one
//    three, two twos, three singles. Vessels are straight lines and may not
//    touch, not even at a corner.
//  - Placing is the first move of each seat: seat 0 deploys its fleet, then seat 1;
//    seat 0 then fires first.
//  - A hit earns another shot; a miss passes the turn. When a vessel's every
//    module is hit it is destroyed, and the squares around it — a debris field,
//    where nothing can be — are marked as misses for the shooter.
//  - The game ends when a fleet is wholly destroyed. Score is vessels destroyed.
//
// The state carries both fleets, so the full state is a secret: a view for one
// seat (viewFor) keeps the other side's destroyed vessels only. The server sends views;
// a local game holds the whole thing and shows one side at a time.
import { IllegalMoveError, otherPlayer, type GameStatus, type PlayerIndex } from "../game.js";

export const SECTOR_SIZE = 10;

export const FLEET_KINDS = ["classic", "small"] as const;
export type FleetKind = (typeof FLEET_KINDS)[number];

/** Deck counts of the vessels in each fleet, longest first. */
export const FLEETS: Record<FleetKind, readonly number[]> = {
  classic: [4, 3, 3, 2, 2, 2, 1, 1, 1, 1],
  small: [3, 2, 2, 1, 1, 1]
};

export interface StarBattleOptions {
  fleet: FleetKind;
}

export const DEFAULT_OPTIONS: StarBattleOptions = { fleet: "classic" };

/** A vessel: its bow square, its length in decks, and which way it lies. The
 *  squares are (x..x+length-1, y) when horizontal, (x, y..y+length-1) otherwise. */
export interface Vessel {
  x: number;
  y: number;
  length: number;
  horizontal: boolean;
}

export type StarBattleMove =
  | { kind: "place"; vessels: Vessel[] }
  | { kind: "shoot"; x: number; y: number };

/** What a shooter knows of a square of the other's sector. */
export const UNKNOWN = 0;
export const MISS = 1;
export const HIT = 2;

export type ShotResult = "miss" | "hit" | "destroyed";

export interface LastShot {
  by: PlayerIndex;
  x: number;
  y: number;
  result: ShotResult;
}

export interface StarBattleState {
  size: number;
  fleet: FleetKind;
  /** Each seat's fleet once deployed. In a view for the other seat (viewFor) only
   *  the vessels already destroyed remain; `placed` still says whether it was deployed. */
  vessels: [Vessel[] | null, Vessel[] | null];
  placed: [boolean, boolean];
  /** shots[p]: the squares p has fired at — the other seat's sector — size*size
   *  cells, row-major: UNKNOWN, MISS or HIT. */
  shots: [number[], number[]];
  /** Vessels destroyed by each seat. */
  destroyed: [number, number];
  lastShot: LastShot | null;
  moveCount: number;
  status: GameStatus;
}

export type Phase = "placing" | "battle" | "over";

export function parseOptions(input: unknown): StarBattleOptions {
  if (typeof input !== "object" || input === null) throw new Error("Options must be an object");
  const { fleet } = input as Record<string, unknown>;
  const kind = fleet ?? "classic";
  if (typeof kind !== "string" || !(FLEET_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Fleet must be one of ${FLEET_KINDS.join(", ")}`);
  }
  return { fleet: kind as FleetKind };
}

function parseVessel(input: unknown): Vessel {
  if (typeof input !== "object" || input === null) throw new IllegalMoveError("A vessel is an object");
  const { x, y, length, horizontal } = input as Record<string, unknown>;
  if (![x, y, length].every((v) => typeof v === "number" && Number.isInteger(v)) || typeof horizontal !== "boolean") {
    throw new IllegalMoveError("A vessel has a square, a length and a direction");
  }
  return { x: x as number, y: y as number, length: length as number, horizontal };
}

/** A move as the game reads it and nothing else — whatever came with it is dropped. */
export function parseMove(input: unknown): StarBattleMove {
  if (typeof input !== "object" || input === null) throw new IllegalMoveError("A move is an object");
  const move = input as Record<string, unknown>;
  if (move.kind === "place") {
    if (!Array.isArray(move.vessels) || move.vessels.length > 20) throw new IllegalMoveError("A placement lists the vessels");
    return { kind: "place", vessels: move.vessels.map(parseVessel) };
  }
  if (move.kind === "shoot") {
    const { x, y } = move;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw new IllegalMoveError("A shot names a square");
    }
    return { kind: "shoot", x, y };
  }
  throw new IllegalMoveError("A move places the fleet or fires a shot");
}

export function createGame(options: StarBattleOptions): StarBattleState {
  const { fleet } = parseOptions(options);
  const cells = SECTOR_SIZE * SECTOR_SIZE;
  return {
    size: SECTOR_SIZE,
    fleet,
    vessels: [null, null],
    placed: [false, false],
    shots: [new Array<number>(cells).fill(UNKNOWN), new Array<number>(cells).fill(UNKNOWN)],
    destroyed: [0, 0],
    lastShot: null,
    moveCount: 0,
    status: { kind: "playing", turn: 0 }
  };
}

export function indexOf(state: { size: number }, x: number, y: number): number {
  return y * state.size + x;
}

export function phaseOf(state: StarBattleState): Phase {
  if (state.status.kind === "finished") return "over";
  return state.placed[0] && state.placed[1] ? "battle" : "placing";
}

/** The squares a vessel covers, bow first. */
export function vesselCells(vessel: Vessel): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < vessel.length; i++) {
    cells.push(vessel.horizontal ? { x: vessel.x + i, y: vessel.y } : { x: vessel.x, y: vessel.y + i });
  }
  return cells;
}

/** The ring of squares around a vessel, inside the board — where no other vessel may be. */
export function debrisField(vessel: Vessel, size: number): { x: number; y: number }[] {
  const own = new Set(vesselCells(vessel).map((c) => c.y * size + c.x));
  const debris: { x: number; y: number }[] = [];
  const seen = new Set<number>();
  for (const cell of vesselCells(vessel)) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = y * size + x;
        if (own.has(i) || seen.has(i)) continue;
        seen.add(i);
        debris.push({ x, y });
      }
    }
  }
  return debris;
}

export function vesselInBounds(vessel: Vessel, size: number): boolean {
  if (vessel.length < 1 || vessel.x < 0 || vessel.y < 0) return false;
  const endX = vessel.horizontal ? vessel.x + vessel.length - 1 : vessel.x;
  const endY = vessel.horizontal ? vessel.y : vessel.y + vessel.length - 1;
  return endX < size && endY < size;
}

/** Whether `vessel` fits beside `others`: on the board, overlapping none, touching none. */
export function canPlace(vessel: Vessel, others: readonly Vessel[], size: number): boolean {
  if (!vesselInBounds(vessel, size)) return false;
  const blocked = new Set<number>();
  for (const other of others) {
    for (const c of vesselCells(other)) blocked.add(c.y * size + c.x);
    for (const c of debrisField(other, size)) blocked.add(c.y * size + c.x);
  }
  return vesselCells(vessel).every((c) => !blocked.has(c.y * size + c.x));
}

/** The vessel of `vessels` covering a square, if any. */
export function vesselAt(vessels: readonly Vessel[], x: number, y: number): Vessel | null {
  for (const vessel of vessels) {
    if (vesselCells(vessel).some((c) => c.x === x && c.y === y)) return vessel;
  }
  return null;
}

/** Why a fleet is not a legal one, or null when it is. */
export function fleetProblem(vessels: readonly Vessel[], fleet: FleetKind, size: number): string | null {
  const wanted = [...FLEETS[fleet]].sort((a, b) => b - a);
  const got = vessels.map((s) => s.length).sort((a, b) => b - a);
  if (got.length !== wanted.length || got.some((length, i) => length !== wanted[i])) {
    return `The fleet is ${wanted.join("-")}`;
  }
  for (let i = 0; i < vessels.length; i++) {
    if (!canPlace(vessels[i], vessels.slice(0, i), size)) return "Vessels must lie on the board and not touch";
  }
  return null;
}

/** The decks of `fleet` still to be deployed beside `vessels`, longest first. */
export function missingVessels(vessels: readonly Vessel[], fleet: FleetKind): number[] {
  const left = [...FLEETS[fleet]];
  for (const vessel of vessels) {
    const at = left.indexOf(vessel.length);
    if (at >= 0) left.splice(at, 1);
  }
  return left;
}

/** Deploys the missing vessels of a fleet at random beside the ones already there.
 *  Restarts from scratch when a layout paints itself into a corner, which on a
 *  10×10 board with the classic fleet is rare and always recoverable. */
export function randomFleet(fleet: FleetKind, size: number, random: () => number, keep: readonly Vessel[] = []): Vessel[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const vessels = [...keep];
    let stuck = false;
    for (const length of missingVessels(keep, fleet)) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horizontal = random() < 0.5;
        const vessel: Vessel = {
          x: Math.floor(random() * (horizontal ? size - length + 1 : size)),
          y: Math.floor(random() * (horizontal ? size : size - length + 1)),
          length,
          horizontal
        };
        if (canPlace(vessel, vessels, size)) {
          vessels.push(vessel);
          placed = true;
        }
      }
      if (!placed) {
        stuck = true;
        break;
      }
    }
    if (!stuck) return vessels;
  }
  throw new Error("Could not deploy the fleet");
}

export function isDestroyed(vessel: Vessel, shots: readonly number[], size: number): boolean {
  return vesselCells(vessel).every((c) => shots[c.y * size + c.x] === HIT);
}

/** The vessels of `seat` that the other side has destroyed. */
export function destroyedVessels(state: StarBattleState, seat: PlayerIndex): Vessel[] {
  const vessels = state.vessels[seat];
  if (!vessels) return [];
  const shots = state.shots[otherPlayer(seat)];
  return vessels.filter((vessel) => isDestroyed(vessel, shots, state.size));
}

/** The state as one seat may see it: the other fleet reduced to its destroyed vessels. */
export function viewFor(state: StarBattleState, seat: PlayerIndex): StarBattleState {
  const other = otherPlayer(seat);
  const vessels: [Vessel[] | null, Vessel[] | null] = [state.vessels[0], state.vessels[1]];
  vessels[other] = state.vessels[other] ? destroyedVessels(state, other) : null;
  return { ...state, vessels };
}

/** Shots still open to the seat to move; none while a fleet is still to be deployed
 *  (placements are not enumerable — randomFleet gives one). */
export function legalMoves(state: StarBattleState): StarBattleMove[] {
  if (state.status.kind !== "playing" || phaseOf(state) !== "battle") return [];
  const shots = state.shots[state.status.turn];
  const moves: StarBattleMove[] = [];
  for (let i = 0; i < shots.length; i++) {
    if (shots[i] === UNKNOWN) moves.push({ kind: "shoot", x: i % state.size, y: Math.floor(i / state.size) });
  }
  return moves;
}

export function applyMove(state: StarBattleState, move: StarBattleMove): StarBattleState {
  if (state.status.kind !== "playing") throw new IllegalMoveError("The game is over");
  const mover = state.status.turn;
  const opponent = otherPlayer(mover);
  const size = state.size;

  if (move.kind === "place") {
    if (state.placed[mover]) throw new IllegalMoveError("The fleet is already deployed");
    const problem = fleetProblem(move.vessels, state.fleet, size);
    if (problem) throw new IllegalMoveError(problem);
    const vessels: [Vessel[] | null, Vessel[] | null] = [state.vessels[0], state.vessels[1]];
    vessels[mover] = move.vessels.map((s) => ({ x: s.x, y: s.y, length: s.length, horizontal: s.horizontal }));
    const placed: [boolean, boolean] = [state.placed[0], state.placed[1]];
    placed[mover] = true;
    return {
      ...state,
      vessels,
      placed,
      moveCount: state.moveCount + 1,
      // The other seat deploys its fleet next; once both are deployed, seat 0 fires first.
      status: { kind: "playing", turn: placed[opponent] ? 0 : opponent }
    };
  }

  if (phaseOf(state) !== "battle") throw new IllegalMoveError("Both fleets must be deployed before firing");
  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
    throw new IllegalMoveError("That square is off the board");
  }
  const i = indexOf(state, x, y);
  if (state.shots[mover][i] !== UNKNOWN) throw new IllegalMoveError("That square has been fired at");

  const shots: [number[], number[]] = [state.shots[0], state.shots[1]];
  const mine = state.shots[mover].slice();
  shots[mover] = mine;
  const theirShips = state.vessels[opponent]!;
  const vessel = vesselAt(theirShips, x, y);
  const destroyed: [number, number] = [state.destroyed[0], state.destroyed[1]];
  let result: ShotResult;
  if (!vessel) {
    mine[i] = MISS;
    result = "miss";
  } else {
    mine[i] = HIT;
    if (isDestroyed(vessel, mine, size)) {
      result = "destroyed";
      destroyed[mover]++;
      // Nothing can lie beside a vessel: the shooter gets those squares for free.
      for (const c of debrisField(vessel, size)) {
        const h = c.y * size + c.x;
        if (mine[h] === UNKNOWN) mine[h] = MISS;
      }
    } else {
      result = "hit";
    }
  }

  const next: StarBattleState = {
    ...state,
    shots,
    destroyed,
    lastShot: { by: mover, x, y, result },
    moveCount: state.moveCount + 1,
    status: state.status
  };
  if (destroyed[mover] >= theirShips.length) {
    next.status = { kind: "finished", winner: mover, reason: "target" };
  } else {
    next.status = { kind: "playing", turn: result === "miss" ? opponent : mover };
  }
  return next;
}

function leader(destroyed: [number, number]): PlayerIndex | null {
  if (destroyed[0] === destroyed[1]) return null;
  return destroyed[0] > destroyed[1] ? 0 : 1;
}

export function finish(state: StarBattleState, reason: "agreed" | "resigned", resigning?: PlayerIndex): StarBattleState {
  if (state.status.kind !== "playing") return state;
  if (reason === "resigned") {
    const loser = resigning ?? state.status.turn;
    return { ...state, status: { kind: "finished", winner: otherPlayer(loser), reason } };
  }
  return { ...state, status: { kind: "finished", winner: leader(state.destroyed), reason } };
}

/** Rebuilds a game from its options and move list — how a stored game is restored. */
export function replay(options: StarBattleOptions, moves: readonly StarBattleMove[]): StarBattleState {
  let state = createGame(options);
  for (const move of moves) state = applyMove(state, move);
  return state;
}

/** Hit squares of the other's sector that belong to no destroyed vessel — a vessel found
 *  but not yet finished. What a shooter, human or computer, goes after next. */
export function damagedCells(state: StarBattleState, shooter: PlayerIndex): { x: number; y: number }[] {
  const size = state.size;
  const shots = state.shots[shooter];
  const destroyedCells = new Set<number>();
  for (const vessel of destroyedVessels(state, otherPlayer(shooter))) {
    for (const c of vesselCells(vessel)) destroyedCells.add(c.y * size + c.x);
  }
  const damaged: { x: number; y: number }[] = [];
  for (let i = 0; i < shots.length; i++) {
    if (shots[i] === HIT && !destroyedCells.has(i)) damaged.push({ x: i % size, y: Math.floor(i / size) });
  }
  return damaged;
}
