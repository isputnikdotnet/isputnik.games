import { Dots, type DotsState, type PlayerIndex } from "@isputnik/games-engine";

// What the board draws on top of the dots, the way the paper game is drawn: a
// line between every two neighbouring live dots of one colour (so a chain reads
// as a chain and a gap in it is visible), and each captured area as a filled
// loop through the dots that ring it. Pure geometry over the engine's state, in
// board units (a point at x,y sits at x+0.5, y+0.5).

export interface ChainLink {
  owner: PlayerIndex;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TerritoryOutline {
  owner: PlayerIndex;
  /** The ring's dot centres, in order, as "x,y x,y …" for an SVG polygon. */
  points: string;
}

const centre = (v: number) => v + 0.5;

/** Every link between two 8-neighbouring live dots of the same colour, each once. */
export function chainLinks(state: DotsState): ChainLink[] {
  const size = state.size;
  const links: ChainLink[] = [];
  // Right, down, down-right, down-left: each pair is seen from exactly one end.
  const steps: [number, number][] = [[1, 0], [0, 1], [1, 1], [-1, 1]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dot = state.dots[i];
      if (!dot) continue;
      const owner = (dot - 1) as PlayerIndex;
      if (!Dots.isLiveDot(state, i, owner)) continue;
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (state.dots[n] !== dot || !Dots.isLiveDot(state, n, owner)) continue;
        links.push({ owner, x1: centre(x), y1: centre(y), x2: centre(nx), y2: centre(ny) });
      }
    }
  }
  return links;
}

// Clockwise from north, for the contour walk below.
const AROUND: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/**
 * One loop per captured area. Each area is a 4-connected patch of one owner's
 * territory; its ring is the owner's live dots touching the patch. The ring is
 * walked with Moore neighbour tracing from its top-left dot, which follows the
 * outer edge even where the wall is two dots thick, and ignores the owner's own
 * dots that happen to sit inside the area.
 */
export function territoryOutlines(state: DotsState): TerritoryOutline[] {
  const size = state.size;
  const seen = new Uint8Array(size * size);
  const outlines: TerritoryOutline[] = [];

  for (let start = 0; start < state.territory.length; start++) {
    const ownerCode = state.territory[start];
    if (!ownerCode || seen[start]) continue;
    const owner = (ownerCode - 1) as PlayerIndex;

    // The patch: territory cells of this owner, 4-connected.
    const patch: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      patch.push(i);
      const x = i % size;
      const y = (i - x) / size;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (seen[n] || state.territory[n] !== ownerCode) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }

    // The ring: live dots of the owner, outside the patch, touching it.
    const wall = new Set<number>();
    for (const i of patch) {
      const x = i % size;
      const y = (i - x) / size;
      for (const [dx, dy] of AROUND) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (state.territory[n] === ownerCode) continue;
        if (Dots.isLiveDot(state, n, owner)) wall.add(n);
      }
    }
    if (wall.size === 0) continue;

    const points = traceRing(wall, size);
    if (points.length >= 3) {
      outlines.push({ owner, points: points.map(([x, y]) => `${centre(x)},${centre(y)}`).join(" ") });
    }
  }
  return outlines;
}

// Moore neighbour tracing over the ring cells, clockwise, from the top-left
// cell, entering from the west. Stops on coming back to the start cell from
// the same direction (Jacob's criterion), so a loop that passes its start twice
// is still walked whole.
function traceRing(wall: Set<number>, size: number): [number, number][] {
  let first = -1;
  for (let i = 0; i < size * size; i++) {
    if (wall.has(i)) {
      first = i;
      break;
    }
  }
  if (first < 0) return [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x);
  const sx = first % size;
  const sy = (first - sx) / size;

  const path: [number, number][] = [[sx, sy]];
  if (wall.size === 1) return path;

  let cx = sx;
  let cy = sy;
  // Where we came from, as an index into AROUND relative to the current cell:
  // the start was entered from the west.
  let from = 6;
  const startFrom = from;
  const limit = wall.size * 8 + 8;
  for (let guard = 0; guard < limit; guard++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const dir = (from + k) % 8;
      const [dx, dy] = AROUND[dir];
      const n = at(cx + dx, cy + dy);
      if (n >= 0 && wall.has(n)) {
        found = dir;
        break;
      }
    }
    if (found < 0) break;
    const [dx, dy] = AROUND[found];
    cx += dx;
    cy += dy;
    // The backtrack of Moore tracing: the next scan starts where the previous one
    // stopped, at the cell checked just before the one found. Seen from the new
    // cell that cell lies at found+5 after a diagonal step and found+6 after a
    // straight one (the two step kinds shift the neighbourhood differently).
    from = (found + (found % 2 === 1 ? 5 : 6)) % 8;
    if (cx === sx && cy === sy && from === startFrom) break;
    if (cx === sx && cy === sy && path.length > 2) break;
    path.push([cx, cy]);
  }
  return path;
}
