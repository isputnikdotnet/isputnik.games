// What the TV app (isputnik.tv) takes from this repository, written into it:
//
//   feature-games/src/main/assets/sputnik-lcd.json — the Sputnik Catch LCD, cut
//     into its printed backdrop and one small SVG per segment, so the TV draws
//     the same screen the browser does (apps/web/src/games/sputnik/sprites.ts);
//   feature-games/src/main/assets/chess-pieces.json — the chess pieces (pieces.tsx) in the
//     Classic colours;
//   feature-games/src/test/resources/arcade-golden.json — runs of Sputnik Catch
//     and Torpedo Run played through this engine, with the state at points along
//     the way, which the TV's Kotlin port of the rules must match exactly: the
//     server replays every TV run with THIS engine, and a port that drifts would
//     have its scores refused.
//
// Run after changing the arcade rules or the LCD art, then commit in both repos:
//   npx tsx --tsconfig apps/web/tsconfig.json scripts/export-tv.ts ../isputnik.tv
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Sputnik, Torpedo, randomStep, type SputnikRail, type SputnikState, type TorpedoInput, type TorpedoState } from "@isputnik/games-engine";
import { buildLcd, LCD_HEIGHT, LCD_WIDTH } from "../apps/web/src/games/sputnik/sprites";
import en from "../apps/web/src/locales/en.json";
import ru from "../apps/web/src/locales/ru.json";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChessPiece } from "../apps/web/src/games/chess/pieces";

const tv = resolve(process.argv[2] ?? "../isputnik.tv");
const write = (path: string, data: unknown) => {
  const file = join(tv, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data) + "\n");
  console.log(`wrote ${file}`);
};

// ── The LCD ────────────────────────────────────────────────────────────────

/** Cuts the generated SVG into the backdrop and its segments. Each segment keeps
 *  the transforms of the groups around it (the score digits sit in a skewed one). */
function cutLcd(svg: string): { backdrop: string; segments: Record<string, string> } {
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const tag = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  const stack: { name: string; attrs: string }[] = [];
  const segments: Record<string, string> = {};
  let backdrop = "";
  let open: { id: string; start: number; depth: number; wrap: string[] } | null = null;
  let copiedTo = 0;
  for (let m = tag.exec(inner); m; m = tag.exec(inner)) {
    const [whole, closing, name, attrs, selfClosing] = m;
    if (closing) {
      stack.pop();
      if (open && stack.length === open.depth) {
        const body = inner.slice(open.start, m.index + whole.length);
        segments[open.id] = open.wrap.reduceRight((acc, t) => `<g transform="${t}">${acc}</g>`, body);
        copiedTo = m.index + whole.length;
        open = null;
      }
      continue;
    }
    if (selfClosing) continue;
    const seg = /data-seg="([^"]+)"/.exec(attrs);
    if (seg && !open) {
      backdrop += inner.slice(copiedTo, m.index);
      const wrap = stack.map((s) => /transform="([^"]+)"/.exec(s.attrs)?.[1]).filter((t): t is string => Boolean(t));
      open = { id: seg[1], start: m.index, depth: stack.length, wrap };
    }
    stack.push({ name, attrs });
  }
  backdrop += inner.slice(copiedTo);
  // The groups the segments sat in are left empty in the backdrop: harmless.
  return { backdrop, segments };
}

const lcdEn = cutLcd(buildLcd({ gameA: en.sputnik.lcd.gameA, gameB: en.sputnik.lcd.gameB }));
const lcdRu = cutLcd(buildLcd({ gameA: ru.sputnik.lcd.gameA, gameB: ru.sputnik.lcd.gameB }));
write("feature-games/src/main/assets/sputnik-lcd.json", {
  width: LCD_WIDTH,
  height: LCD_HEIGHT,
  /** sputnik.css: an unlit segment is faintly there, a lit one nearly solid. */
  unlit: 0.075,
  lit: 0.93,
  backdrop: lcdEn.backdrop,
  segments: lcdEn.segments,
  /** The two segments that are words, in Russian. */
  ru: { "game-a": lcdRu.segments["game-a"], "game-b": lcdRu.segments["game-b"] }
});

// ── Chess pieces, in the Classic colours (chess.css) ────────────────────────

const CLASSIC = {
  white: { fill: "#fbf8f1", line: "#2a2520", detail: "#2a2520" },
  black: { fill: "#2b2622", line: "#0f0d0b", detail: "#d8cfbf" }
};
const pieces: Record<string, string> = {};
for (const letter of "PNBRQKpnbrqk") {
  const c = letter === letter.toUpperCase() ? CLASSIC.white : CLASSIC.black;
  pieces[letter] = renderToStaticMarkup(createElement(ChessPiece, { letter }))
    .replace(/ class="chess-piece[^"]*"/, "")
    .replace(/ aria-hidden="true"| focusable="false"/g, "")
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace('class="chess-piece-body"', `fill="${c.fill}" stroke="${c.line}" stroke-width="1.5" stroke-linejoin="round"`)
    .replace('class="chess-piece-detail"', `fill="none" stroke="${c.detail}" stroke-width="1.4" stroke-linecap="round"`)
    .replace('class="chess-piece-eye"', `fill="${letter === letter.toUpperCase() ? c.line : c.detail}" stroke="none"`);
}
write("feature-games/src/main/assets/chess-pieces.json", pieces);

