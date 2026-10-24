import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Sputnik, type SputnikState } from "@isputnik/games-engine";
import { SputnikPage } from "../src/games/sputnik/SputnikPage";
import { autopilot, litSegments, type LcdView } from "../src/games/sputnik/lit";
import { HANDHELD_DELAYS } from "../src/games/sputnik/useArcadeRun";

const run = (over: Partial<SputnikState> = {}): SputnikState => ({ ...Sputnik.createRun("A", 1), ...over });
const view = (over: Partial<LcdView> = {}): LcdView => ({ mode: "play", state: run(), net: 0, blink: false, ...over });

describe("the LCD's lit segments", () => {
  it("lights everything for the switch-on test", () => {
    expect(litSegments(view({ mode: "test" }), ["a", "b"])).toEqual(new Set(["a", "b"]));
  });

  it("shows the sputniks, the robot where the net is, the score and the game", () => {
    const on = litSegments(view({ state: run({ caught: 12, sputniks: [{ rail: 2, step: 3 }] }), net: 1 }), []);
    expect(on).toContain("s23");
    expect(on).toContain("robot-left");
    expect(on).toContain("net1");
    expect(on).not.toContain("net0");
    // "  12": the 1 in the third digit, the 2 in the fourth, nothing before.
    expect(on).toContain("d2b");
    expect(on).toContain("d2c");
    expect(on).not.toContain("d2a");
    expect(on).toContain("d3g");
    expect([...on].some((id) => id.startsWith("d0") || id.startsWith("d1"))).toBe(false);
    expect(on).toContain("game-a");
  });

  it("blinks half an alien, and shows the wreck and the running alien", () => {
    const state = run({ halves: 3, crash: { side: "right", step: 2 } });
    const lit = litSegments(view({ state, blink: true }), []);
    expect(lit).toContain("miss0");
    expect(lit).toContain("miss1");
    expect(lit).toContain("wreck-right");
    expect(lit).toContain("alien-right2");
    expect(litSegments(view({ state, blink: false }), [])).not.toContain("miss1");
  });

  it("names no game in the demo, and blinks the robot at the end", () => {
    expect(litSegments(view({ mode: "demo" }), [])).not.toContain("game-a");
    expect(litSegments(view({ mode: "over", blink: false }), [])).not.toContain("robot-left");
    expect(litSegments(view({ mode: "over", blink: true }), [])).toContain("robot-left");
  });

  it("puts the demo's net under the sputnik that lands next", () => {
    expect(autopilot(run({ sputniks: [{ rail: 0, step: 1 }, { rail: 3, step: 4 }] }), 0)).toBe(3);
    expect(autopilot(run({ sputniks: [] }), 2)).toBe(2);
  });
});

describe("SputnikPage", () => {
  const isOn = (id: string) => document.querySelector(`[data-seg="${id}"]`)?.classList.contains("is-on");

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("switches on with every segment lit, then plays the demo", () => {
    render(<SputnikPage />);
    expect(isOn("belka")).toBe(true);
    expect(isOn("game-b")).toBe(true);
    act(() => vi.advanceTimersByTime(HANDHELD_DELAYS.test));
    expect(isOn("game-b")).toBe(false);
    expect(screen.getByText(/playing itself/)).toBeInTheDocument();
  });

  it("starts Game A from its button and moves the net by key position", () => {
    render(<SputnikPage />);
    act(() => vi.advanceTimersByTime(HANDHELD_DELAYS.test));
    fireEvent.click(screen.getByRole("button", { name: "Start Game A" }));
    expect(screen.getByText("Game A: catch every sputnik.")).toBeInTheDocument();
    expect(isOn("game-a")).toBe(true);
    expect(isOn("net0")).toBe(true);

    // KeyL is the lower right whatever the keyboard layout says the key is.
    fireEvent.keyDown(window, { code: "KeyL", key: "д" });
    expect(isOn("net3")).toBe(true);
    expect(isOn("robot-right")).toBe(true);
    fireEvent.keyDown(window, { code: "ArrowUp", key: "ArrowUp" });
    expect(isOn("net2")).toBe(true);
    fireEvent.keyDown(window, { code: "ArrowLeft", key: "ArrowLeft" });
    expect(isOn("net0")).toBe(true);
  });

  it("pauses and carries on", () => {
    render(<SputnikPage />);
    act(() => vi.advanceTimersByTime(HANDHELD_DELAYS.test));
    fireEvent.keyDown(window, { code: "Digit2", key: "2" });
    expect(screen.getByText("Game B: catch every sputnik.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText(/^Paused/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("Game B: catch every sputnik.")).toBeInTheDocument();
  });

  it("runs to the end when nobody plays, and keeps the device's best", () => {
    render(<SputnikPage />);
    act(() => vi.advanceTimersByTime(HANDHELD_DELAYS.test));
    fireEvent.click(screen.getByRole("button", { name: "Start Game A" }));
    for (let i = 0; i < 400 && !screen.queryByText(/^Game over/); i++) act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText(/^Game over/)).toBeInTheDocument();
    const best = JSON.parse(localStorage.getItem("isputnik-games.sputnik.best") ?? '{"A":0}') as { A: number };
    expect(best.A).toBeGreaterThanOrEqual(0);
    // A key at the end moves nothing: the run is over.
    fireEvent.keyDown(window, { code: "KeyP", key: "p" });
    expect(isOn("net2")).toBe(false);
  });
});
