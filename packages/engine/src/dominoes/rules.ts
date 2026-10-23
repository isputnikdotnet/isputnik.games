// Dominoes as «Козёл» for two: the courtyard game, played from a boneyard.
//
//  - A double-six set, 28 tiles. Each player is dealt 7; the other 14 are the
//    boneyard («базар»), and may be drawn to the last tile.
//  - The first hand is led by the lowest double — 1:1, 2:2 … 6:6, and 0:0 last,
//    since it is worth nothing — or, with no double dealt, by the lowest tile.
//    Every later hand is led, with any tile, by the winner of the hand before.
//  - A turn plays a tile matching either open end. Doubles lie crosswise and do
//    not branch. A player who cannot play draws one tile at a time until they
//    can; with the boneyard empty they pass.
//  - A player who empties their hand wins it, and the other adds their pips to
//    their total. When no tile anywhere can match the line — a closed line, a
//    «рыба» — the hand ends at once: the tiles in the boneyard do not count, the
//    lower hand wins, and the higher hand's holder adds their own pips. Equal
//    hands score nothing, and the last player to play leads the next hand.
//    A lone 0:0 counts 25.
//  - Whoever reaches the target (101, or 51 for a quick game) is «козёл» and
//    loses.
//
// The deal is random, so the game is created from a seed and keeps it in its
// state: hand n is dealt from seededRandom(mixSeed(seed, n)), which keeps
// applyMove pure and a replay of the moves exact. A draw carries no tile — it
// takes the next one off the dealt boneyard — so a move list never says what
// was drawn. A view for one seat (viewFor) drops the seed, the boneyard and the
// other hand; finished hands are public, as at a table.
import { IllegalMoveError, otherPlayer, type GameStatus, type PlayerIndex } from "../game.js";
import { seededRandom } from "../random.js";

/** A tile, its lower number first: [2, 5] is the 2:5. */
export type Tile = [number, number];

export const HIGHEST_PIP = 6;
export const HAND_SIZE = 7;
/** A lone 0:0 left in a hand counts this many. */
export const LONE_BLANK = 25;

export const TARGETS = [101, 51] as const;
export type Target = (typeof TARGETS)[number];

export interface DominoesOptions {
  target: Target;
}

export const DEFAULT_OPTIONS: DominoesOptions = { target: 101 };

export type End = "left" | "right";

export type DominoesMove =
  | { kind: "play"; tile: Tile; end: End }
  | { kind: "draw" }
  | { kind: "pass" };

/** A tile in the line, turned the way it lies: `left` faces the left end. */
export interface LaidTile {
  left: number;
  right: number;
}

/** How a hand ended, kept for everyone to see. */
export interface HandResult {
  hand: number;
  /** Who won the hand; null for a «рыба» with equal hands. */
  winner: PlayerIndex | null;
  fish: boolean;
  /** Both hands as they were when it ended. */
  hands: [Tile[], Tile[]];
  /** What each hand counts (a lone 0:0 is 25). */
  pips: [number, number];
  /** What each seat collected this hand. */
  points: [number, number];
  totals: [number, number];
}

export interface DominoesState {
  target: Target;
  /** The deal's secret; 0 in a view (viewFor). */
  seed: number;
  /** The hand in play, from 1. */
  hand: number;
  /** Each seat's tiles. In a view the other seat's is empty; `handCounts` still counts it. */
  hands: [Tile[], Tile[]];
  handCounts: [number, number];
  /** The tiles left to draw, in the order they come. Empty in a view. */
  boneyard: Tile[];
  boneyardCount: number;
  /** The line of play, left to right. */
  line: LaidTile[];
  /** Where in `line` the hand's first tile lies — the line grows both ways from it. */
  leadIndex: number;
  /** The tile the first hand must open with; null once it is played, and in later hands. */
  mustLead: Tile | null;
  /** Who played last in this hand. */
  lastPlayer: PlayerIndex | null;
  /** The numbers each seat is known to hold none of, this hand — public, as a
   *  player at the table works it out. A pass on ends a and b adds them. A draw
   *  on a and b makes it exactly {a, b}: the drawn tiles are unknown, but a draw
   *  only follows a draw that did not fit, and the tile that finally fits is
   *  played at once, so whatever stays in the hand still holds neither. */
  lacks: [number[], number[]];
  totals: [number, number];
  history: HandResult[];
  moveCount: number;
  status: GameStatus;
}

