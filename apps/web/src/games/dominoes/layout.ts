import type { LaidTile } from "@isputnik/games-engine";

// Where each tile of the line lies on the table. The line grows both ways from
// the hand's first tile: the right arm runs right and, at the table's edge,
// turns down and runs back; the left arm runs left and turns up. Doubles lie
// crosswise, except straight after a corner, where a crosswise double would
// sit beside both halves of the corner tile. A turning tile stands on end at
// the corner. Pure, so it is tested
// on its own; the table draws whatever it returns, in its own units.

/** A tile as placed: its box, which way it stands, and its two numbers in
 *  reading order (left then right, or top then bottom). */
export interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
  vertical: boolean;
  a: number;
  b: number;
}

/** A tile the player could lay at an end, as [the number that meets the end, the other]. */
export type Candidate = [number, number];

export interface LineLayout {
  /** The line's tiles, in line order (left to right). */
  tiles: Placed[];
  /** Where a candidate would lie at each end, if one was given. */
  ghosts: { left?: Placed; right?: Placed };
  /** The short side of a tile. */
  size: number;
}

interface Item {
  meet: number;
  free: number;
  index: number;
}

/** Lays the line out at tile size `s` in a `width` × `height` box. */
export function layoutLine(
  line: readonly LaidTile[],
  leadIndex: number,
  s: number,
  width: number,
  height: number,
  extra: { left?: Candidate; right?: Candidate } = {}
): LineLayout {
  const tiles: Placed[] = new Array(line.length);
  const ghosts: LineLayout["ghosts"] = {};
  if (line.length === 0) return { tiles: [], ghosts, size: s };
  const L = 2 * s;
  const margin = s / 2;
  const cy0 = height / 2;
  const lead = line[leadIndex];
  const leadDouble = lead.left === lead.right;
  const lw = leadDouble ? s : L;
  const lx = width / 2 - lw / 2;
  tiles[leadIndex] = leadDouble
    ? { x: lx, y: cy0 - s, w: s, h: L, vertical: true, a: lead.left, b: lead.right }
    : { x: lx, y: cy0 - s / 2, w: L, h: s, vertical: false, a: lead.left, b: lead.right };

  const arm = (items: Item[], down: boolean) => {
    let dir = down ? 1 : -1;
    let cy = cy0;
    let cur = down ? lx + lw : lx;
    // A double reaches half a tile further from the row than a tile lying along it.
    let lastDouble = leadDouble;
    let turned = false;
    for (const { meet, free, index } of items) {
      const double = meet === free && !turned;
      const w = double ? s : L;
      let placed: Placed;
      if ((dir === 1 && cur + w > width - margin) || (dir === -1 && cur - w < margin)) {
        // The corner: the tile stands on end under (or over) the arm's last
        // tile, clear of it, and the next row runs back from its far half.
        const x = dir === 1 ? cur - s : cur;
        const gap = lastDouble ? s : s / 2;
        if (down) {
          placed = { x, y: cy + gap, w: s, h: L, vertical: true, a: meet, b: free };
          cy += gap + L - s / 2;
        } else {
          placed = { x, y: cy - gap - L, w: s, h: L, vertical: true, a: free, b: meet };
          cy -= gap + L - s / 2;
        }
        cur = dir === 1 ? x : x + s;
        dir = -dir;
        lastDouble = false;
        turned = true;
      } else {
        const x = dir === 1 ? cur : cur - w;
        placed = double
          ? { x, y: cy - s, w: s, h: L, vertical: true, a: meet, b: free }
          : { x, y: cy - s / 2, w: L, h: s, vertical: false, a: dir === 1 ? meet : free, b: dir === 1 ? free : meet };
        cur += dir * w;
        lastDouble = double;
        turned = false;
      }
      if (index >= 0) tiles[index] = placed;
      else if (down) ghosts.right = placed;
      else ghosts.left = placed;
    }
  };

  const right: Item[] = [];
  for (let i = leadIndex + 1; i < line.length; i++) right.push({ meet: line[i].left, free: line[i].right, index: i });
  if (extra.right) right.push({ meet: extra.right[0], free: extra.right[1], index: -1 });
  const left: Item[] = [];
  for (let i = leadIndex - 1; i >= 0; i--) left.push({ meet: line[i].right, free: line[i].left, index: i });
  if (extra.left) left.push({ meet: extra.left[0], free: extra.left[1], index: -1 });
  arm(right, true);
  arm(left, false);
  return { tiles, ghosts, size: s };
}

function fits(layout: LineLayout, width: number, height: number): boolean {
  const all = [...layout.tiles, ...(layout.ghosts.left ? [layout.ghosts.left] : []), ...(layout.ghosts.right ? [layout.ghosts.right] : [])];
  return all.every((t) => t.x >= 0 && t.y >= 0 && t.x + t.w <= width && t.y + t.h <= height);
}

/** The line at the largest tile size from `max` down to `min` that keeps it
 *  (and the candidates) inside the box; `min` if nothing larger does. */
export function fitLine(
  line: readonly LaidTile[],
  leadIndex: number,
  width: number,
  height: number,
  max: number,
  min: number,
  extra: { left?: Candidate; right?: Candidate } = {}
): LineLayout {
  for (let s = max; s > min; s -= 1) {
    const layout = layoutLine(line, leadIndex, s, width, height, extra);
    if (fits(layout, width, height)) return layout;
  }
  return layoutLine(line, leadIndex, min, width, height, extra);
}
