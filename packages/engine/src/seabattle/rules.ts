// Sea Battle (Морской бой): the paper game of hidden fleets. Each player lays a
// fleet on their own 10×10 sea, then they take turns calling a square on the
// other's. The rules are the common Russian ones:
//
//  - Fleet: one four-deck ship, two three-deck, three two-deck, four single-deck
//    ("classic"); a "small" fleet for a quick game is one three, two twos, three
//    singles. Ships are straight lines and may not touch, not even at a corner.
//  - Placing is the first move of each seat: seat 0 lays its fleet, then seat 1;
//    seat 0 then fires first.
//  - A hit earns another shot; a miss passes the turn. When a ship's every deck
//    is hit it is sunk, and the squares around it — where nothing can be — are
//    marked as misses for the shooter.
//  - The game ends when a fleet is wholly sunk. Score is ships sunk.
//
// The state carries both fleets, so the full state is a secret: a view for one
// seat (viewFor) keeps the other side's sunk ships only. The server sends views;
// a local game holds the whole thing and shows one side at a time.
import { IllegalMoveError, otherPlayer, type GameStatus, type PlayerIndex } from "../game.js";

export const SEA_SIZE = 10;

export const FLEET_KINDS = ["classic", "small"] as const;
export type FleetKind = (typeof FLEET_KINDS)[number];

/** Deck counts of the ships in each fleet, longest first. */
export const FLEETS: Record<FleetKind, readonly number[]> = {
  classic: [4, 3, 3, 2, 2, 2, 1, 1, 1, 1],
  small: [3, 2, 2, 1, 1, 1]
};

export interface SeaBattleOptions {
  fleet: FleetKind;
}

export const DEFAULT_OPTIONS: SeaBattleOptions = { fleet: "classic" };

/** A ship: its bow square, its length in decks, and which way it lies. The
 *  squares are (x..x+length-1, y) when horizontal, (x, y..y+length-1) otherwise. */
export interface Ship {
  x: number;
  y: number;
  length: number;
  horizontal: boolean;
}

export type SeaBattleMove =
  | { kind: "place"; ships: Ship[] }
  | { kind: "shoot"; x: number; y: number };

/** What a shooter knows of a square of the other's sea. */
export const UNKNOWN = 0;
export const MISS = 1;
export const HIT = 2;

export type ShotResult = "miss" | "hit" | "sunk";

export interface LastShot {
  by: PlayerIndex;
  x: number;
  y: number;
  result: ShotResult;
}

export interface SeaBattleState {
  size: number;
  fleet: FleetKind;
  /** Each seat's fleet once laid. In a view for the other seat (viewFor) only
   *  the ships already sunk remain; `placed` still says whether it was laid. */
  ships: [Ship[] | null, Ship[] | null];
  placed: [boolean, boolean];
  /** shots[p]: the squares p has fired at — the other seat's sea — size*size
   *  cells, row-major: UNKNOWN, MISS or HIT. */
  shots: [number[], number[]];
  /** Ships sunk by each seat. */
  sunk: [number, number];
  lastShot: LastShot | null;
  moveCount: number;
  status: GameStatus;
}

export type Phase = "placing" | "battle" | "over";

