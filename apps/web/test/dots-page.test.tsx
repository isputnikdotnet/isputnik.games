import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DotsPage } from "../src/games/dots/DotsPage";
import { loadDotsGame } from "../src/games/dots/storage";

// A board point in jsdom: the SVG has no layout, so give it a box and aim at a
// point's centre in board units.
function placeAt(board: HTMLElement, size: number, x: number, y: number) {
  board.getBoundingClientRect = () => ({
    left: 0, top: 0, width: size * 10, height: size * 10, right: size * 10, bottom: size * 10, x: 0, y: 0, toJSON: () => ({})
  });
  fireEvent.pointerDown(board, { button: 0, clientX: x * 10 + 5, clientY: y * 10 + 5, pointerType: "mouse" });
}

describe("DotsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/games/dots");
  });

  it("starts a two-player game from the form and keeps it across a reload", async () => {
    const user = userEvent.setup();
    render(<DotsPage />);
    expect(screen.getByRole("heading", { name: "New game" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "10 × 10" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));

    const board = screen.getByRole("img", { name: "Dots board, 10 by 10" });
    expect(screen.getByRole("status")).toHaveTextContent("Blue to move");

    placeAt(board, 10, 3, 3);
    expect(screen.getByRole("status")).toHaveTextContent("Red to move");
    // The same point again is refused; the turn stays.
    placeAt(board, 10, 3, 3);
    expect(screen.getByRole("status")).toHaveTextContent("Red to move");

    const saved = loadDotsGame();
    expect(saved?.setup.mode).toBe("local");
    expect(saved?.state.moves).toEqual([{ x: 3, y: 3 }]);
  });

  it("captures show in the score and undo takes the move back", async () => {
    const user = userEvent.setup();
    render(<DotsPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "10 × 10" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    const board = screen.getByRole("img", { name: "Dots board, 10 by 10" });

    // Blue rings red's (2,2) with a diamond; red plays far away in between.
    const sequence = [[2, 1], [2, 2], [1, 2], [8, 8], [3, 2], [8, 7], [2, 3]];
    for (const [x, y] of sequence) placeAt(board, 10, x, y);

    const score = screen.getByLabelText("Captures");
    expect(within(score).getByText("Blue").parentElement).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(score).getByText("Blue").parentElement).toHaveTextContent("0");
    expect(screen.getByRole("status")).toHaveTextContent("Blue to move");
  });

  it("ending the game asks first, then counts the captures", async () => {
    const user = userEvent.setup();
    render(<DotsPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "10 × 10" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    const board = screen.getByRole("img", { name: "Dots board, 10 by 10" });
    placeAt(board, 10, 4, 4);

    await user.click(screen.getByRole("button", { name: "End game" }));
    const dialog = screen.getByRole("dialog", { name: "End this game?" });
    await user.click(within(dialog).getByRole("button", { name: "End game" }));

    // The result is announced in a dialog over the final board.
    const result = screen.getByRole("dialog", { name: "Game over" });
    expect(result).toHaveTextContent("A draw");
    expect(result).toHaveTextContent("Blue 0 : 0 Red");
    expect(result).toHaveTextContent("Ended by agreement.");
    expect(screen.getByRole("status")).toHaveTextContent("A draw");

    // Put aside, the board stays for review and the panel keeps the result.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Game over" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();

    // Play again starts a fresh game with the same settings.
    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.getByRole("status")).toHaveTextContent("Blue to move");
    expect(loadDotsGame()?.state.moves).toEqual([]);
  });

  it("the result dialog goes back to the games; the panel's Change settings to the form", async () => {
    const user = userEvent.setup();
    render(<DotsPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "10 × 10" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    placeAt(screen.getByRole("img", { name: "Dots board, 10 by 10" }), 10, 4, 4);
    await user.click(screen.getByRole("button", { name: "End game" }));
    await user.click(within(screen.getByRole("dialog", { name: "End this game?" })).getByRole("button", { name: "End game" }));

    expect(within(screen.getByRole("dialog", { name: "Game over" })).getByRole("button", { name: "Back to games" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Change settings" }));
    expect(screen.getByRole("heading", { name: "New game" })).toBeInTheDocument();
    expect(loadDotsGame()).toBeNull();
  });

  it("exits to the lobby after asking, and leaves no game behind", async () => {
    const user = userEvent.setup();
    render(<DotsPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "10 × 10" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    placeAt(screen.getByRole("img", { name: "Dots board, 10 by 10" }), 10, 4, 4);

    await user.click(screen.getByRole("button", { name: "Exit game" }));
    const dialog = screen.getByRole("dialog", { name: "Leave this game?" });
    await user.click(within(dialog).getByRole("button", { name: "Exit game" }));
    expect(window.location.pathname).toBe("/games/");
    expect(loadDotsGame()).toBeNull();
  });
});