// ── Golden runs ────────────────────────────────────────────────────────────

/** A seeded player, so the fixtures come out the same on every export. */
function dice(seed: number) {
  let rng = seed >>> 0;
  return () => {
    const [value, next] = randomStep(rng);
    rng = next;
    return value;
  };
}

const SNAPSHOT_EVERY = 37;
const MAX_TICKS = 20_000;

function sputnikRun(variant: "A" | "B", seed: number, skill: number) {
  const roll = dice(seed ^ 0x5bd1e995);
  let state: SputnikState = Sputnik.createRun(variant, seed);
  let net: SputnikRail = 0;
  const log: [number, SputnikRail][] = [];
  const snapshots: SputnikState[] = [state];
  while (!state.over && state.tick < MAX_TICKS) {
    // Mostly under the next sputnik to land; now and then somewhere else.
    let lead: SputnikState["sputniks"][number] | null = null;
    for (const s of state.sputniks) if (!lead || s.step > lead.step) lead = s;
    let want: SputnikRail = net;
    if (lead) want = roll() < skill ? lead.rail : (Math.floor(roll() * 4) as SputnikRail);
    if (want !== net) {
      net = want;
      log.push([state.tick, net]);
    }
    state = Sputnik.tick(state, net).state;
    if (state.tick % SNAPSHOT_EVERY === 0 || state.over) snapshots.push(state);
  }
  const replayed = Sputnik.sputnik.scoreOf(state);
  return { variant, seed, log, ticks: state.tick, score: replayed, snapshots };
}

function torpedoRun(seed: number, skill: number) {
  const roll = dice(seed ^ 0x27d4eb2f);
  let state: TorpedoState = Torpedo.createRun("standard", seed);
  let input: TorpedoInput = Torpedo.INITIAL_INPUT;
  const log: [number, TorpedoInput][] = [];
  const snapshots: TorpedoState[] = [state];
  let target: number | null = null;
  while (!state.over && state.tick < MAX_TICKS) {
    let want: TorpedoInput = { turn: 0, fire: false };
    if (state.phase === "bonus") {
      want = { turn: 0, fire: true };
    } else {
      // Lead a ship: aim where it will be when the torpedo gets to its lane.
      const ships = state.ships.filter((s) => s.sinking === null);
      if (target === null || !ships.some((s) => s.id === target)) target = ships.length ? ships[Math.floor(roll() * ships.length)].id : null;
      const ship = ships.find((s) => s.id === target);
      if (ship) {
        const lane = Torpedo.SHIPS[ship.kind].lane;
        const aim = Torpedo.aimFor(ship.x + ship.dir * ship.speed * Torpedo.RANGE[lane], lane) + Math.round((roll() - 0.5) * (1 - skill) * 120);
        const turn = aim > state.bearing + 5 ? 1 : aim < state.bearing - 5 ? -1 : 0;
        want = { turn, fire: turn === 0 && !state.torpedo && roll() < 0.5 };
      } else {
        want = { turn: roll() < 0.1 ? (roll() < 0.5 ? -1 : 1) : 0, fire: false };
      }
    }
    if (want.turn !== input.turn || want.fire !== input.fire) {
      input = want;
      log.push([state.tick, input]);
    }
    state = Torpedo.tick(state, input).state;
    if (state.tick % SNAPSHOT_EVERY === 0 || state.over) snapshots.push(state);
  }
  return { variant: "standard", seed, log, ticks: state.tick, score: Torpedo.torpedo.scoreOf(state), snapshots };
}

const sputnik = [
  sputnikRun("A", 1, 0.97), sputnikRun("A", 424242, 0.99), sputnikRun("B", 7, 0.95), sputnikRun("B", 0xffffffff, 0.98), sputnikRun("A", 2026, 0.6)
];
const torpedo = [torpedoRun(1, 1), torpedoRun(99, 0.9), torpedoRun(0xdeadbeef, 0.6), torpedoRun(31337, 1), torpedoRun(5, 0.3)];
for (const run of sputnik) console.log(`sputnik ${run.variant} seed ${run.seed}: ${run.score} in ${run.ticks} ticks, ${run.log.length} inputs`);
for (const run of torpedo) {
  const last = run.snapshots[run.snapshots.length - 1] as TorpedoState;
  console.log(`torpedo seed ${run.seed}: ${run.score} in ${run.ticks} ticks, ${run.log.length} inputs, rounds ${last.rounds.length}`);
}
write("feature-games/src/test/resources/arcade-golden.json", { sputnik, torpedo });
