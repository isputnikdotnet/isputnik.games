// The computer opponent for Dominoes. It sees only what a player would: its own
// hand, the line, how many tiles the other hand and the boneyard hold, and the
// numbers the other seat is known to lack (`lacks`). It reads the state through
// viewFor first, so nothing else can reach it.
//
//  easy    plays any tile it can, and now and then the heaviest of them.
//  normal  weighs each play: pips shed (doubles a little more, since they fit
//          only one number), the ends it leaves — one the other hand is known
//          to lack is worth a lot, one its own hand can follow up is worth some —
//          and keeping a spread of numbers in hand.
//  hard    samples: deals the unseen tiles into hands that fit what it knows,
//          plays each candidate out to the end of the hand with the normal
//          policy for both sides, and keeps the play with the best average
//          result in points. It looks only to the end of the hand; near the
//          target a lost hand is worth more than its points.
//
// Drawing and passing are never choices: when they are legal they are the only move.
import type { AiLevel, GameAi, PlayerIndex } from "../game.js";
import { otherPlayer } from "../game.js";
import {
  applyMove,
  endsOf,
  fullSet,
  legalMoves,
  sameTile,
  viewFor,
  type DominoesMove,
  type DominoesState,
  type Tile
} from "./rules.js";

type Play = Extract<DominoesMove, { kind: "play" }>;

/** How many samples the hard level plays each candidate against. */
export const HARD_SAMPLES = 48;

const key = (tile: Tile) => tile[0] * 7 + tile[1];

/** The ends left after a play. */
function endsAfter(state: DominoesState, play: Play): [number, number] {
  const ends = endsOf(state);
  const [a, b] = play.tile;
  if (!ends) return [a, b];
  if (play.end === "left") return [a === ends[0] ? b : a, ends[1]];
  return [ends[0], a === ends[1] ? b : a];
}

/** The normal level's opinion of a play, from the mover's seat. */
export function scorePlay(state: DominoesState, play: Play, me: PlayerIndex): number {
  const tile = play.tile;
  const rest = state.hands[me].filter((t) => !sameTile(t, tile));
  if (rest.length === 0) return 1000;
  let score = tile[0] + tile[1];
  if (tile[0] === tile[1]) score += 4;
  const [left, right] = endsAfter(state, play);
  const theirLacks = state.lacks[otherPlayer(me)];
  for (const end of left === right ? [left] : [left, right]) {
    if (theirLacks.includes(end)) score += left === right ? 14 : 7;
    if (rest.some((t) => t[0] === end || t[1] === end)) score += 2;
  }
  // A spread of numbers left in hand keeps answers for whatever comes.
  const numbers = new Set(rest.flatMap((t) => t));
  score += numbers.size * 1.5;
  return score;
}

function chooseNormal(state: DominoesState, plays: Play[], me: PlayerIndex, random: () => number): Play {
  let best = plays[0];
  let bestScore = -Infinity;
  for (const play of plays) {
    const score = scorePlay(state, play, me) + random() * 0.5;
    if (score > bestScore) {
      best = play;
      bestScore = score;
    }
  }
  return best;
}

/** A full state the view could have come from: the unseen tiles dealt to the
 *  other hand (none with a number it is known to lack, where that can be kept)
 *  and the boneyard in a random order. */
export function sampleWorld(view: DominoesState, me: PlayerIndex, random: () => number): DominoesState {
  const them = otherPlayer(me);
  const seen = new Set<number>(view.hands[me].map(key));
  for (const laid of view.line) seen.add(key(laid.left <= laid.right ? [laid.left, laid.right] : [laid.right, laid.left]));
  const unseen = fullSet().filter((tile) => !seen.has(key(tile)));
  for (let i = unseen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
  }
  const lacks = view.lacks[them];
  const allowed = (tile: Tile) => !lacks.includes(tile[0]) && !lacks.includes(tile[1]);
  const theirs: Tile[] = [];
  const left: Tile[] = [];
  for (const tile of unseen) (theirs.length < view.handCounts[them] && allowed(tile) ? theirs : left).push(tile);
  // Too few tiles fit what is known (it cannot happen in a real game): fill up anyway.
  while (theirs.length < view.handCounts[them]) theirs.push(left.shift()!);
  const hands: [Tile[], Tile[]] = [[], []];
  hands[me] = view.hands[me];
  hands[them] = theirs;
  return { ...view, hands, boneyard: left, boneyardCount: left.length };
}

/** Plays a world to the end of its hand with the normal policy; returns what
 *  the hand was worth to `me`: the other side's points less its own. */
function playOutHand(world: DominoesState, me: PlayerIndex, random: () => number): number {
  const hand = world.hand;
  let state = world;
  for (let guard = 0; guard < 200 && state.status.kind === "playing" && state.hand === hand; guard++) {
    const turn = state.status.turn;
    const legal = legalMoves(state);
    const plays = legal.filter((m): m is Play => m.kind === "play");
    state = applyMove(state, plays.length > 0 ? chooseNormal(state, plays, turn, random) : legal[0]);
  }
  const result = state.history.find((h) => h.hand === hand);
  if (!result) return 0;
  const them = otherPlayer(me);
  let value = result.points[them] - result.points[me];
  // Reaching the target loses the game, whatever the points.
  if (world.totals[me] + result.points[me] >= world.target) value -= 200;
  if (world.totals[them] + result.points[them] >= world.target) value += 200;
  return value;
}

function chooseHard(view: DominoesState, plays: Play[], me: PlayerIndex, random: () => number): Play {
  const totals = plays.map(() => 0);
  for (let s = 0; s < HARD_SAMPLES; s++) {
    const world = sampleWorld(view, me, random);
    plays.forEach((play, i) => {
      totals[i] += playOutHand(applyMove(world, play), me, random);
    });
  }
  let best = 0;
  for (let i = 1; i < plays.length; i++) {
    const better = totals[i] > totals[best];
    // A tie goes to the normal level's opinion.
    const tied = totals[i] === totals[best] && scorePlay(view, plays[i], me) > scorePlay(view, plays[best], me);
    if (better || tied) best = i;
  }
  return plays[best];
}

export function chooseMove(state: DominoesState, level: AiLevel, random: () => number): DominoesMove | null {
  if (state.status.kind !== "playing") return null;
  const me = state.status.turn;
  const view = viewFor(state, me);
  const legal = legalMoves(view);
  const plays = legal.filter((m): m is Play => m.kind === "play");
  if (plays.length === 0) return legal[0] ?? null;
  // The same tile on either end of a line whose ends match is one play.
  const distinct = plays.filter((play, i) => {
    const [l, r] = endsAfter(view, play);
    return !plays.slice(0, i).some((p) => sameTile(p.tile, play.tile) && endsAfter(view, p).join() === [l, r].join());
  });
  if (distinct.length === 1) return distinct[0];
  if (level === "easy") {
    if (random() < 0.3) return distinct.reduce((a, b) => (b.tile[0] + b.tile[1] > a.tile[0] + a.tile[1] ? b : a));
    return distinct[Math.floor(random() * distinct.length)];
  }
  if (level === "normal") return chooseNormal(view, distinct, me, random);
  return chooseHard(view, distinct, me, random);
}

export const dominoesAi: GameAi<DominoesState, DominoesMove> = { chooseMove };
