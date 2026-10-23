import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GameEvent } from "@isputnik/games-engine";
import { cuesBetween, type SoundState } from "../src/shared/useGameSounds";
import { setSoundEnabled, soundEnabled } from "../src/shared/sound";
import { Shell } from "../src/shared/Shell";

const dot = (by: 0 | 1, extra: Partial<GameEvent> = {}): GameEvent => ({ by, kind: "dot", x: 0, y: 0, captured: 0, lost: false, ...extra });
const shot = (by: 0 | 1, result: string): GameEvent => ({ by, kind: "fire", x: 0, y: 0, result });

const dots = (feed: GameEvent[], extra: Partial<SoundState> = {}): SoundState => ({
  game: "dots", feed, me: 0, status: "playing", turn: (feed.length % 2) as 0 | 1, winner: null, ...extra
});

describe("cuesBetween", () => {
  it("is silent on the first look at a game, however far along", () => {
    expect(cuesBetween(null, dots([dot(0), dot(1), dot(0)]))).toEqual([]);
  });

  it("ticks a dot, higher for yours, and adds what it did", () => {
    expect(cuesBetween(dots([]), dots([dot(0)]))).toEqual(["dot"]);
    expect(cuesBetween(dots([dot(0)]), dots([dot(0), dot(1, { captured: 2 })]))).toEqual(["dotTheirs", "captured"]);
    expect(cuesBetween(dots([]), dots([dot(0, { lost: true })]))).toEqual(["dot", "lost"]);
  });

  it("cheers every capture when both seats play at one screen", () => {
    expect(cuesBetween(dots([dot(0)], { me: null }), dots([dot(0), dot(1, { captured: 1 })], { me: null }))).toEqual(["dotTheirs", "capture"]);
  });

  it("fires, then says what the shot did", () => {
    const before: SoundState = { game: "starbattle", feed: [], me: 0, status: "playing", turn: 0, winner: null };
    expect(cuesBetween(before, { ...before, feed: [shot(0, "destroyed")] })).toEqual(["fire", "destroyed"]);
  });

  it("sounds only the last few of a batch", () => {
    const before: SoundState = { game: "starbattle", feed: [], me: 0, status: "playing", turn: 1, winner: null };
    const batch = [shot(1, "hit"), shot(1, "hit"), shot(1, "hit"), shot(1, "miss")];
    expect(cuesBetween(before, { ...before, feed: batch })).toHaveLength(6);
  });

  it("ends on a win, a loss or a draw from this seat", () => {
    const last = dots([dot(0)]);
    expect(cuesBetween(last, { ...dots([dot(0), dot(1)]), status: "finished", winner: 0 }).at(-1)).toBe("win");
    expect(cuesBetween(last, { ...dots([dot(0), dot(1)]), status: "finished", winner: 1 }).at(-1)).toBe("lose");
    expect(cuesBetween(last, { ...dots([dot(0), dot(1)]), status: "finished", winner: null }).at(-1)).toBe("draw");
  });

  it("chimes online when the move comes back, not in a local game", () => {
    const theirs = dots([dot(0)], { online: true, turn: 1 });
    expect(cuesBetween(theirs, dots([dot(0), dot(1)], { online: true, turn: 0 }))).toEqual(["dotTheirs", "yourMove"]);
    expect(cuesBetween(dots([dot(0)], { turn: 1 }), dots([dot(0), dot(1)], { turn: 0 }))).toEqual(["dotTheirs"]);
  });

  it("blips for the other player's message, not your own", () => {
    const quiet = dots([], { online: true, turn: 1, messages: [] });
    expect(cuesBetween(quiet, { ...quiet, messages: [{ id: 1, by: 1 }] })).toEqual(["message"]);
    expect(cuesBetween(quiet, { ...quiet, messages: [{ id: 1, by: 0 }] })).toEqual([]);
  });
});

describe("the sound switch", () => {
  it("sits in the top bar and is remembered on this device", async () => {
    setSoundEnabled(true);
    render(<Shell>page</Shell>);
    await userEvent.click(screen.getByRole("button", { name: "Turn sounds off" }));
    expect(soundEnabled()).toBe(false);
    expect(localStorage.getItem("isputnik-games-sound")).toBe("off");
    await userEvent.click(screen.getByRole("button", { name: "Turn sounds on" }));
    expect(soundEnabled()).toBe(true);
    expect(localStorage.getItem("isputnik-games-sound")).toBeNull();
  });
});
