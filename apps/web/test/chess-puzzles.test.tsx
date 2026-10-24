import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PuzzleOffer } from "../src/api";
import { ChessPuzzlePage, PUZZLE_DELAY } from "../src/games/chess/PuzzlePage";
import { ChessNewGameForm } from "../src/games/chess/NewGameForm";
import { parseRoute } from "../src/router";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchNextPuzzle: vi.fn(), reportPuzzleResult: vi.fn() };
});
import * as api from "../src/api";

// Scholar's mate: Black's …Nf6?? and White mates on f7.
const offer: PuzzleOffer = {
  puzzle: {
    id: "t1",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
    moves: ["g8f6", "h5f7"],
    rating: 700,
    mateIn: 1,
    types: ["mateIn1"],
    level: "veryEasy"
  },
  repeat: false,
  me: { rating: 800, played: 0, solved: 0, streak: 0 }
};

const square = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}(,|$)`) });

describe("chess puzzles", () => {
  const delay = PUZZLE_DELAY.ms;
  beforeEach(() => {
    PUZZLE_DELAY.ms = 0;
    localStorage.clear();
    vi.mocked(api.fetchNextPuzzle).mockReset().mockResolvedValue(offer);
    vi.mocked(api.reportPuzzleResult).mockReset().mockImplementation(async (_id, result) => {
      const after = result.solved && result.hints === 0 ? 812 : 788;
      return { recorded: true, before: 800, after, me: { rating: after, played: 1, solved: result.solved ? 1 : 0, streak: result.solved ? 1 : 0 } };
    });
  });
  afterEach(() => {
    PUZZLE_DELAY.ms = delay;
  });

  it("has its own address", () => {
    expect(parseRoute("/games/chess/puzzles")).toEqual({ name: "puzzles" });
  });

  it("plays the other side's move, then takes the mate and moves the rating", async () => {
    const user = userEvent.setup();
    render(<ChessPuzzlePage />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Find the best move for White"));
    expect(api.fetchNextPuzzle).toHaveBeenCalledWith("auto", "any");
    expect(screen.getByText("Checkmate in 1 move")).toBeInTheDocument();
    expect(screen.getByText("Very easy · puzzle rated 700")).toBeInTheDocument();
    // …Nf6 was played: the knight is on f6.
    expect(square("f6")).toHaveAccessibleName(/knight/i);
    // …and the position opens unmarked: the setup move is not the solver's clue.
    expect(square("g8")).not.toHaveClass("is-last");
    expect(square("f6")).not.toHaveClass("is-last");

    await user.click(square("h5"));
    await user.click(square("f7"));
    expect(screen.getByRole("status")).toHaveTextContent("Solved!");
    // The solver's own move is marked as usual.
    expect(square("h5")).toHaveClass("is-last");
    expect(square("f7")).toHaveClass("is-last");
    expect(api.reportPuzzleResult).toHaveBeenCalledWith("t1", { solved: true, hints: 0 });
    await waitFor(() => expect(screen.getByText("+12")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Next puzzle" })).toBeInTheDocument();
  });

  it("takes a wrong move back, counts the miss once, and hints in two steps", async () => {
    const user = userEvent.setup();
    render(<ChessPuzzlePage />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Find the best move"));

    // Bxf7+ is check, not mate.
    await user.click(square("c4"));
    await user.click(square("f7"));
    await waitFor(() => expect(screen.getByText(/Not that move/)).toBeInTheDocument());
    expect(api.reportPuzzleResult).toHaveBeenCalledWith("t1", { solved: false, hints: 0 });
    // The bishop is back.
    await waitFor(() => expect(square("c4")).toHaveAccessibleName(/bishop/i));

    await user.click(screen.getByRole("button", { name: "Hint" }));
    expect(square("h5")).toHaveClass("is-hint");
    expect(square("f7")).not.toHaveClass("is-hint");
    await user.click(screen.getByRole("button", { name: "Show the move" }));
    expect(square("f7")).toHaveClass("is-hint");

    await user.click(square("h5"));
    await user.click(square("f7"));
    expect(screen.getByRole("status")).toHaveTextContent("Solved — after a miss");
    // Reported once: the miss.
    expect(api.reportPuzzleResult).toHaveBeenCalledTimes(1);
  });

  it("asks for the kind and level chosen in Settings once it closes", async () => {
    const user = userEvent.setup();
    render(<ChessPuzzlePage />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Find the best move"));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Forks" }));
    await user.click(screen.getByRole("button", { name: "Hard" }));
    expect(api.fetchNextPuzzle).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(api.fetchNextPuzzle).toHaveBeenLastCalledWith("hard", "fork"));
    expect(localStorage.getItem("isputnik-games.chess.puzzleLevel")).toBe("hard");
    expect(localStorage.getItem("isputnik-games.chess.puzzleType")).toBe("fork");
  });

  it("starts from Play: puzzles of a kind and level", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<ChessNewGameForm onStart={onStart} />);
    await user.click(screen.getByRole("button", { name: "Puzzles" }));
    await user.click(screen.getByRole("button", { name: "Mate in 2" }));
    await user.click(screen.getByRole("button", { name: "Medium" }));
    await user.click(screen.getByRole("button", { name: "Start puzzles" }));
    expect(onStart).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/games/chess/puzzles");
    expect(localStorage.getItem("isputnik-games.chess.puzzleType")).toBe("mateIn2");
    expect(localStorage.getItem("isputnik-games.chess.puzzleLevel")).toBe("medium");
  });
});
