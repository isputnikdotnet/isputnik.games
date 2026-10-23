import { describe, expect, it } from "vitest";
import { matchHref, parseRoute } from "../src/router";

describe("routes", () => {
  it("parses the lobby, a game and a match", () => {
    expect(parseRoute("/games/")).toEqual({ name: "lobby" });
    expect(parseRoute("/games/dots")).toEqual({ name: "game", gameId: "dots" });
    expect(parseRoute("/games/starbattle/m/abc-123")).toEqual({ name: "match", gameId: "starbattle", matchId: "abc-123" });
    expect(parseRoute("/games/dots/x")).toEqual({ name: "notFound" });
    expect(matchHref("starbattle", "abc")).toBe("/games/starbattle/m/abc");
  });

  it("opens the address a renamed game had under its new id", () => {
    expect(parseRoute("/games/seabattle")).toEqual({ name: "game", gameId: "starbattle" });
    expect(parseRoute("/games/seabattle/m/abc")).toEqual({ name: "match", gameId: "starbattle", matchId: "abc" });
  });
});
