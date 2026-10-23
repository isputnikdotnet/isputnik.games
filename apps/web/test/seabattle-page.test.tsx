import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeaBattle } from "@isputnik/games-engine";
import { SeaBattlePage } from "../src/games/seabattle/SeaBattlePage";
import { loadSeaBattleGame } from "../src/games/seabattle/storage";

// A square in jsdom: the SVG has no layout, so give it a box. The board is 11
// units wide (one for the labels), a square at (x, y) sits at unit (x+1, y+1).
function tapAt(board: HTMLElement, x: number, y: number) {
  board.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 110, height: 110, right: 110, bottom: 110, x: 0, y: 0, toJSON: () => ({})
  });
  fireEvent.pointerDown(board, { button: 0, clientX: (x + 1) * 10 + 5, clientY: (y + 1) * 10 + 5, pointerType: "mouse" });
}

async function startTwoPlayer(user: ReturnType<typeof userEvent.setup>) {
  render(<SeaBattlePage />);
  await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
  await user.click(screen.getByRole("button", { name: "Small — 6 ships" }));
  await user.click(screen.getByRole("button", { name: "Start game" }));
}

describe("SeaBattlePage, two players on one screen", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/games/seabattle");
  });

  it("lays a fleet by hand: ships go down, lift again, and Ready waits for the whole fleet", async () => {
    const user = userEvent.setup();
    await startTwoPlayer(user);

    // The curtain first: only Player 1 should see the next screen.
    await user.click(screen.getByRole("button", { name: "I'm Player 1" }));
    expect(screen.getByRole("heading", { name: "Player 1, lay your fleet" })).toBeInTheDocument();
    const ready = screen.getByRole("button", { name: "Ready" });
    expect(ready).toBeDisabled();
    expect(screen.getByText("6 ships to lay")).toBeInTheDocument();

    // The three-decker is picked first; lying across from (0,0).
    const board = screen.getByRole("img", { name: "Your sea, 10 by 10" });
    tapAt(board, 0, 0);
    expect(screen.getByText("5 ships to lay")).toBeInTheDocument();
    // A two-decker touching it is refused; one clear of it goes down.
    tapAt(board, 3, 1);
    expect(screen.getByText("5 ships to lay")).toBeInTheDocument();
    tapAt(board, 5, 0);
    expect(screen.getByText("4 ships to lay")).toBeInTheDocument();
    // Tapping a laid ship lifts it.
    tapAt(board, 6, 0);
    expect(screen.getByText("5 ships to lay")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Random" }));
    expect(screen.getByText("The fleet is laid.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ready" }));

    // Player 2's turn to lay, behind the curtain.
    expect(screen.getByRole("heading", { name: "Pass the device to Player 2" })).toBeInTheDocument();
    const saved = loadSeaBattleGame();
    expect(saved?.state.placed).toEqual([true, false]);
    expect(saved?.moves[0].kind).toBe("place");
  });

  it("fires: a miss passes the device, a hit keeps the turn, and the game ends when a fleet is sunk", async () => {
    const user = userEvent.setup();
    await startTwoPlayer(user);
    await user.click(screen.getByRole("button", { name: "I'm Player 1" }));
    await user.click(screen.getByRole("button", { name: "Random" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));
    await user.click(screen.getByRole("button", { name: "I'm Player 2" }));
    await user.click(screen.getByRole("button", { name: "Random" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));

    // Both fleets laid; Player 1 fires first.
    await user.click(screen.getByRole("button", { name: "I'm Player 1" }));
    expect(screen.getByRole("status")).toHaveTextContent("Player 1, fire!");
    const fleetOf2 = loadSeaBattleGame()!.state.ships[1]!;
    const enemy = () => screen.getByRole("img", { name: "Enemy sea, 10 by 10" });

    // Find water and a deck of the three-decker on Player 2's sea.
    const occupied = new Set(fleetOf2.flatMap((ship) => SeaBattle.shipCells(ship).map((c) => `${c.x},${c.y}`)));
    const water = (() => {
      for (let i = 0; i < 100; i++) if (!occupied.has(`${i % 10},${Math.floor(i / 10)}`)) return { x: i % 10, y: Math.floor(i / 10) };
      throw new Error("no water");
    })();
    const three = fleetOf2.find((ship) => ship.length === 3)!;
    const deck = SeaBattle.shipCells(three)[1];

    tapAt(enemy(), deck.x, deck.y);
    expect(screen.getByRole("status")).toHaveTextContent("Hit! Fire again.");
    expect(screen.getByText(/Player 1: .* — hit/)).toBeInTheDocument();
    // The same square again does nothing.
    tapAt(enemy(), deck.x, deck.y);
    expect(screen.getByRole("status")).toHaveTextContent("Hit! Fire again.");

    tapAt(enemy(), water.x, water.y);
    // A miss: the device goes to Player 2, who sees the result before the boards.
    expect(screen.getByRole("heading", { name: "Pass the device to Player 2" })).toBeInTheDocument();
    expect(screen.getByText(/Player 1: .* — miss/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I'm Player 2" }));
    expect(screen.getByRole("status")).toHaveTextContent("Player 2, fire!");
    // Player 2 sees their own fleet with the hit on it, and nothing of Player 1's ships.
    const own = screen.getByRole("img", { name: "Your sea, 10 by 10" });
    expect(own.querySelectorAll(".sea-ship")).toHaveLength(6);
    expect(own.querySelectorAll(".sea-hit")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Enemy sea, 10 by 10" }).querySelectorAll(".sea-ship")).toHaveLength(0);

    // Player 2 sinks everything of Player 1 in one run.
    const fleetOf1 = loadSeaBattleGame()!.state.ships[0]!;
    const target = () => screen.getByRole("img", { name: "Enemy sea, 10 by 10" });
    for (const ship of fleetOf1) for (const c of SeaBattle.shipCells(ship)) tapAt(target(), c.x, c.y);
    const dialog = screen.getByRole("dialog", { name: "Game over" });
    expect(dialog).toHaveTextContent("Player 2 wins");
    expect(dialog).toHaveTextContent("Player 1 0 : 6 Player 2");
    expect(dialog).toHaveTextContent("Player 1's fleet is sunk.");
    await user.click(within(dialog).getByRole("button", { name: "Play again" }));
    expect(screen.getByRole("heading", { name: "Pass the device to Player 1" })).toBeInTheDocument();
  });

  it("ending the game asks first and counts the ships sunk", async () => {
    const user = userEvent.setup();
    await startTwoPlayer(user);
    await user.click(screen.getByRole("button", { name: "I'm Player 1" }));
    // No ending while a fleet is still to be laid.
    expect(screen.queryByRole("button", { name: "End game" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Random" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));
    await user.click(screen.getByRole("button", { name: "I'm Player 2" }));
    await user.click(screen.getByRole("button", { name: "Random" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));
    await user.click(screen.getByRole("button", { name: "I'm Player 1" }));

    await user.click(screen.getByRole("button", { name: "End game" }));
    const confirm = screen.getByRole("dialog", { name: "End this game?" });
    await user.click(within(confirm).getByRole("button", { name: "End game" }));
    const result = screen.getByRole("dialog", { name: "Game over" });
    expect(result).toHaveTextContent("A draw");
    expect(result).toHaveTextContent("Ended by agreement.");
  });
});
