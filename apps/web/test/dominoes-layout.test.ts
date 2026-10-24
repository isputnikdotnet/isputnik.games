import { describe, expect, it } from "vitest";
import { Dominoes, seededRandom, type DominoesState, type GameEvent, type LaidTile } from "@isputnik/games-engine";
import { fitLine, layoutLine, type Placed } from "../src/games/dominoes/layout";
import { dominoesLines } from "../src/games/dominoes/comms";

/** A tile's two halves as boxes, each with its number. */
const halves = (t: Placed, s: number) => t.vertical
  ? [{ x: t.x, y: t.y, w: s, h: s, n: t.a }, { x: t.x, y: t.y + s, w: s, h: s, n: t.b }]
  : [{ x: t.x, y: t.y, w: s, h: s, n: t.a }, { x: t.x + s, y: t.y, w: s, h: s, n: t.b }];
type Half = ReturnType<typeof halves>[number];
/** Two boxes sharing a stretch of edge. */
const touch = (a: Half, b: Half) => {
  const e = 0.01;
  const xMeet = Math.abs(a.x + a.w - b.x) < e || Math.abs(b.x + b.w - a.x) < e;
  const yMeet = Math.abs(a.y + a.h - b.y) < e || Math.abs(b.y + b.h - a.y) < e;
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > e;
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > e;
  return (xMeet && yOverlap) || (yMeet && xOverlap);
};
const overlaps = (a: Placed, b: Placed) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;

/** The lines a few random hands reach, as long as they get. */
function lines(): DominoesState[] {
  const out: DominoesState[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    const random = seededRandom(seed);
    let state = Dominoes.createGame({ target: 51 }, seed);
    let longest = state;
    while (state.status.kind === "playing" && state.hand === 1) {
      const legal = Dominoes.legalMoves(state);
      state = Dominoes.applyMove(state, legal[Math.floor(random() * legal.length)]);
      if (state.hand === 1 && state.line.length > longest.line.length) longest = state;
    }
    out.push(longest);
  }
  return out;
}

describe("the line on the table", () => {
  it("puts the first tile in the middle, a double standing", () => {
    const line: LaidTile[] = [{ left: 3, right: 3 }];
    expect(layoutLine(line, 0, 40, 1000, 600).tiles[0]).toEqual({ x: 480, y: 260, w: 40, h: 80, vertical: true, a: 3, b: 3 });
    expect(layoutLine([{ left: 2, right: 5 }], 0, 40, 1000, 600).tiles[0]).toMatchObject({ x: 460, y: 280, w: 80, h: 40, vertical: false });
  });

  it("reads each tile the way it lies, so touching numbers meet", () => {
    const line: LaidTile[] = [{ left: 6, right: 2 }, { left: 2, right: 5 }, { left: 5, right: 5 }, { left: 5, right: 1 }];
    const { tiles } = layoutLine(line, 1, 40, 1000, 600);
    expect(tiles.map((t) => [t.a, t.b])).toEqual([[6, 2], [2, 5], [5, 5], [5, 1]]);
    // Left to right along the row, each tile starts where the last one ends.
    expect(tiles[1].x).toBe(tiles[0].x + tiles[0].w);
    expect(tiles[2].x).toBe(tiles[1].x + tiles[1].w);
  });

  it("turns at the edge: down and back on the right, up and back on the left", () => {
    const line: LaidTile[] = [];
    for (let i = 0; i < 9; i++) line.push({ left: i % 2, right: (i + 1) % 2 });
    // A narrow box: the arms reach its edges after two tiles each way.
    const { tiles } = layoutLine(line, 4, 40, 440, 600);
    const lead = tiles[4];
    const corners = tiles.filter((t, i) => i !== 4 && t.vertical);
    expect(corners.length).toBeGreaterThanOrEqual(2);
    expect(tiles.slice(5).some((t) => t.y > lead.y + lead.h)).toBe(true);
    expect(tiles.slice(0, 4).some((t) => t.y + t.h < lead.y)).toBe(true);
  });

  it("shows where a candidate would go at each end", () => {
    const line: LaidTile[] = [{ left: 6, right: 2 }];
    const { ghosts } = layoutLine(line, 0, 40, 1000, 600, { left: [6, 0], right: [2, 2] });
    expect(ghosts.left).toMatchObject({ x: 380, w: 80, a: 0, b: 6 });
    expect(ghosts.right).toMatchObject({ x: 540, w: 40, vertical: true });
  });

  it("keeps every line a hand can reach inside the box, no two tiles on top of each other", () => {
    for (const state of lines()) {
      const { tiles, size } = fitLine(state.line, state.leadIndex, 940, 650, 52, 16);
      expect(size).toBeGreaterThanOrEqual(16);
      tiles.forEach((tile, i) => {
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.y).toBeGreaterThanOrEqual(0);
        expect(tile.x + tile.w).toBeLessThanOrEqual(940);
        expect(tile.y + tile.h).toBeLessThanOrEqual(650);
        expect(new Set([tile.a, tile.b])).toEqual(new Set([state.line[i].left, state.line[i].right]));
        for (const other of tiles.slice(i + 1)) expect(overlaps(tile, other)).toBe(false);
        // Neighbours in the line touch, and the halves that touch show the same number.
        if (i + 1 < tiles.length) {
          const pairs = halves(tile, size).flatMap((h) => halves(tiles[i + 1], size).filter((k) => touch(h, k)).map((k) => [h, k]));
          expect(pairs.length).toBeGreaterThan(0);
          for (const [h, k] of pairs) {
            expect(h.n).toBe(state.line[i].right);
            expect(k.n).toBe(state.line[i + 1].left);
          }
        }
      });
    }
  });
});

describe("dominoes in the Comms panel", () => {
  const t = (key: string, options?: Record<string, unknown>) => `${key.replace("dominoes.comms.", "")}${options ? JSON.stringify(options) : ""}`;

  it("folds a run of draws into one line and says what a hand was worth", () => {
    const feed: GameEvent[] = [
      { by: 1, kind: "play", tile: [3, 3], end: null },
      { by: 0, kind: "draw" },
      { by: 0, kind: "draw" },
      { by: 0, kind: "play", tile: [3, 5], end: "left" },
      { by: 1, kind: "pass" },
      { by: 0, kind: "play", tile: [5, 6], end: "left", hand: { hand: 1, winner: 0, fish: false, points: [0, 17], totals: [0, 17] } }
    ];
    const lines = dominoesLines(feed, 0, ["You", "Computer"], t as never);
    expect(lines.map((l) => l.text)).toEqual([
      'lead{"tile":"3:3"}',
      'drew{"count":2}',
      'left{"tile":"3:5"}',
      "pass",
      'left{"tile":"5:6"}',
      'handOut{"hand":1,"name":"You","payer":"Computer","points":17,"total":17}'
    ]);
    expect(lines[1].who).toBe("you");
    expect(lines[0].who).toBe("them");
    expect(lines[5].kind).toBe("system");
  });
});