export function parseOptions(input: unknown): DominoesOptions {
  if (typeof input !== "object" || input === null) throw new Error("Options must be an object");
  const { target } = input as Record<string, unknown>;
  const value = target ?? DEFAULT_OPTIONS.target;
  if (!(TARGETS as readonly unknown[]).includes(value)) throw new Error(`Target must be one of ${TARGETS.join(", ")}`);
  return { target: value as Target };
}

function isPip(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= HIGHEST_PIP;
}

/** A move as the game reads it and nothing else — whatever came with it is dropped. */
export function parseMove(input: unknown): DominoesMove {
  if (typeof input !== "object" || input === null) throw new IllegalMoveError("A move is an object");
  const move = input as Record<string, unknown>;
  if (move.kind === "draw") return { kind: "draw" };
  if (move.kind === "pass") return { kind: "pass" };
  if (move.kind === "play") {
    const { tile, end } = move;
    if (!Array.isArray(tile) || tile.length !== 2 || !isPip(tile[0]) || !isPip(tile[1])) {
      throw new IllegalMoveError("A play names a tile");
    }
    if (end !== "left" && end !== "right") throw new IllegalMoveError("A play names an end");
    return { kind: "play", tile: normalize([tile[0], tile[1]]), end };
  }
  throw new IllegalMoveError("A move plays a tile, draws or passes");
}

export function normalize(tile: Tile): Tile {
  return tile[0] <= tile[1] ? [tile[0], tile[1]] : [tile[1], tile[0]];
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function isDouble(tile: Tile): boolean {
  return tile[0] === tile[1];
}

/** The whole set, 0:0 to 6:6. */
export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= HIGHEST_PIP; a++) for (let b = a; b <= HIGHEST_PIP; b++) tiles.push([a, b]);
  return tiles;
}

