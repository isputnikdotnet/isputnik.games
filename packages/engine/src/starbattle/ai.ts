// The computer opponent for Star Battle. It sees only what a player would: its
// own shots and the vessels it has destroyed — never the other fleet (the state it is
// handed holds both, and intelFor() is the one place that reads it).
//
//  easy    fires at random; once a vessel is found, at a square beside one of its
//          hits — any neighbour, so it does not follow the line — and now and
//          then forgets the vessel and fires at random again.
//  normal  hunts properly (the two ends of the line once two decks are hit) and
//          searches on the lattice the longest vessel intact
//          must cross — every L-deck vessel covers a square where (x + y) % L == 0
//          — skipping squares nothing intact could fit in.
//  hard    counts, for every open square, how many ways the vessels still intact
//          could lie across it given every miss, hit and destroyed vessel so far, and
//          fires where the count is highest; a found vessel narrows the count to
//          the placements through its hits, which is the line inference a
//          person does by eye. A little randomness among the top squares.
//
// Its own fleet is deployed at random at every level.
import type { AiLevel, GameAi, PlayerIndex } from "../game.js";
import { otherPlayer } from "../game.js";
import {
  FLEETS,
  HIT,
  MISS,
  UNKNOWN,
  phaseOf,
  randomFleet,
  vesselCells,
  destroyedVessels,
  type StarBattleMove,
  type StarBattleState,
  type Vessel
} from "./rules.js";

interface Intel {
  size: number;
  /** UNKNOWN, MISS or HIT per square of the other sector. */
  known: readonly number[];
  /** Hits that belong to no destroyed vessel. */
  damaged: { x: number; y: number }[];
  /** Deck counts of the vessels still intact. */
  intact: number[];
}

/** What the shooter knows — the only reading of the state the opponent gets. */
function intelFor(state: StarBattleState, me: PlayerIndex): Intel {
  const size = state.size;
  const known = state.shots[me];
  const destroyed = destroyedVessels(state, otherPlayer(me));
  const destroyedCells = new Set<number>();
  for (const vessel of destroyed) for (const c of vesselCells(vessel)) destroyedCells.add(c.y * size + c.x);
  const damaged: { x: number; y: number }[] = [];
  for (let i = 0; i < known.length; i++) {
    if (known[i] === HIT && !destroyedCells.has(i)) damaged.push({ x: i % size, y: Math.floor(i / size) });
  }
  const intact = [...FLEETS[state.fleet]];
  for (const vessel of destroyed) {
    const at = intact.indexOf(vessel.length);
    if (at >= 0) intact.splice(at, 1);
  }
  return { size, known, damaged, intact };
}

/** How often the easy level loses interest in a vessel it has found. */
const EASY_DISTRACTION = 0.3;

const pick = <T>(items: T[], random: () => number): T => items[Math.floor(random() * items.length)];

/** Squares next to a found vessel that could hold its next deck: the two ends of
 *  the line once two decks are hit, the four neighbours of a single hit. */
function huntCandidates(intel: Intel): { x: number; y: number }[] {
  const { size, known, damaged } = intel;
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && known[y * size + x] === UNKNOWN;
  const out: { x: number; y: number }[] = [];
  if (damaged.length === 0) return out;
  if (damaged.length === 1) {
    const { x, y } = damaged[0];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    return out;
  }
  // Two or more hits in a line (vessels never touch, so damaged decks of two
  // different vessels cannot be neighbours; several found vessels are treated as
  // one line each, taking the first).
  const first = damaged[0];
  const line = damaged.filter((c) => (c.y === first.y) || (c.x === first.x));
  const horizontal = line.length > 1 && line.every((c) => c.y === first.y);
  const sameLine = horizontal ? damaged.filter((c) => c.y === first.y) : damaged.filter((c) => c.x === first.x);
  if (horizontal) {
    const xs = sameLine.map((c) => c.x);
    const lo = Math.min(...xs) - 1;
    const hi = Math.max(...xs) + 1;
    if (open(lo, first.y)) out.push({ x: lo, y: first.y });
    if (open(hi, first.y)) out.push({ x: hi, y: first.y });
  } else {
    const ys = sameLine.map((c) => c.y);
    const lo = Math.min(...ys) - 1;
    const hi = Math.max(...ys) + 1;
    if (open(first.x, lo)) out.push({ x: first.x, y: lo });
    if (open(first.x, hi)) out.push({ x: first.x, y: hi });
  }
  return out;
}

