import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Checkers } from "@isputnik/games-engine";
import { CheckersPage } from "../src/games/checkers/CheckersPage";
import { CheckersBoard } from "../src/games/checkers/CheckersBoard";
import { loadCheckersGame, saveGame } from "../src/games/checkers/storage";
vi.mock("../src/api", async (original) => ({
  ...(await original<typeof import("../src/api")>()),
  reportComputerResult: vi.fn().mockResolvedValue({ recorded: true })
}));
beforeEach(() => localStorage.clear());
describe("Checkers", () => {
  it("starts a local game with the chess setup controls, plays, saves, reloads and undoes", () => {
    const view = render(<CheckersPage />);
    fireEvent.click(screen.getByRole("button", { name: "Two players, one screen" }));
    fireEvent.click(screen.getByRole("button", { name: "Start game" }));
    fireEvent.click(screen.getByRole("button", { name: "a3, White man" }));
    fireEvent.click(screen.getByRole("button", { name: "b4, Empty, Legal destination" }));
    expect(loadCheckersGame()?.state.moves).toEqual([{ path: [40, 33] }]);
    expect(screen.getByText("Black to move")).toBeInTheDocument();
    view.unmount();
    render(<CheckersPage />);
    expect(screen.getByText("Black to move")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "a3, White man" })).toBeInTheDocument();
    expect(loadCheckersGame()?.state.moves).toHaveLength(0);
  });
  it("shows the chess board styles in settings", () => {
    saveGame({
      setup: { mode: "local", computerPlays: 1, level: "normal" },
      key: "test-key",
      state: Checkers.createGame()
    });
    render(<CheckersPage />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Walnut/ })).toBeInTheDocument();
  });
  it("requires tapping the entire capture path before submitting a move", () => {
    const state = Checkers.createGame();
    state.board.fill(null);
    state.board[40] = { player: 0, king: false }; // a3
    state.board[33] = { player: 1, king: false }; // b4
    state.board[19] = { player: 1, king: false }; // d6
    const onMove = vi.fn();
    render(<CheckersBoard state={state} movable={0} onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: "a3, White man" }));
    fireEvent.click(screen.getByRole("button", { name: "c5, Empty, Legal destination" }));
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText("Continue the capture with the same piece.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "e7, Empty, Legal destination" }));
    expect(onMove).toHaveBeenCalledWith({ path: [40, 26, 12] });
  });
  it("replies as the computer and undo returns to the human's turn", () => {
    vi.useFakeTimers();
    try {
      const state = Checkers.applyMove(Checkers.createGame(), {
        path: [40, 33]
      });
      saveGame({
        setup: { mode: "computer", computerPlays: 1, level: "easy" },
        key: "computer-key",
        state
      });
      render(<CheckersPage />);
      act(() => vi.advanceTimersByTime(350));
      expect(loadCheckersGame()?.state.moves).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(loadCheckersGame()?.state.moves).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("ignores corrupt saved moves instead of trusting a saved board", () => {
    localStorage.setItem(
      "isputnik-games.checkers.local",
      JSON.stringify({
        setup: { mode: "local", computerPlays: 1, level: "easy" },
        moves: [{ path: [40, 12] }]
      })
    );
    expect(loadCheckersGame()).toBeNull();
  });
});