/** A seed for hand n of a game, mixed so neighbouring hands deal unrelated tiles. */
export function mixSeed(seed: number, hand: number): number {
  let h = (seed ^ Math.imul(hand, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hand n's deal: seven tiles each and the boneyard, from the game's seed. */
export function deal(seed: number, hand: number): { hands: [Tile[], Tile[]]; boneyard: Tile[] } {
  const random = seededRandom(mixSeed(seed, hand));
  const tiles = fullSet();
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return { hands: [tiles.slice(0, HAND_SIZE), tiles.slice(HAND_SIZE, 2 * HAND_SIZE)], boneyard: tiles.slice(2 * HAND_SIZE) };
}

/** The tile that opens the first hand and who holds it: the lowest double (0:0
 *  ranks after 6:6), or with no double dealt the lowest tile. */
export function firstLead(hands: [Tile[], Tile[]]): { seat: PlayerIndex; tile: Tile } {
  const rank = (tile: Tile): number => {
    if (isDouble(tile)) return tile[0] === 0 ? 7 : tile[0];
    return 100 + (tile[0] + tile[1]) * 10 + tile[0];
  };
  let best: { seat: PlayerIndex; tile: Tile } | null = null;
  for (const seat of [0, 1] as const) {
    for (const tile of hands[seat]) {
      if (!best || rank(tile) < rank(best.tile)) best = { seat, tile };
    }
  }
  return best!;
}

/** What a hand counts: its pips, or 25 for a lone 0:0. */
export function handPips(hand: readonly Tile[]): number {
  if (hand.length === 1 && hand[0][0] === 0 && hand[0][1] === 0) return LONE_BLANK;
  return hand.reduce((sum, tile) => sum + tile[0] + tile[1], 0);
}

/** The open ends, left and right; null before the first tile. */
export function endsOf(state: { line: LaidTile[] }): [number, number] | null {
  if (state.line.length === 0) return null;
  return [state.line[0].left, state.line[state.line.length - 1].right];
}

function fits(tile: Tile, pip: number): boolean {
  return tile[0] === pip || tile[1] === pip;
}

/** The plays a hand has on the line as it stands. */
export function playsFor(state: DominoesState, hand: readonly Tile[]): DominoesMove[] {
  if (state.mustLead) {
    const lead = state.mustLead;
    return hand.some((tile) => sameTile(tile, lead)) ? [{ kind: "play", tile: lead, end: "right" }] : [];
  }
  const ends = endsOf(state);
  if (!ends) return hand.map((tile) => ({ kind: "play", tile, end: "right" }));
  const plays: DominoesMove[] = [];
  for (const tile of hand) {
    if (fits(tile, ends[0])) plays.push({ kind: "play", tile, end: "left" });
    if (fits(tile, ends[1])) plays.push({ kind: "play", tile, end: "right" });
  }
  return plays;
}

function newHand(seed: number, hand: number, leader: PlayerIndex | null): Omit<DominoesState, "target" | "seed" | "totals" | "history" | "moveCount" | "status"> & { turn: PlayerIndex } {
  const dealt = deal(seed, hand);
  const lead = leader === null ? firstLead(dealt.hands) : null;
  return {
    hand,
    hands: dealt.hands,
    handCounts: [HAND_SIZE, HAND_SIZE],
    boneyard: dealt.boneyard,
    boneyardCount: dealt.boneyard.length,
    line: [],
    leadIndex: 0,
    mustLead: lead ? lead.tile : null,
    lastPlayer: null,
    lacks: [[], []],
    turn: lead ? lead.seat : leader!
  };
}

export function createGame(options: DominoesOptions, seed?: number): DominoesState {
  const { target } = parseOptions(options);
  if (seed === undefined || !Number.isInteger(seed)) throw new Error("Dominoes is dealt from a seed");
  const { turn, ...hand } = newHand(seed >>> 0, 1, null);
  return {
    target,
    seed: seed >>> 0,
    ...hand,
    totals: [0, 0],
    history: [],
    moveCount: 0,
    status: { kind: "playing", turn }
  };
}

export function legalMoves(state: DominoesState): DominoesMove[] {
  if (state.status.kind !== "playing") return [];
  const plays = playsFor(state, state.hands[state.status.turn]);
  if (plays.length > 0) return plays;
  return [state.boneyardCount > 0 ? { kind: "draw" } : { kind: "pass" }];
}

/** Whether no tile anywhere — either hand or the boneyard — matches an end: a closed line. */
function closed(state: DominoesState): boolean {
  const ends = endsOf(state);
  if (!ends) return false;
  const open = (tile: Tile) => fits(tile, ends[0]) || fits(tile, ends[1]);
  return !state.hands[0].some(open) && !state.hands[1].some(open) && !state.boneyard.some(open);
}

/** Scores the hand just ended, then deals the next one or ends the game. */
function endHand(state: DominoesState, winner: PlayerIndex | null, fish: boolean): DominoesState {
  const pips: [number, number] = [handPips(state.hands[0]), handPips(state.hands[1])];
  const points: [number, number] = [0, 0];
  // Going out: the other hand pays. A «рыба»: the higher hand pays its own.
  if (winner !== null) points[otherPlayer(winner)] = pips[otherPlayer(winner)];
  const totals: [number, number] = [state.totals[0] + points[0], state.totals[1] + points[1]];
  const result: HandResult = {
    hand: state.hand,
    winner,
    fish,
    hands: [state.hands[0], state.hands[1]],
    pips,
    points,
    totals
  };
  const history = [...state.history, result];
  const loser = ([0, 1] as const).find((seat) => totals[seat] >= state.target);
  if (loser !== undefined) {
    return { ...state, totals, history, status: { kind: "finished", winner: otherPlayer(loser), reason: "target" } };
  }
  const leader = winner ?? state.lastPlayer ?? 0;
  const { turn, ...next } = newHand(state.seed, state.hand + 1, leader);
  return { ...state, ...next, totals, history, status: { kind: "playing", turn } };
}

/** Returns the next state; throws IllegalMoveError. Never mutates `state`. */
export function applyMove(state: DominoesState, move: DominoesMove): DominoesState {
  if (state.status.kind !== "playing") throw new IllegalMoveError("The game is over");
  const me = state.status.turn;
  const legal = legalMoves(state);
  const moveCount = state.moveCount + 1;

  if (move.kind === "draw" || move.kind === "pass") {
    if (!legal.some((m) => m.kind === move.kind)) {
      throw new IllegalMoveError(move.kind === "draw" ? "You can play, or the boneyard is empty" : "You can play or draw");
    }
    const ends = endsOf(state)!;
    const lacks: [number[], number[]] = [state.lacks[0], state.lacks[1]];
    if (move.kind === "pass") {
      lacks[me] = [...new Set([...lacks[me], ...ends])].sort((a, b) => a - b);
      return { ...state, lacks, moveCount, status: { kind: "playing", turn: otherPlayer(me) } };
    }
    lacks[me] = [...new Set(ends)].sort((a, b) => a - b);
    const [drawn, ...boneyard] = state.boneyard;
    const hands: [Tile[], Tile[]] = [state.hands[0], state.hands[1]];
    hands[me] = [...hands[me], drawn];
    const handCounts: [number, number] = [state.handCounts[0], state.handCounts[1]];
    handCounts[me] += 1;
    return { ...state, hands, handCounts, boneyard, boneyardCount: boneyard.length, lacks, moveCount };
  }

  const tile = normalize(move.tile);
  if (!state.hands[me].some((t) => sameTile(t, tile))) throw new IllegalMoveError("That tile is not in your hand");
  const ends = endsOf(state);
  if (state.mustLead && !sameTile(tile, state.mustLead)) throw new IllegalMoveError(`The first hand opens with ${state.mustLead.join(":")}`);
  let line: LaidTile[];
  let leadIndex = state.leadIndex;
  if (!ends) {
    line = [{ left: tile[0], right: tile[1] }];
  } else if (move.end === "left") {
    if (!fits(tile, ends[0])) throw new IllegalMoveError("That tile does not match the left end");
    const laid = tile[1] === ends[0] ? { left: tile[0], right: tile[1] } : { left: tile[1], right: tile[0] };
    line = [laid, ...state.line];
    leadIndex += 1;
  } else {
    if (!fits(tile, ends[1])) throw new IllegalMoveError("That tile does not match the right end");
    const laid = tile[0] === ends[1] ? { left: tile[0], right: tile[1] } : { left: tile[1], right: tile[0] };
    line = [...state.line, laid];
  }
  const hands: [Tile[], Tile[]] = [state.hands[0], state.hands[1]];
  hands[me] = hands[me].filter((t) => !sameTile(t, tile));
  const handCounts: [number, number] = [state.handCounts[0], state.handCounts[1]];
  handCounts[me] -= 1;
  const next: DominoesState = {
    ...state,
    hands,
    handCounts,
    line,
    leadIndex,
    mustLead: null,
    lastPlayer: me,
    moveCount,
    status: { kind: "playing", turn: otherPlayer(me) }
  };
  if (hands[me].length === 0) return endHand(next, me, false);
  if (closed(next)) {
    const pips = [handPips(hands[0]), handPips(hands[1])];
    const winner: PlayerIndex | null = pips[0] === pips[1] ? null : pips[0] < pips[1] ? 0 : 1;
    return endHand(next, winner, true);
  }
  return next;
}

/** Ends the game early: a resignation loses; by agreement the lower total wins. */
export function finish(state: DominoesState, reason: "agreed" | "resigned", resigning?: PlayerIndex): DominoesState {
  if (state.status.kind !== "playing") return state;
  if (reason === "resigned") {
    const loser = resigning ?? state.status.turn;
    return { ...state, status: { kind: "finished", winner: otherPlayer(loser), reason } };
  }
  const [a, b] = state.totals;
  return { ...state, status: { kind: "finished", winner: a === b ? null : a < b ? 0 : 1, reason } };
}

/** The state as one seat may see it: no seed, no boneyard, and of the other
 *  hand only how many tiles it holds. */
export function viewFor(state: DominoesState, seat: PlayerIndex): DominoesState {
  const hands: [Tile[], Tile[]] = [[], []];
  hands[seat] = state.hands[seat];
  return { ...state, seed: 0, hands, boneyard: [] };
}

/** Replays a game from its options, seed and moves. */
export function replay(options: DominoesOptions, seed: number, moves: readonly DominoesMove[]): DominoesState {
  let state = createGame(options, seed);
  for (const move of moves) state = applyMove(state, move);
  return state;
}