export function parseOptions(input: unknown): SeaBattleOptions {
  if (typeof input !== "object" || input === null) throw new Error("Options must be an object");
  const { fleet } = input as Record<string, unknown>;
  const kind = fleet ?? "classic";
  if (typeof kind !== "string" || !(FLEET_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Fleet must be one of ${FLEET_KINDS.join(", ")}`);
  }
  return { fleet: kind as FleetKind };
}

function parseShip(input: unknown): Ship {
  if (typeof input !== "object" || input === null) throw new IllegalMoveError("A ship is an object");
  const { x, y, length, horizontal } = input as Record<string, unknown>;
  if (![x, y, length].every((v) => typeof v === "number" && Number.isInteger(v)) || typeof horizontal !== "boolean") {
    throw new IllegalMoveError("A ship has a square, a length and a direction");
  }
  return { x: x as number, y: y as number, length: length as number, horizontal };
}

/** A move as the game reads it and nothing else — whatever came with it is dropped. */
export function parseMove(input: unknown): SeaBattleMove {
  if (typeof input !== "object" || input === null) throw new IllegalMoveError("A move is an object");
  const move = input as Record<string, unknown>;
  if (move.kind === "place") {
    if (!Array.isArray(move.ships) || move.ships.length > 20) throw new IllegalMoveError("A placement lists the ships");
    return { kind: "place", ships: move.ships.map(parseShip) };
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

export function createGame(options: SeaBattleOptions): SeaBattleState {
  const { fleet } = parseOptions(options);
  const cells = SEA_SIZE * SEA_SIZE;
  return {
    size: SEA_SIZE,
    fleet,
    ships: [null, null],
    placed: [false, false],
    shots: [new Array<number>(cells).fill(UNKNOWN), new Array<number>(cells).fill(UNKNOWN)],
    sunk: [0, 0],
    lastShot: null,
    moveCount: 0,
    status: { kind: "playing", turn: 0 }
  };
}

export function indexOf(state: { size: number }, x: number, y: number): number {
  return y * state.size + x;
}

export function phaseOf(state: SeaBattleState): Phase {
  if (state.status.kind === "finished") return "over";
  return state.placed[0] && state.placed[1] ? "battle" : "placing";
}

/** The squares a ship covers, bow first. */
export function shipCells(ship: Ship): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < ship.length; i++) {
    cells.push(ship.horizontal ? { x: ship.x + i, y: ship.y } : { x: ship.x, y: ship.y + i });
  }
  return cells;
}

/** The ring of squares around a ship, inside the board — where no other ship may be. */
export function shipHalo(ship: Ship, size: number): { x: number; y: number }[] {
  const own = new Set(shipCells(ship).map((c) => c.y * size + c.x));
  const halo: { x: number; y: number }[] = [];
  const seen = new Set<number>();
  for (const cell of shipCells(ship)) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = y * size + x;
        if (own.has(i) || seen.has(i)) continue;
        seen.add(i);
        halo.push({ x, y });
      }
    }
  }
  return halo;
}

export function shipInBounds(ship: Ship, size: number): boolean {
  if (ship.length < 1 || ship.x < 0 || ship.y < 0) return false;
  const endX = ship.horizontal ? ship.x + ship.length - 1 : ship.x;
  const endY = ship.horizontal ? ship.y : ship.y + ship.length - 1;
  return endX < size && endY < size;
}

/** Whether `ship` fits beside `others`: on the board, overlapping none, touching none. */
export function canPlace(ship: Ship, others: readonly Ship[], size: number): boolean {
  if (!shipInBounds(ship, size)) return false;
  const blocked = new Set<number>();
  for (const other of others) {
    for (const c of shipCells(other)) blocked.add(c.y * size + c.x);
    for (const c of shipHalo(other, size)) blocked.add(c.y * size + c.x);
  }
  return shipCells(ship).every((c) => !blocked.has(c.y * size + c.x));
}

/** The ship of `ships` covering a square, if any. */
export function shipAt(ships: readonly Ship[], x: number, y: number): Ship | null {
  for (const ship of ships) {
    if (shipCells(ship).some((c) => c.x === x && c.y === y)) return ship;
  }
  return null;
}

/** Why a fleet is not a legal one, or null when it is. */
export function fleetProblem(ships: readonly Ship[], fleet: FleetKind, size: number): string | null {
  const wanted = [...FLEETS[fleet]].sort((a, b) => b - a);
  const got = ships.map((s) => s.length).sort((a, b) => b - a);
  if (got.length !== wanted.length || got.some((length, i) => length !== wanted[i])) {
    return `The fleet is ${wanted.join("-")}`;
  }
  for (let i = 0; i < ships.length; i++) {
    if (!canPlace(ships[i], ships.slice(0, i), size)) return "Ships must lie on the board and not touch";
  }
  return null;
}

/** The decks of `fleet` still to be laid beside `ships`, longest first. */
export function missingShips(ships: readonly Ship[], fleet: FleetKind): number[] {
  const left = [...FLEETS[fleet]];
  for (const ship of ships) {
    const at = left.indexOf(ship.length);
    if (at >= 0) left.splice(at, 1);
  }
  return left;
}

/** Lays the missing ships of a fleet at random beside the ones already there.
 *  Restarts from scratch when a layout paints itself into a corner, which on a
 *  10×10 board with the classic fleet is rare and always recoverable. */
export function randomFleet(fleet: FleetKind, size: number, random: () => number, keep: readonly Ship[] = []): Ship[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = [...keep];
    let stuck = false;
    for (const length of missingShips(keep, fleet)) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horizontal = random() < 0.5;
        const ship: Ship = {
          x: Math.floor(random() * (horizontal ? size - length + 1 : size)),
          y: Math.floor(random() * (horizontal ? size : size - length + 1)),
          length,
          horizontal
        };
        if (canPlace(ship, ships, size)) {
          ships.push(ship);
          placed = true;
        }
      }
      if (!placed) {
        stuck = true;
        break;
      }
    }
    if (!stuck) return ships;
  }
  throw new Error("Could not lay the fleet");
}

export function isSunk(ship: Ship, shots: readonly number[], size: number): boolean {
  return shipCells(ship).every((c) => shots[c.y * size + c.x] === HIT);
}

/** The ships of `seat` that the other side has sunk. */
export function sunkShips(state: SeaBattleState, seat: PlayerIndex): Ship[] {
  const ships = state.ships[seat];
  if (!ships) return [];
  const shots = state.shots[otherPlayer(seat)];
  return ships.filter((ship) => isSunk(ship, shots, state.size));
}

/** The state as one seat may see it: the other fleet reduced to its sunk ships. */
export function viewFor(state: SeaBattleState, seat: PlayerIndex): SeaBattleState {
  const other = otherPlayer(seat);
  const ships: [Ship[] | null, Ship[] | null] = [state.ships[0], state.ships[1]];
  ships[other] = state.ships[other] ? sunkShips(state, other) : null;
  return { ...state, ships };
}

/** Shots still open to the seat to move; none while a fleet is still to be laid
 *  (placements are not enumerable — randomFleet gives one). */
export function legalMoves(state: SeaBattleState): SeaBattleMove[] {
  if (state.status.kind !== "playing" || phaseOf(state) !== "battle") return [];
  const shots = state.shots[state.status.turn];
  const moves: SeaBattleMove[] = [];
  for (let i = 0; i < shots.length; i++) {
    if (shots[i] === UNKNOWN) moves.push({ kind: "shoot", x: i % state.size, y: Math.floor(i / state.size) });
  }
  return moves;
}

export function applyMove(state: SeaBattleState, move: SeaBattleMove): SeaBattleState {
  if (state.status.kind !== "playing") throw new IllegalMoveError("The game is over");
  const mover = state.status.turn;
  const opponent = otherPlayer(mover);
  const size = state.size;

  if (move.kind === "place") {
    if (state.placed[mover]) throw new IllegalMoveError("The fleet is already laid");
    const problem = fleetProblem(move.ships, state.fleet, size);
    if (problem) throw new IllegalMoveError(problem);
    const ships: [Ship[] | null, Ship[] | null] = [state.ships[0], state.ships[1]];
    ships[mover] = move.ships.map((s) => ({ x: s.x, y: s.y, length: s.length, horizontal: s.horizontal }));
    const placed: [boolean, boolean] = [state.placed[0], state.placed[1]];
    placed[mover] = true;
    return {
      ...state,
      ships,
      placed,
      moveCount: state.moveCount + 1,
      // The other seat lays its fleet next; once both are laid, seat 0 fires first.
      status: { kind: "playing", turn: placed[opponent] ? 0 : opponent }
    };
  }

  if (phaseOf(state) !== "battle") throw new IllegalMoveError("Both fleets must be laid before firing");
  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
    throw new IllegalMoveError("That square is off the board");
  }
  const i = indexOf(state, x, y);
  if (state.shots[mover][i] !== UNKNOWN) throw new IllegalMoveError("That square has been fired at");

  const shots: [number[], number[]] = [state.shots[0], state.shots[1]];
  const mine = state.shots[mover].slice();
  shots[mover] = mine;
  const theirShips = state.ships[opponent]!;
  const ship = shipAt(theirShips, x, y);
  const sunk: [number, number] = [state.sunk[0], state.sunk[1]];
  let result: ShotResult;
  if (!ship) {
    mine[i] = MISS;
    result = "miss";
  } else {
    mine[i] = HIT;
    if (isSunk(ship, mine, size)) {
      result = "sunk";
      sunk[mover]++;
      // Nothing can lie beside a ship: the shooter gets those squares for free.
      for (const c of shipHalo(ship, size)) {
        const h = c.y * size + c.x;
        if (mine[h] === UNKNOWN) mine[h] = MISS;
      }
    } else {
      result = "hit";
    }
  }

  const next: SeaBattleState = {
    ...state,
    shots,
    sunk,
    lastShot: { by: mover, x, y, result },
    moveCount: state.moveCount + 1,
    status: state.status
  };
  if (sunk[mover] >= theirShips.length) {
    next.status = { kind: "finished", winner: mover, reason: "target" };
  } else {
    next.status = { kind: "playing", turn: result === "miss" ? opponent : mover };
  }
  return next;
}

function leader(sunk: [number, number]): PlayerIndex | null {
  if (sunk[0] === sunk[1]) return null;
  return sunk[0] > sunk[1] ? 0 : 1;
}

export function finish(state: SeaBattleState, reason: "agreed" | "resigned", resigning?: PlayerIndex): SeaBattleState {
  if (state.status.kind !== "playing") return state;
  if (reason === "resigned") {
    const loser = resigning ?? state.status.turn;
    return { ...state, status: { kind: "finished", winner: otherPlayer(loser), reason } };
  }
  return { ...state, status: { kind: "finished", winner: leader(state.sunk), reason } };
}

/** Rebuilds a game from its options and move list — how a stored game is restored. */
export function replay(options: SeaBattleOptions, moves: readonly SeaBattleMove[]): SeaBattleState {
  let state = createGame(options);
  for (const move of moves) state = applyMove(state, move);
  return state;
}

/** Hit squares of the other's sea that belong to no sunk ship — a ship found
 *  but not yet finished. What a shooter, human or computer, goes after next. */
export function woundedCells(state: SeaBattleState, shooter: PlayerIndex): { x: number; y: number }[] {
  const size = state.size;
  const shots = state.shots[shooter];
  const sunkCells = new Set<number>();
  for (const ship of sunkShips(state, otherPlayer(shooter))) {
    for (const c of shipCells(ship)) sunkCells.add(c.y * size + c.x);
  }
  const wounded: { x: number; y: number }[] = [];
  for (let i = 0; i < shots.length; i++) {
    if (shots[i] === HIT && !sunkCells.has(i)) wounded.push({ x: i % size, y: Math.floor(i / size) });
  }
  return wounded;
}
