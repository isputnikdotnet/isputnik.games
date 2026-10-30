import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CrossmathPage } from "../src/games/crossmath/CrossmathPage";
import { crossmathInProgress, loadCrossmath } from "../src/games/crossmath/storage";

beforeEach(() => localStorage.clear());

// Easy No. 1 is the proposal's sample: 2 + 3 + 5 = 10, 4 + 1 + 5 = 10, 6 + 4 + 10 = 20.
const square = (row: number, col: number) => screen.getByRole("button", { name: new RegExp(`^Row ${row}, column ${col},`) });
const bank = () => within(screen.getByRole("group", { name: "Tiles" }));
const tile = (value: number) => bank().getAllByRole("button", { name: `Tile ${value}` })[0];
const lay = (row: number, col: number, value: number) => {
  fireEvent.click(square(row, col));
  fireEvent.click(tile(value));
};

describe("Crossmath", () => {
  it("opens on the sample puzzle and is solved by laying every tile", () => {
    render(<CrossmathPage />);
    expect(screen.getByText("No. 1 of 60")).toBeInTheDocument();
    expect(square(1, 1)).toHaveAccessibleName("Row 1, column 1, given 2");
    lay(1, 2, 3);
    lay(1, 3, 5);
    lay(2, 1, 4);
    lay(2, 3, 5);
    lay(3, 1, 6);
    expect(crossmathInProgress()).toBe(true);
    lay(3, 2, 4);
    expect(screen.getByText("Solved", { selector: ".message-box strong" })).toBeInTheDocument();
    expect(screen.getByText("Every line holds, with no hints.")).toBeInTheDocument();
    expect(loadCrossmath().puzzles["easy-1"].solved).toBe(true);
    expect(crossmathInProgress()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Next puzzle" }));
    expect(screen.getByText("No. 2 of 60")).toBeInTheDocument();
  });

  it("tells empty squares from wrong lines, and hints a wrong tile first", () => {
    render(<CrossmathPage />);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("No mistakes so far")).toBeInTheDocument();
    expect(screen.getByText("6 squares are still empty.")).toBeInTheDocument();
    // A 4 where the 5 belongs makes column 3 come to 19.
    lay(1, 3, 4);
    lay(2, 3, 5);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("This line doesn't work out: column 3.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hint" }));
    expect(screen.getByText("The 4 in row 1, column 3 doesn't belong there. Tap it to send it back.")).toBeInTheDocument();
    fireEvent.click(square(1, 3));
    expect(square(1, 3)).toHaveAccessibleName("Row 1, column 3, empty");
    fireEvent.click(screen.getByRole("button", { name: "Hint" }));
    // The square just emptied is the one waiting for a tile, so the hint fills it.
    expect(screen.getByText("5 goes in row 1, column 3.")).toBeInTheDocument();
    expect(square(1, 3)).toHaveAccessibleName("Row 1, column 3, your tile 5, from a hint");
  });

  it("lays tiles from the keyboard and undoes", () => {
    render(<CrossmathPage />);
    const first = square(1, 2);
    first.focus();
    fireEvent.keyDown(first, { key: "6" });
    expect(square(1, 2)).toHaveAccessibleName("Row 1, column 2, your tile 6");
    fireEvent.keyDown(square(1, 2), { key: "ArrowRight" });
    expect(square(1, 3)).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(square(1, 2)).toHaveAccessibleName("Row 1, column 2, empty");
  });

  it("asks before starting over, and keeps the puzzle after a reload", () => {
    const view = render(<CrossmathPage />);
    lay(1, 2, 3);
    view.unmount();
    render(<CrossmathPage />);
    expect(square(1, 2)).toHaveAccessibleName("Row 1, column 2, your tile 3");
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    const dialog = screen.getByRole("dialog", { name: "Start Easy No. 1 over?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep playing" }));
    expect(square(1, 2)).toHaveAccessibleName("Row 1, column 2, your tile 3");
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(square(1, 2)).toHaveAccessibleName("Row 1, column 2, empty");
  });

  it("switches level and remembers where each one was", () => {
    render(<CrossmathPage />);
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));
    expect(screen.getByText("No. 1 of 50")).toBeInTheDocument();
    expect(bank().getAllByRole("button")).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: "Go to the next puzzle" }));
    fireEvent.click(screen.getByRole("button", { name: "Easy" }));
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));
    expect(screen.getByText("No. 2 of 50")).toBeInTheDocument();
  });
});
