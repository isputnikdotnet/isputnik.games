import { describe, expect, it } from "vitest";
import { Dots } from "@isputnik/games-engine";
import { chainLinks, territoryOutlines } from "../src/games/dots/geometry";

describe("chainLinks", () => {
  it("links neighbouring live dots of one colour once, across sides and corners", () => {
    const state = Dots.fromDiagram([
      "bb........",
      ".b........",
      "r.........",
      ".r........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      ".........."
    ]);
    const links = chainLinks(state);
    const blue = links.filter((l) => l.owner === 0);
    const red = links.filter((l) => l.owner === 1);
    // (0,0)-(1,0), (1,0)-(1,1), (0,0)-(1,1): three links, each once.
    expect(blue).toHaveLength(3);
    expect(red).toHaveLength(1);
    expect(red[0]).toEqual({ owner: 1, x1: 0.5, y1: 2.5, x2: 1.5, y2: 3.5 });
  });

  it("leaves captured dots out of chains", () => {
    const state = Dots.fromDiagram([
      "..........",
      "..b.......",
      ".brb......",
      "..b.......",
      "..........",
      "..........",
      "..........",
      "..........",
      "........r.",
      ".........r"
    ]);
    expect(state.captures).toEqual([1, 0]);
    const links = chainLinks(state);
    expect(links.filter((l) => l.owner === 1)).toHaveLength(1); // only the far pair
    expect(links.filter((l) => l.owner === 0)).toHaveLength(4); // the diamond's four diagonals
  });
});

describe("territoryOutlines", () => {
  it("traces the diamond around a captured dot", () => {
    const state = Dots.fromDiagram([
      "..........",
      "..b.......",
      ".brb......",
      "..b.......",
      "..........",
      "..........",
      "..........",
      "..........",
      "........r.",
      ".........r"
    ]);
    const outlines = territoryOutlines(state);
    expect(outlines).toHaveLength(1);
    expect(outlines[0].owner).toBe(0);
    expect(outlines[0].points).toBe("2.5,1.5 3.5,2.5 2.5,3.5 1.5,2.5");
  });

  it("follows the outer edge of a longer ring with two dots inside", () => {
    const state = Dots.fromDiagram([
      "..........",
      "..........",
      "...bb.....",
      "..brrb....",
      "...bb.....",
      "..........",
      "..........",
      ".......r..",
      "........r.",
      "......r..."
    ]);
    expect(state.captures).toEqual([2, 0]);
    const [outline] = territoryOutlines(state);
    expect(outline.points.split(" ")).toHaveLength(6);
    expect(outline.points.startsWith("3.5,2.5 4.5,2.5 5.5,3.5")).toBe(true);
  });

  it("outlines nothing while no area is captured", () => {
    const state = Dots.fromDiagram([
      "..b.......",
      ".b.b......",
      "..b.......",
      "..........",
      "..........",
      "..........",
      "..........",
      "......r...",
      ".......r..",
      "........r."
    ]);
    expect(territoryOutlines(state)).toEqual([]);
  });
});
