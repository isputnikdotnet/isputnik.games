import { describe, expect, it } from "vitest";
import { Dots } from "@isputnik/games-engine";
import { territoryOutlines } from "../src/games/dots/geometry";

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
