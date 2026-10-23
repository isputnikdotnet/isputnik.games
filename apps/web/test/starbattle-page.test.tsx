import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StarBattle } from "@isputnik/games-engine";
import { StarBattlePage } from "../src/games/starbattle/StarBattlePage";
import { loadStarBattleGame } from "../src/games/starbattle/storage";
import { COMPUTER_DELAYS } from "../src/games/starbattle/useStarBattleGame";

// The computer answers at once instead of pausing for a person to follow.
COMPUTER_DELAYS.place = 0;
COMPUTER_DELAYS.shot = 0;

// A square in jsdom: the SVG has no layout, so give it a box. The board is 11
// units wide (one for the labels), a square at (x, y) sits at unit (x+1, y+1).
function tapAt(board: HTMLElement, x: number, y: number) {
  board.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 110, height: 110, right: 110, bottom: 110, x: 0, y: 0, toJSON: () => ({})
  });
  fireEvent.pointerDown(board, { button: 0, clientX: (x + 1) * 10 + 5, clientY: (y + 1) * 10 + 5, pointerType: "mouse" });
}

/** Waits until the computer has had its turn(s) and it is the person's shot again. */
const myShotAgain = () => waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your shot — call a square"), { timeout: 4000 });

const setupUser = () => userEvent.setup();

async function startSmallGame(user: ReturnType<typeof userEvent.setup>) {
  render(<StarBattlePage />);
  const dialog = screen.getByRole("dialog", { name: "New game" });
  await user.click(within(dialog).getByRole("button", { name: "Small — 6 craft" }));
  await user.click(within(dialog).getByRole("button", { name: "Start game" }));
}

describe("StarBattlePage, against the computer", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/games/starbattle");
  });

  it("opens on the new-game dialog, which Cancel puts away and the menu brings back", async () => {
    const user = setupUser();
    render(<StarBattlePage />);
    const dialog = screen.getByRole("dialog", { name: "New game" });
    // No two-player mode: the choices are the fleet, who fires first, the level.
    expect(within(dialog).queryByRole("button", { name: /Two players/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Fires first" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Star Battle", level: 2 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New game" }));
    expect(screen.getByRole("dialog", { name: "New game" })).toBeInTheDocument();
  });

  it("deploys a fleet by hand, then the computer deploys and the battle begins", async () => {
    const user = setupUser();
    await startSmallGame(user);

    expect(screen.getByRole("heading", { name: "You, deploy your fleet" })).toBeInTheDocument();
    const ready = screen.getByRole("button", { name: "Ready" });
    expect(ready).toBeDisabled();
    expect(screen.getByText("6 craft to deploy")).toBeInTheDocument();

    // The three-module craft goes first, lying across from (0,0).
    const board = screen.getByRole("img", { name: "Your sector, 10 by 10" });
    tapAt(board, 0, 0);
    expect(screen.getByText("5 craft to deploy")).toBeInTheDocument();
    // A two-module craft touching it is refused; one clear of it goes down.
    tapAt(board, 3, 1);
    expect(screen.getByText("5 craft to deploy")).toBeInTheDocument();
    tapAt(board, 5, 0);
    expect(screen.getByText("4 craft to deploy")).toBeInTheDocument();
    // Tapping a deployed craft lifts it.
    tapAt(board, 6, 0);
    expect(screen.getByText("5 craft to deploy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Random" }));
    expect(screen.getByText("The fleet is deployed.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ready" }));
    // The computer deploys its own fleet, and the first shot is the person's.
    await myShotAgain();
    const saved = loadStarBattleGame();
    expect(saved?.state.placed).toEqual([true, true]);
    expect(saved?.moves.map((move) => move.kind)).toEqual(["place", "place"]);
  });

  it("fires: a hit keeps the turn, a miss hands it to the computer, and destroying the fleet ends it", async () => {
    const user = setupUser();
    await startSmallGame(user);
    await user.click(screen.getByRole("button", { name: "Random" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));
    await myShotAgain();

    const theirs = loadStarBattleGame()!.state.vessels[1]!;
    const enemy = () => screen.getByRole("img", { name: "Enemy sector, 10 by 10" });
    const occupied = new Set(theirs.flatMap((vessel) => StarBattle.vesselCells(vessel).map((c) => `${c.x},${c.y}`)));
    const water = (() => {
      for (let i = 0; i < 100; i++) if (!occupied.has(`${i % 10},${Math.floor(i / 10)}`)) return { x: i % 10, y: Math.floor(i / 10) };
      throw new Error("no empty square");
    })();
    const three = theirs.find((vessel) => vessel.length === 3)!;
    const module = StarBattle.vesselCells(three)[1];

    tapAt(enemy(), module.x, module.y);
    expect(screen.getByRole("status")).toHaveTextContent("Damaged! Fire again.");
    expect(screen.getByText(/You: .* — damaged/)).toBeInTheDocument();
    // The same square again does nothing.
    tapAt(enemy(), module.x, module.y);
    expect(screen.getByRole("status")).toHaveTextContent("Damaged! Fire again.");

    tapAt(enemy(), water.x, water.y);
    expect(screen.getByRole("status")).toHaveTextContent("The computer is aiming…");
    // The computer fires until it misses.
    await myShotAgain();
    expect(screen.getByRole("img", { name: "Your sector, 10 by 10" }).querySelectorAll(".star-vessel")).toHaveLength(6);

    // Destroy everything of the computer's in one run.
    const target = () => screen.getByRole("img", { name: "Enemy sector, 10 by 10" });
    for (const vessel of theirs) {
      for (const c of StarBattle.vesselCells(vessel)) {
        if (loadStarBattleGame()!.state.shots[0][c.y * 10 + c.x] === StarBattle.UNKNOWN) tapAt(target(), c.x, c.y);
      }
    }
    const dialog = screen.getByRole("dialog", { name: "Game over" });
    expect(dialog).toHaveTextContent("You win");
    expect(dialog).toHaveTextContent("You 6 : 0 Computer");
    expect(dialog).toHaveTextContent("Computer's fleet is destroyed.");
    expect(within(dialog).getByRole("button", { name: "New game" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Main menu" }));
    expect(window.location.pathname).toBe("/games/");
    expect(loadStarBattleGame()).toBeNull();
  });

  it("can be left before the first shot: Exit game asks, then abandons it and goes to the lobby", async () => {
    const user = setupUser();
    await startSmallGame(user);
    await user.click(screen.getByRole("button", { name: "Random" }));
    // Still deploying — nothing played yet.
    await user.click(screen.getByRole("button", { name: "Exit game" }));
    const confirm = screen.getByRole("dialog", { name: "Exit this game?" });
    await user.click(within(confirm).getByRole("button", { name: "Keep playing" }));
    expect(screen.getByRole("button", { name: "Ready" })).toBeInTheDocument();
    expect(loadStarBattleGame()).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Exit game" }));
    await user.click(within(screen.getByRole("dialog", { name: "Exit this game?" })).getByRole("button", { name: "Exit game" }));
    expect(window.location.pathname).toBe("/games/");
    expect(loadStarBattleGame()).toBeNull();
  });
});
