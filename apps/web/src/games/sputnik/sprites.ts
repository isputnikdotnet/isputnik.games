import { Sputnik, type SputnikRail } from "@isputnik/games-engine";

// The handheld's LCD as one SVG, ported from the owner's mock
// (docs/mocks/sputnik-catch-mock.html). Two layers, as on the real thing:
// the printed backdrop in colour (station modules, rails, Moon, stars, lunar
// ground), always shown; and the segments, every sprite in every position,
// each a <g class="lcd-seg" data-seg="…"> that LcdScreen switches on and off.
// An unlit segment stays faintly visible, which is what makes it look like an
// LCD. Built once as a string: it is a few hundred static shapes, and the only
// thing that ever changes is which of them are lit.
//
// Segment ids: s<rail><step> a sputnik; robot-left/robot-right the robot
// facing that way; net<rail> his arm and net at a rail's foot; belka; wreck-
// left/right a crashed sputnik; alien-<side><step> the alien running off;
// miss<n> the aliens loose; game-a/game-b; d<digit><a…g> the score.

export const LCD_WIDTH = 480;
export const LCD_HEIGHT = 300;

const SEG = "#1b2119";
const BG = "#c5cbb2";
const INK = "#5a6976";
const STEEL = "#6f6c62";
const HULL = "#b1b79e";
const GLASS = "#9fb1b6";
const RED = "#b8322a";
const FONT = `"Russo One", "Arial Black", "Segoe UI Black", Impact, sans-serif`;

/** Rails as drawn: 0 upper left, 1 lower left, 2 upper right, 3 lower right. */
const RAILS = [
  { x1: 72, y1: 92, x2: 165, y2: 128 },
  { x1: 72, y1: 168, x2: 165, y2: 204 },
  { x1: 408, y1: 92, x2: 315, y2: 128 },
  { x1: 408, y1: 168, x2: 315, y2: 204 }
] as const;

/** Where the alien is at each step of its run, leaving the wreck. */
const ALIEN_X = [106, 82, 58, 34];

const seg = (id: string, inner: string) => `<g class="lcd-seg" data-seg="${id}">${inner}</g>`;
const mirror = (inner: string) => `<g transform="translate(${LCD_WIDTH},0) scale(-1,1)">${inner}</g>`;
const OUT = `fill="${BG}" stroke="${SEG}" stroke-width="2.3" stroke-linejoin="round"`;
const line = (width = 1.6) => `fill="none" stroke="${SEG}" stroke-width="${width}" stroke-linecap="round"`;
/** An outlined stroke: a thick dark line with a lighter one inside it. */
const tube = (d: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${SEG}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${BG}" stroke-width="${width - 4.4}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fixed = (n: number) => n.toFixed(1);

function starPath(x: number, y: number, r: number): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.42 : r;
    d += `${i ? "L" : "M"}${fixed(x + Math.cos(a) * rr)},${fixed(y + Math.sin(a) * rr)} `;
  }
  return `${d}Z`;
}

const twinkle = (x: number, y: number, r: number) =>
  `<path d="M${x},${y - r} L${x + r * 0.25},${y - r * 0.25} L${x + r},${y} L${x + r * 0.25},${y + r * 0.25} L${x},${y + r} L${x - r * 0.25},${y + r * 0.25} L${x - r},${y} L${x - r * 0.25},${y - r * 0.25} Z" fill="${INK}"/>`;

// ── The printed backdrop ────────────────────────────────────────────────────

function stationModule(y: number): string {
  return `
    <line x1="18" y1="${y - 30}" x2="18" y2="${y - 40}" stroke="${INK}" stroke-width="2"/>
    <rect x="4" y="${y - 48}" width="30" height="9" fill="${GLASS}" stroke="${INK}" stroke-width="1.6"/>
    <path d="M11.5,${y - 48} v9 M19,${y - 48} v9 M26.5,${y - 48} v9" stroke="${INK}" stroke-width="1"/>
    <rect x="6" y="${y - 30}" width="54" height="32" rx="7" fill="${HULL}" stroke="${INK}" stroke-width="2"/>
    <path d="M60,${y - 22} L73,${y - 16} L73,${y - 6} L60,${y - 1}" fill="${HULL}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="22" cy="${y - 14}" r="7" fill="${GLASS}" stroke="${INK}" stroke-width="2"/>
    <path d="M18,${y - 17} q3,-3 7,-1" stroke="#e8ede0" stroke-width="1.5" fill="none"/>
    <path d="${starPath(44, y - 14, 7.5)}" fill="${RED}"/>`;
}

