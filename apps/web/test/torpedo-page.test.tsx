import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { replayRun, torpedo, type TorpedoInput } from "@isputnik/games-engine";
import { TorpedoPage } from "../src/games/torpedo/TorpedoPage";
import { soundsOf } from "../src/games/torpedo/sounds";
import { CARD_HOLD_MS, START_DELAY } from "../src/games/torpedo/useTorpedoRun";
import { SessionContext } from "../src/session";

vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  reportArcadeScore: vi.fn()
}));
import * as api from "../src/api";

const member = { status: "ready" as const, user: { id: "kid", name: "Kid", role: "member" as const, lang: "en", theme: "minimalist" }, guests: true, version: "test", stage: null };

describe("the periscope's sounds", () => {
  it("sounds the launch, the lanes passed, a hit, the bonus and the end", () => {
    expect(soundsOf([{ kind: "launch" }], "play")).toEqual(["torpedoLaunch"]);
    expect(soundsOf([{ kind: "pass", lane: "near" }], "play")).toEqual(["torpedoPing"]);
    expect(soundsOf([{ kind: "hit" }, { kind: "bonus" }], "play")).toEqual(["torpedoHit", "torpedoBonus"]);
    expect(soundsOf([{ kind: "miss" }, { kind: "roundOver" }, { kind: "over" }], "play")).toEqual(["torpedoMiss", "torpedoOver"]);
  });

  it("keeps the demo silent", () => {
    expect(soundsOf([{ kind: "hit" }], "demo")).toEqual([]);
  });
});

describe("TorpedoPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const press = (code: string) => {
    fireEvent.keyDown(window, { code, key: code });
    fireEvent.keyUp(window, { code, key: code });
  };

  it("watches by itself, then starts on fire and shows the ships and their points", () => {
    render(<TorpedoPage />);
    expect(screen.getByText(/on watch by itself/)).toBeInTheDocument();
    for (const ship of ["Tanker", "Cargo ship", "Destroyer", "Patrol boat"]) expect(screen.getByText(ship)).toBeInTheDocument();
    press("Space");
    act(() => vi.advanceTimersByTime(START_DELAY + 100));
    expect(screen.getByText("Ten torpedoes: lead the ships and fire.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "10 torpedoes left" })).toBeInTheDocument();
    press("Space");
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("img", { name: "9 torpedoes left" })).toBeInTheDocument();
  });

  it("pauses and carries on", () => {
    render(<TorpedoPage />);
    press("Space");
    act(() => vi.advanceTimersByTime(START_DELAY + 100));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText(/^Paused/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));
    expect(screen.getByText("Ten torpedoes: lead the ships and fire.")).toBeInTheDocument();
  });

  it("plays a round to its card and sends a member's run to be replayed", async () => {
    vi.mocked(api.reportArcadeScore).mockResolvedValue({ recorded: true, score: 0, best: 2100 });
    render(<SessionContext.Provider value={member}><TorpedoPage /></SessionContext.Provider>);
    press("Space");
    act(() => vi.advanceTimersByTime(START_DELAY + 100));
    // Ten shots, turning now and then, a torpedo's run apart.
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(window, { code: i % 2 ? "ArrowLeft" : "KeyD" });
      act(() => vi.advanceTimersByTime(300));
      fireEvent.keyUp(window, { code: i % 2 ? "ArrowLeft" : "KeyD" });
      press("Space");
      act(() => vi.advanceTimersByTime(2100));
    }
    for (let i = 0; i < 100 && !screen.queryByText(/^Run over/); i++) act(() => vi.advanceTimersByTime(500));
    await act(async () => undefined);
    expect(screen.getByRole("region", { name: /Round over|Bonus round over/ })).toBeInTheDocument();

    expect(api.reportArcadeScore).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(api.reportArcadeScore).mock.calls[0][0];
    expect(sent).toMatchObject({ game: "torpedo", variant: "standard" });
    const score = replayRun(torpedo, "standard", sent.seed, sent.log as [number, TorpedoInput][], 1_000_000).score;
    expect(screen.getByRole("region", { name: /over/ })).toHaveTextContent(score.toLocaleString("ru-RU"));
    expect(screen.getByText("On the family board. Your best: 2 100.")).toBeInTheDocument();

    // Fire still pressed at the end waits for the card to be read.
    press("Space");
    expect(screen.getByText(/^Run over/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(CARD_HOLD_MS));
    press("Space");
    expect(screen.queryByText(/^Run over/)).toBeNull();
  });
});