/**
 * How many consistent placements of the vessels intact cover each open square.
 * A placement is consistent when it lies on unknown or damaged squares only
 * and touches no hit it does not itself cover (vessels never touch). With a vessel
 * found, only placements through a damaged deck count — the rest of the sector
 * can wait.
 */
function density(intel: Intel): number[] {
  const { size, known, damaged, intact } = intel;
  const counts = new Array<number>(size * size).fill(0);
  const woundedSet = new Set(damaged.map((c) => c.y * size + c.x));
  const hitAt = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && known[y * size + x] === HIT;
  const lengths = [...new Set(intact)];
  for (const length of lengths) {
    const copies = intact.filter((l) => l === length).length;
    for (const horizontal of [true, false]) {
      const maxX = horizontal ? size - length : size - 1;
      const maxY = horizontal ? size - 1 : size - length;
      for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= maxX; x++) {
          const vessel: Vessel = { x, y, length, horizontal };
          const cells = vesselCells(vessel);
          const own = new Set(cells.map((c) => c.y * size + c.x));
          let ok = true;
          let throughWounded = false;
          for (const c of cells) {
            const i = c.y * size + c.x;
            if (known[i] === MISS || (known[i] === HIT && !woundedSet.has(i))) {
              ok = false;
              break;
            }
            if (woundedSet.has(i)) throughWounded = true;
            // A hit beside the vessel that is not part of it: another vessel would
            // be touching, which the rules forbid.
            for (let dy = -1; dy <= 1 && ok; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = c.x + dx;
                const ny = c.y + dy;
                if (hitAt(nx, ny) && !own.has(ny * size + nx)) {
                  ok = false;
                  break;
                }
              }
            }
            if (!ok) break;
          }
          if (!ok) continue;
          if (damaged.length > 0 && !throughWounded) continue;
          for (const c of cells) {
            const i = c.y * size + c.x;
            if (known[i] === UNKNOWN) counts[i] += copies;
          }
        }
      }
    }
  }
  return counts;
}

function openSquares(intel: Intel): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < intel.known.length; i++) {
    if (intel.known[i] === UNKNOWN) out.push({ x: i % intel.size, y: Math.floor(i / intel.size) });
  }
  return out;
}

export function chooseShot(state: StarBattleState, me: PlayerIndex, level: AiLevel, random: () => number): { x: number; y: number } | null {
  const intel = intelFor(state, me);
  const open = openSquares(intel);
  if (open.length === 0) return null;

  if (level === "easy") {
    const beside: { x: number; y: number }[] = [];
    for (const { x, y } of intel.damaged) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < intel.size && ny < intel.size && intel.known[ny * intel.size + nx] === UNKNOWN) beside.push({ x: nx, y: ny });
      }
    }
    return beside.length > 0 && random() >= EASY_DISTRACTION ? pick(beside, random) : pick(open, random);
  }

  const counts = density(intel);
  const possible = open.filter((c) => counts[c.y * intel.size + c.x] > 0);

  if (level === "normal") {
    const hunt = huntCandidates(intel).filter((c) => counts[c.y * intel.size + c.x] > 0);
    if (hunt.length > 0) return pick(hunt, random);
    if (possible.length === 0) return pick(open, random);
    const longest = Math.max(...intel.intact);
    const lattice = possible.filter((c) => (c.x + c.y) % longest === 0);
    return pick(lattice.length > 0 ? lattice : possible, random);
  }

  // hard: the densest squares, with a little variety among the near-best.
  if (possible.length === 0) return pick(open, random);
  const best = Math.max(...possible.map((c) => counts[c.y * intel.size + c.x]));
  const top = possible.filter((c) => counts[c.y * intel.size + c.x] >= best * 0.85);
  return pick(top, random);
}

export function chooseMove(state: StarBattleState, level: AiLevel, random: () => number): StarBattleMove | null {
  if (state.status.kind !== "playing") return null;
  const me = state.status.turn;
  if (phaseOf(state) === "placing") {
    if (state.placed[me]) return null;
    return { kind: "place", vessels: randomFleet(state.fleet, state.size, random) };
  }
  const shot = chooseShot(state, me, level, random);
  return shot ? { kind: "shoot", ...shot } : null;
}

export const starBattleAi: GameAi<StarBattleState, StarBattleMove> = { chooseMove };