function backdrop(): string {
  let out = "";
  const stars: [number, number, number][] = [[172, 76, 4], [300, 82, 3.5], [392, 16, 3.5], [468, 74, 3], [176, 22, 3], [296, 50, 2.6], [88, 236, 3], [394, 238, 3], [190, 104, 2.4]];
  for (const [x, y, r] of stars) out += twinkle(x, y, r);
  out += `<circle cx="446" cy="28" r="14" fill="#dcdfcb" stroke="${INK}" stroke-width="1.6"/><circle cx="440" cy="24" r="13" fill="${BG}"/>`;
  out += `<circle cx="130" cy="40" r="25" fill="none" stroke="${STEEL}" stroke-width="4"/>`;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    out += `<circle cx="${fixed(130 + Math.cos(a) * 25)}" cy="${fixed(40 + Math.sin(a) * 25)}" r="1.6" fill="${BG}"/>`;
  }
  out += stationModule(92) + stationModule(168) + mirror(stationModule(92) + stationModule(168));
  for (const r of RAILS) {
    out += `<line x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}" stroke="${STEEL}" stroke-width="4.5" stroke-linecap="round"/>`;
    out += `<line x1="${r.x1}" y1="${r.y1 + 4}" x2="${r.x2}" y2="${r.y2 + 4}" stroke="${STEEL}" stroke-width="1.5" stroke-dasharray="2 7"/>`;
  }
  out += `<path d="M0,288 Q120,281 240,286 T480,285" stroke="${INK}" stroke-width="1.5" fill="none"/>`;
  for (const [x, rx] of [[48, 10], [158, 7], [318, 13], [440, 8]]) {
    out += `<ellipse cx="${x}" cy="294" rx="${rx}" ry="2.4" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
  }
  return out;
}

// ── The segments ────────────────────────────────────────────────────────────

/** Score digits: each stroke's [x, y, width, height] within a 16×28 digit. */
const DIGIT_STROKES: Record<string, [number, number, number, number]> = {
  a: [2, 0, 12, 3.4], b: [12.6, 1.6, 3.4, 11.6], c: [12.6, 14.8, 3.4, 11.6], d: [2, 24.6, 12, 3.4],
  e: [0, 14.8, 3.4, 11.6], f: [0, 1.6, 3.4, 11.6], g: [2, 12.3, 12, 3.4]
};
/** Which strokes make each digit. */
export const DIGITS: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
  "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg"
};

function alien(cx: number, cy: number, dir: 1 | -1, step = 0): string {
  const legs = step % 2
    ? `M${cx - 2},${cy + 6} l-4,6 M${cx + 2},${cy + 6} l4,5`
    : `M${cx - 2},${cy + 6} l2,6 M${cx + 2},${cy + 6} l-2,6`;
  return `
    <path d="M${cx - 2},${cy - 14} l-3,-6 M${cx + 2},${cy - 14} l3,-6" ${line()}/>
    <circle cx="${cx - 5}" cy="${cy - 20.5}" r="1.7" fill="${SEG}"/><circle cx="${cx + 5}" cy="${cy - 20.5}" r="1.7" fill="${SEG}"/>
    <ellipse cx="${cx}" cy="${cy - 7}" rx="6.5" ry="7" ${OUT}/>
    <ellipse cx="${cx + dir * 2.6}" cy="${cy - 8}" rx="1.7" ry="2.6" fill="${SEG}"/><ellipse cx="${cx - dir * 2.2}" cy="${cy - 8}" rx="1.5" ry="2.4" fill="${SEG}"/>
    <rect x="${cx - 3.5}" y="${cy - 0.5}" width="7" height="7" rx="2" fill="${SEG}"/>
    <path d="${legs}" stroke="${SEG}" stroke-width="1.8" stroke-linecap="round"/>`;
}

const belka = `
  <path d="M117,56 Q130,63 143,56" stroke="${SEG}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <path d="M121,35 L117,23 L127,31 Z M139,35 L143,23 L133,31 Z" fill="${SEG}"/>
  <ellipse cx="130" cy="41" rx="10.5" ry="9.5" ${OUT}/>
  <ellipse cx="130" cy="47" rx="5.5" ry="3.8" ${OUT}/>
  <ellipse cx="130" cy="44.6" rx="2.2" ry="1.6" fill="${SEG}"/>
  <circle cx="126" cy="38.5" r="1.7" fill="${SEG}"/><circle cx="134" cy="38.5" r="1.7" fill="${SEG}"/>
  <path d="M126.5,33 q-3,0 -4,2" ${line()}/>
  <circle cx="130" cy="40" r="18" fill="none" stroke="${SEG}" stroke-width="1.6"/>
  <path d="M118,31 q4,-6 11,-7" stroke="${SEG}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;

/** A sputnik on a rail: a ball with four antennae trailing behind it. */
function sputnik(rail: SputnikRail, step: number): string {
  const R = RAILS[rail];
  const dx = R.x2 - R.x1;
  const dy = R.y2 - R.y1;
  const len = Math.hypot(dx, dy);
  const nx = dx > 0 ? dy / len : -dy / len;
  const ny = dx > 0 ? -dx / len : dx / len;
  const trail = (Math.atan2(-dy, -dx) * 180) / Math.PI;
  const t = 0.1 + step * 0.2;
  const x = R.x1 + dx * t + nx * 9;
  const y = R.y1 + dy * t + ny * 9;
  const wobble = step % 2 ? 8 : -8;
  let d = "";
  for (const off of [-30, -11, 11, 30]) {
    const a = ((trail + off + wobble) * Math.PI) / 180;
    d += `M${fixed(x + Math.cos(a) * 5)},${fixed(y + Math.sin(a) * 5)} L${fixed(x + Math.cos(a) * 17)},${fixed(y + Math.sin(a) * 17)} `;
  }
  return `<path d="${d}" ${line()}/><circle cx="${fixed(x)}" cy="${fixed(y)}" r="6" ${OUT}/><path d="M${fixed(x - 3.4)},${fixed(y - 1.2)} q2,-3 5,-2.4" ${line(1.1)}/>`;
}

/** РОБ-1, facing left; the right-facing pose is his mirror. */
const robot = `
  ${tube("M262,194 L276,208 L272,224", 7.5)}
  <path d="M270,224 l-4,6 M274,224 l4,6" ${line()}/>
  <rect x="212" y="258" width="62" height="20" rx="10" fill="${SEG}"/>
  ${[224, 237, 250, 263].map((x) => `<circle cx="${x}" cy="268" r="4.6" ${OUT}/>`).join("")}
  ${tube("M243,236 L243,259", 13)}
  <path d="M238,243 H248 M238,249 H248 M238,255 H248" ${line()}/>
  <rect x="220" y="178" width="46" height="60" rx="8" ${OUT}/>
  <circle cx="243" cy="201" r="12" ${OUT}/>
  <path d="${starPath(243, 202, 9)}" fill="${SEG}"/>
  <path d="M227,222 H259 M227,227 H259 M227,232 H259" ${line()}/>
  <rect x="237" y="168" width="12" height="11" ${OUT}/>
  <path d="M232,126 L228,113 M249,126 L253,103" ${line(2)}/>
  <circle cx="228" cy="111" r="2.6" fill="${SEG}"/><circle cx="253.5" cy="100" r="4.2" fill="${SEG}"/>
  <rect x="262" y="139" width="8" height="18" rx="2" fill="${SEG}"/>
  <rect x="216" y="126" width="50" height="44" rx="10" ${OUT}/>
  <circle cx="230" cy="144" r="7.5" ${OUT}/><circle cx="249" cy="144" r="7.5" ${OUT}/>
  <circle cx="227" cy="145" r="3.2" fill="${SEG}"/><circle cx="246" cy="145" r="3.2" fill="${SEG}"/>
  <rect x="224" y="157" width="28" height="8" rx="2" ${OUT}/>
  <path d="M231,157 v8 M238,157 v8 M245,157 v8" ${line()}/>`;

/** A butterfly net, its ring at (cx, cy - 6). */
const net = (cx: number, cy: number) => `
  <path d="M${cx - 15},${cy - 6} Q${cx - 12},${cy + 12} ${cx},${cy + 15} Q${cx + 12},${cy + 12} ${cx + 15},${cy - 6}" ${OUT}/>
  <path d="M${cx - 7},${cy - 5} L${cx - 4},${cy + 12} M${cx},${cy - 4} V${cy + 15} M${cx + 7},${cy - 5} L${cx + 4},${cy + 12} M${cx - 13},${cy + 3} H${cx + 13}" stroke="${SEG}" stroke-width="1" fill="none"/>
  <ellipse cx="${cx}" cy="${cy - 6}" rx="15" ry="4.5" fill="none" stroke="${SEG}" stroke-width="2.6"/>`;

const arm = (ex: number, ey: number, hx: number, hy: number) => `
  ${tube(`M224,192 L${ex},${ey} L${hx},${hy}`, 8)}
  <circle cx="${ex}" cy="${ey}" r="3.6" fill="${SEG}"/>
  <path d="M${hx - 1},${hy - 2} l-5,-3 M${hx - 1},${hy + 2} l-5,3" ${line(2)}/>`;

const wreck = (cx: number) => `
  <path d="M${cx - 18},285 l4,-6 l3,4 l4,-8 l3,6 l4,-5 l3,7 l4,-6 l3,8" ${line()}/>
  <path d="M${cx - 7},279 l-12,-6 M${cx + 7},279 l12,-7 M${cx - 4},270 l-7,-11 M${cx + 5},270 l8,-10" ${line(1.8)}/>
  <circle cx="${cx}" cy="275" r="6.5" ${OUT}/>
  <path d="M${cx - 3},271 l3,4 l3,-3" ${line()}/>`;

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The whole screen. `labels` are the two game names printed on the LCD. */
export function buildLcd(labels: { gameA: string; gameB: string }): string {
  let segs = "";
  segs += seg("game-a", `<text x="186" y="298" font-family='${FONT}' font-size="11" fill="${SEG}">${escape(labels.gameA)}</text>`);
  segs += seg("game-b", `<text x="250" y="298" font-family='${FONT}' font-size="11" fill="${SEG}">${escape(labels.gameB)}</text>`);
  for (let i = 0; i < 4; i++) {
    let digit = "";
    for (const [stroke, [x, y, w, h]] of Object.entries(DIGIT_STROKES)) {
      digit += seg(`d${i}${stroke}`, `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.2" fill="${SEG}"/>`);
    }
    segs += `<g transform="translate(${204 + i * 20},12) skewX(-6)">${digit}</g>`;
  }
  for (let i = 0; i < 3; i++) segs += seg(`miss${i}`, alien(330 + i * 22, 38, 1));
  segs += seg("belka", belka);
  for (const rail of Sputnik.RAILS) {
    for (let step = 0; step < Sputnik.STEPS; step++) segs += seg(`s${rail}${step}`, sputnik(rail, step));
  }
  const up = arm(206, 174, 190, 142) + net(172, 146);
  const down = arm(205, 208, 190, 216) + net(172, 222);
  segs += seg("robot-left", robot) + seg("robot-right", mirror(robot));
  segs += seg("net0", up) + seg("net1", down) + seg("net2", mirror(up)) + seg("net3", mirror(down));
  segs += seg("wreck-left", wreck(136)) + seg("wreck-right", wreck(344));
  ALIEN_X.forEach((x, step) => {
    segs += seg(`alien-left${step}`, alien(x, 279, -1, step));
    segs += seg(`alien-right${step}`, alien(LCD_WIDTH - x, 279, 1, step));
  });
  return `<svg viewBox="0 0 ${LCD_WIDTH} ${LCD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${backdrop()}${segs}</svg>`;
}
