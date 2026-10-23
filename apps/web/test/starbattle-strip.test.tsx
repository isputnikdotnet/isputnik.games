import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StarBattle, type Vessel } from "@isputnik/games-engine";
import { SectorPanel, StarBattleBoards } from "../src/games/starbattle/StarBattleBoards";
import { PHONE_ARENA } from "../src/shared/useMediaQuery";

const fleet = (row: number): Vessel[] => [
  { x: 0, y: row, length: 3, horizontal: true },
  { x: 4, y: row, length: 2, horizontal: true },
  { x: 7, y: row, length: 2, horizontal: true },
  { x: 0, y: row + 2, length: 1, horizontal: true },
  { x: 2, y: row + 2, length: 1, horizontal: true },
  { x: 4, y: row + 2, length: 1, horizontal: true }
];

function battle() {
  let state = StarBattle.createGame({ fleet: "small" });
  state = StarBattle.applyMove(state, { kind: "place", vessels: fleet(0) });
  state = StarBattle.applyMove(state, { kind: "place", vessels: fleet(5) });
  return state;
}

const realMatchMedia = window.matchMedia;
/** A phone: the arena's phone query holds, nothing else does. */
function phone() {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_ARENA,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia;
}

describe("the battle strip on a phone", () => {
  beforeEach(phone);
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("shows one board at a time, opens on the enemy sector, and switches on a tap", async () => {
    const user = userEvent.setup();
    const state = battle();
    render(<StarBattleBoards state={state} viewer={0} names={["You", "Computer"]} canFire onFire={() => {}} />);

    const strip = screen.getByRole("tablist", { name: "Which sector to show" });
    expect(strip).toHaveTextContent("Your fleet");
    expect(strip).toHaveTextContent("6 / 6");
    expect(screen.getByRole("tab", { name: /Enemy sector/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: "Enemy sector, 10 by 10" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Your sector, 10 by 10" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Your fleet/ }));
    expect(screen.getByRole("img", { name: "Your sector, 10 by 10" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Enemy sector, 10 by 10" })).not.toBeInTheDocument();
  });

  it("stays on the board you chose whoever's turn it is, and counts what is intact", async () => {
    const user = userEvent.setup();
    const props = { viewer: 0 as const, names: ["You", "Computer"] as [string, string], onFire: () => {} };
    const { rerender } = render(<StarBattleBoards state={battle()} canFire {...props} />);
    // Seat 0 misses: the turn passes to seat 1, which sinks seat 0's single at (0, 2).
    let state = StarBattle.applyMove(battle(), { kind: "shoot", x: 9, y: 9 });
    state = StarBattle.applyMove(state, { kind: "shoot", x: 0, y: 2 });
    rerender(<StarBattleBoards state={state} canFire={false} {...props} />);
    expect(screen.getByRole("tab", { name: /Enemy sector/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Your fleet/ })).toHaveTextContent("5 / 6");

    await user.click(screen.getByRole("tab", { name: /Your fleet/ }));
    // Seat 1 misses: back to seat 0's shot, and the board stays on their fleet.
    state = StarBattle.applyMove(state, { kind: "shoot", x: 9, y: 9 });
    rerender(<StarBattleBoards state={state} canFire {...props} />);
    expect(screen.getByRole("tab", { name: /Your fleet/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: "Your sector, 10 by 10" })).toBeInTheDocument();
  });
});

describe("a finger on the enemy sector", () => {
  const board = (onFire: (x: number, y: number) => void) => {
    render(<SectorPanel side="enemy" state={battle()} viewer={0} names={["You", "Computer"]} canFire onFire={onFire} />);
    const svg = screen.getByRole("img", { name: "Enemy sector, 10 by 10" });
    // jsdom lays nothing out: an 11-unit board 110px wide, B3 at (25, 35).
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 110, height: 110, right: 110, bottom: 110, x: 0, y: 0, toJSON: () => ({}) });
    return svg;
  };
  const finger = { pointerType: "touch", pointerId: 7, button: 0 };

  it("fires when a tap lifts, not when it lands", () => {
    const onFire = vi.fn();
    const svg = board(onFire);
    fireEvent.pointerDown(svg, { ...finger, clientX: 25, clientY: 35 });
    expect(onFire).not.toHaveBeenCalled();
    fireEvent.pointerUp(svg, { ...finger, clientX: 26, clientY: 35 });
    expect(onFire).toHaveBeenCalledWith(1, 2);
  });

  it("fires nothing when the finger swipes to the other board, or the browser takes the gesture", () => {
    const onFire = vi.fn();
    const svg = board(onFire);
    fireEvent.pointerDown(svg, { ...finger, clientX: 80, clientY: 35 });
    fireEvent.pointerMove(svg, { ...finger, clientX: 40, clientY: 37 });
    fireEvent.pointerUp(svg, { ...finger, clientX: 20, clientY: 37 });
    fireEvent.pointerDown(svg, { ...finger, clientX: 25, clientY: 35 });
    fireEvent.pointerCancel(svg, finger);
    fireEvent.pointerUp(svg, { ...finger, clientX: 25, clientY: 35 });
    expect(onFire).not.toHaveBeenCalled();
  });
});

describe("the sectors on the game stage", () => {
  it("draws the enemy sector and your own, each with its count", () => {
    const props = { state: battle(), viewer: 0 as const, names: ["You", "Computer"] as [string, string], canFire: true, onFire: () => {} };
    render(
      <>
        <SectorPanel side="enemy" {...props} />
        <SectorPanel side="own" compact {...props} />
      </>
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Enemy sector, 10 by 10" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Your sector, 10 by 10" })).toBeInTheDocument();
    expect(screen.getAllByText("6 / 6 craft intact")).toHaveLength(2);
  });
});
