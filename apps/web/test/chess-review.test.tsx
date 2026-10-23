import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReviewItem, ReviewRecord } from "../src/api";
import { ChessReviewPage } from "../src/games/chess/ReviewPage";
import { MyChessGamesPage } from "../src/games/chess/MyGamesPage";
import { ChessPage } from "../src/games/chess/ChessPage";
import { parseRoute } from "../src/router";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchGameRecord: vi.fn(), fetchMyGames: vi.fn(), fetchMatch: vi.fn(), saveGameRecord: vi.fn(), reportComputerResult: vi.fn() };
});
import * as api from "../src/api";

const mv = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
const fools: ReviewRecord = {
  source: "record", id: "rec1", game: "chess", mode: "computer", level: "hard", seat: 0, opponent: null,
  winner: 1, reason: "checkmate", moveCount: 4, finishedAt: "2026-10-20T18:00:00.000Z",
  moves: ["f2f3", "e7e5", "g2g4", "d8h4"].map(mv)
};

const square = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}(,|$)`) });

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.fetchGameRecord).mockReset().mockResolvedValue(fools);
  vi.mocked(api.saveGameRecord).mockReset().mockResolvedValue({ recorded: true, id: "rec9" });
  vi.mocked(api.reportComputerResult).mockReset().mockResolvedValue({ recorded: true });
});

describe("routes", () => {
  it("open My games and a review of either kind", () => {
    expect(parseRoute("/games/chess/games")).toEqual({ name: "myGames" });
    expect(parseRoute("/games/chess/review/rec1")).toEqual({ name: "review", source: "record", id: "rec1" });
    expect(parseRoute("/games/chess/review/m/abc123")).toEqual({ name: "review", source: "match", id: "abc123" });
  });
});

describe("game review", () => {
  it("opens at the end and steps back and forth by button, move list and keys", async () => {
    const user = userEvent.setup();
    render(<ChessReviewPage source="record" id="rec1" />);
    await waitFor(() => expect(screen.getByText("Computer (Hard) wins")).toBeInTheDocument());
    expect(screen.getByText("Checkmate.")).toBeInTheDocument();
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
    // The mating queen is on h4.
    expect(square("h4")).toHaveAccessibleName(/queen/i);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("3 of 4")).toBeInTheDocument();
    expect(square("h4")).not.toHaveAccessibleName(/queen/i);

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByText("0 of 4")).toBeInTheDocument();
    expect(square("f2")).toHaveAccessibleName(/pawn/i);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    const list = screen.getByLabelText("Moves");
    await user.click(within(list).getByRole("button", { name: "g4" }));
    expect(screen.getByText("3 of 4")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "g4" })).toHaveAttribute("aria-current", "step");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
    await user.keyboard("{Home}");
    expect(screen.getByText("0 of 4")).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByText("4 of 4")).toBeInTheDocument();
  });
});

describe("My games", () => {
  it("lists the games with their result, opponent and moves, each opening its review", async () => {
    const items: ReviewItem[] = [
      { source: "match", id: "m1", game: "chess", mode: "online", level: null, seat: 0, opponent: "Dad", winner: 0, reason: "resigned", moveCount: 31, finishedAt: "2026-10-22T18:00:00.000Z" },
      { ...fools, moves: undefined } as unknown as ReviewItem,
      { source: "record", id: "r2", game: "chess", mode: "local", level: null, seat: null, opponent: null, winner: null, reason: "agreed", moveCount: 10, finishedAt: "2026-10-19T18:00:00.000Z" }
    ];
    vi.mocked(api.fetchMyGames).mockResolvedValue(items);
    render(<MyChessGamesPage />);
    const links = await screen.findAllByRole("link", { name: /moves played/ });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/games/chess/review/m/m1", "/games/chess/review/rec1", "/games/chess/review/r2"]);
    expect(links[0]).toHaveTextContent("Won");
    expect(links[0]).toHaveTextContent("vs Dad");
    expect(links[0]).toHaveTextContent("16 moves played");
    expect(links[1]).toHaveTextContent("Lost");
    expect(links[1]).toHaveTextContent("vs Computer (Hard)");
    expect(links[2]).toHaveTextContent("Draw");
    expect(links[2]).toHaveTextContent("Two at one screen");
  });

  it("says so when there are none", async () => {
    vi.mocked(api.fetchMyGames).mockResolvedValue([]);
    render(<MyChessGamesPage />);
    expect(await screen.findByText(/No finished games yet/)).toBeInTheDocument();
  });
});

describe("a finished game on this device", () => {
  it("is sent for review, and Review game opens it", async () => {
    localStorage.setItem("isputnik-games.chess.local", JSON.stringify({
      setup: { mode: "local", computerPlays: 1, level: "easy" }, key: "local-key-01",
      moves: ["f2f3", "e7e5", "g2g4", "d8h4"].map(mv), finished: null
    }));
    window.history.replaceState(null, "", "/games/chess");
    render(<ChessPage />);
    await waitFor(() => expect(api.saveGameRecord).toHaveBeenCalledWith({
      game: "chess", key: "local-key-01", mode: "local", moves: ["f2f3", "e7e5", "g2g4", "d8h4"].map(mv)
    }));
    expect(api.saveGameRecord).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Review game" })).toBeInTheDocument();
  });

  it("against the computer, shows the chess rating it left", async () => {
    vi.mocked(api.reportComputerResult).mockResolvedValue({ recorded: true, chessRating: { rating: 1032, games: 3, provisional: true, change: 8 } });
    localStorage.setItem("isputnik-games.chess.local", JSON.stringify({
      setup: { mode: "computer", computerPlays: 1, level: "hard" }, key: "local-key-02",
      moves: ["f2f3", "e7e5", "g2g4", "d8h4"].map(mv), finished: null
    }));
    window.history.replaceState(null, "", "/games/chess");
    render(<ChessPage />);
    await waitFor(() => expect(api.reportComputerResult).toHaveBeenCalledWith({ game: "chess", level: "hard", result: "lost", key: "local-key-02" }));
    const line = await screen.findByText("Chess rating");
    expect(line.parentElement).toHaveTextContent("Chess rating 1032+8provisional");
  });
});
