import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("shows one board at a time, the enemy sector on your shot, and switches on a tap", async () => {
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

  it("shows your own fleet while the other side fires, and counts what is intact", () => {
    // Seat 0 misses: the turn passes to seat 1, so seat 0 watches their own sector.
    let state = StarBattle.applyMove(battle(), { kind: "shoot", x: 9, y: 9 });
    // Seat 1 sinks seat 0's single at (0, 2).
    state = StarBattle.applyMove(state, { kind: "shoot", x: 0, y: 2 });
    render(<StarBattleBoards state={state} viewer={0} names={["You", "Computer"]} canFire={false} onFire={() => {}} />);
    expect(screen.getByRole("tab", { name: /Your fleet/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Your fleet/ })).toHaveTextContent("5 / 6");
    expect(screen.getByRole("img", { name: "Your sector, 10 by 10" })).toBeInTheDocument();
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
