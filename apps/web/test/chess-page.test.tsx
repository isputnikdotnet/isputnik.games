import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chess, type ChessMove } from "@isputnik/games-engine";
import type { MatchDetail, MatchSummary } from "../src/api";
import { SessionContext } from "../src/session";
import { ChessPage } from "../src/games/chess/ChessPage";
import { ChessMatchPage } from "../src/games/chess/ChessMatchPage";
import { LobbyPage } from "../src/pages/LobbyPage";
import { loadChessGame } from "../src/games/chess/storage";
import { COMPUTER_DELAY } from "../src/games/chess/useChessGame";
import { localSan } from "../src/games/chess/comms";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchMatches: vi.fn(), fetchMatch: vi.fn(), postMove: vi.fn(), createMatch: vi.fn(), fetchMembers: vi.fn(), drawMatch: vi.fn(), fetchAdaptiveStrength: vi.fn() };
});
import * as api from "../src/api";

const square = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}(,|$)`) });

/** A local game already under way: what storage would hold after these moves. */
function saved(moves: string[], mode: "local" | "computer" = "local") {
  const list: ChessMove[] = moves.map((m) => ({ from: m.slice(0, 2), to: m.slice(2, 4) }));
  localStorage.setItem("isputnik-games.chess.local", JSON.stringify({
    setup: { mode, computerPlays: 1, level: "easy" }, moves: list, finished: null
  }));
}

describe("ChessPage", () => {
  const delay = COMPUTER_DELAY.ms;
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/games/chess");
    COMPUTER_DELAY.ms = 0;
  });
  afterEach(() => {
    COMPUTER_DELAY.ms = delay;
  });

  it("starts a two-player game, marks where a piece may go, and keeps the move", async () => {
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByRole("status")).toHaveTextContent("White to move");
    // Light on the right: a1 and h8 dark, h1 and a8 light; each queen on her own colour.
    expect(square("a1")).toHaveClass("is-dark");
    expect(square("h1")).toHaveClass("is-light");
    expect(square("a8")).toHaveClass("is-light");
    expect(square("h8")).toHaveClass("is-dark");
    expect(square("d1")).toHaveClass("is-light");
    expect(square("d8")).toHaveClass("is-dark");

    await user.click(square("e2"));
    expect(square("e2")).toHaveAttribute("aria-pressed", "true");
    expect(square("e3")).toHaveClass("is-target");
    expect(square("e4")).toHaveClass("is-target");
    expect(square("e5")).not.toHaveClass("is-target");
    // Black's pieces cannot be picked up on White's move.
    await user.click(square("e7"));
    expect(square("e7")).toHaveAttribute("aria-pressed", "false");

    await user.click(square("e2"));
    await user.click(square("e4"));
    expect(screen.getByRole("status")).toHaveTextContent("Black to move");
    expect(square("e4")).toHaveAccessibleName("e4, White pawn");
    expect(loadChessGame()?.state.moves).toEqual([{ from: "e2", to: "e4" }]);
    expect(screen.getByRole("log")).toHaveTextContent("1. e4");
  });

  it("moves a piece by dragging it, and puts it back when dropped off a target", async () => {
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    // jsdom lays nothing out: a 400px board at the corner, 50px squares, White below.
    const board = screen.getByRole("group", { name: "Chessboard" });
    vi.spyOn(board, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) });
    const at = (file: number, rank: number) => ({ clientX: file * 50 + 25, clientY: (8 - rank) * 50 + 25, pointerId: 1, button: 0, pointerType: "mouse" });

    // Dropped on a square it cannot reach: nothing is played, the pawn goes home.
    fireEvent.pointerDown(square("e2"), at(4, 2));
    fireEvent.pointerMove(board, at(4, 3));
    expect(square("e2")).toHaveClass("is-lifted");
    expect(square("e4")).toHaveClass("is-target");
    fireEvent.pointerMove(board, at(4, 5));
    expect(square("e5")).toHaveClass("is-over");
    fireEvent.pointerUp(board, at(4, 5));
    expect(loadChessGame()?.state.moves ?? []).toEqual([]);
    expect(square("e2")).not.toHaveClass("is-lifted");

    fireEvent.pointerDown(square("e2"), at(4, 2));
    fireEvent.pointerMove(board, at(4, 3));
    fireEvent.pointerMove(board, at(4, 4));
    fireEvent.pointerUp(board, at(4, 4));
    expect(screen.getByRole("status")).toHaveTextContent("Black to move");
    expect(square("e4")).toHaveAccessibleName("e4, White pawn");
    expect(loadChessGame()?.state.moves).toEqual([{ from: "e2", to: "e4" }]);

    // The side not to move cannot pick a piece up.
    fireEvent.pointerDown(square("d2"), at(3, 2));
    fireEvent.pointerMove(board, at(3, 4));
    expect(square("d2")).not.toHaveClass("is-lifted");
    fireEvent.pointerUp(board, at(3, 4));
    expect(loadChessGame()?.state.moves).toHaveLength(1);
  });

  it("plays the computer at a strength picked on the 0-100 scale", async () => {
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Against the computer" }));
    await user.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByRole("slider", { name: "Strength" }), { target: { value: "80" } });
    expect(screen.getByText("80 of 100 — plays like about 1520")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByText("Computer: strength 80 (about 1520)")).toBeInTheDocument();
    expect(loadChessGame()?.setup).toMatchObject({ levelMode: "custom", strength: 80, level: "hard" });
  });

  it("plays the adaptive computer at the strength the server suggests", async () => {
    vi.mocked(api.fetchAdaptiveStrength).mockResolvedValue({ strength: 43, elo: 1002, source: "games", target: 1000 });
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Against the computer" }));
    await user.click(screen.getByRole("button", { name: "Adaptive" }));
    expect(await screen.findByText(/^Plays at your level: about 1002/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(screen.getByText("Computer: adaptive, about 1002")).toBeInTheDocument();
    expect(loadChessGame()?.setup).toMatchObject({ levelMode: "adaptive", strength: 43, level: "normal" });
  });

  it("puts a game aside with Save and leave, and takes it up again", async () => {
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    await user.click(square("e2"));
    await user.click(square("e4"));
    await user.click(screen.getByRole("button", { name: "Save and leave" }));

    // Back at the start, the game listed under the form; nothing on the board.
    expect(loadChessGame()).toBeNull();
    const saved = screen.getByRole("region", { name: "Saved games" });
    expect(saved).toHaveTextContent("Two players, one screen");
    expect(saved).toHaveTextContent("1 move · Black to move");

    // A second game, put aside too: two on the shelf.
    await user.click(screen.getByRole("button", { name: "Start game" }));
    await user.click(square("d2"));
    await user.click(square("d4"));
    await user.click(screen.getByRole("button", { name: "Save and leave" }));
    expect(within(screen.getByRole("region", { name: "Saved games" })).getAllByRole("button", { name: "Continue" })).toHaveLength(2);

    // Delete asks first, then the first one (the newest, d4) goes.
    await user.click(within(screen.getByRole("region", { name: "Saved games" })).getAllByRole("button", { name: "Delete saved game" })[0]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete game" }));
    await user.click(within(screen.getByRole("region", { name: "Saved games" })).getByRole("button", { name: "Continue" }));
    expect(square("e4")).toHaveAccessibleName("e4, White pawn");
    expect(screen.getByRole("status")).toHaveTextContent("Black to move");
    expect(loadChessGame()?.state.moves).toEqual([{ from: "e2", to: "e4" }]);
  });

  it("plays on the clock: one free move each, then White's time runs out", () => {
    vi.useFakeTimers();
    try {
      render(<ChessPage />);
      fireEvent.click(screen.getByRole("button", { name: "Two players, one screen" }));
      fireEvent.click(screen.getByRole("button", { name: "1 min" }));
      fireEvent.click(screen.getByRole("button", { name: "Start game" }));
      const clocks = () => screen.getAllByRole("timer").map((timer) => timer.textContent);
      expect(clocks()).toEqual(["1:00", "1:00"]);
      // No takebacks on the clock.
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

      fireEvent.click(square("e2"));
      fireEvent.click(square("e4"));
      fireEvent.click(square("e7"));
      fireEvent.click(square("e5"));
      // Both first moves were free: White's clock starts now.
      act(() => vi.advanceTimersByTime(30_000));
      expect(screen.getByRole("timer", { name: /White: 0:30/ })).toHaveClass("is-running");
      act(() => vi.advanceTimersByTime(31_000));

      expect(screen.getByRole("status")).toHaveTextContent("Black wins");
      expect(screen.getAllByText("White ran out of time.").length).toBeGreaterThan(0);
      expect(loadChessGame()?.state.status).toEqual({ kind: "finished", winner: 1, reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the computer answer", async () => {
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Against the computer" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    await user.click(square("d2"));
    await user.click(square("d4"));
    await waitFor(() => expect(loadChessGame()?.state.moves).toHaveLength(2));
    expect(screen.getByRole("status")).toHaveTextContent("White to move");
    // Undo against the computer takes back the pair.
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(loadChessGame()?.state.moves).toHaveLength(0);
  });

  it("changes the computer's level during the game, in Settings", async () => {
    saved(["e2e4", "e7e5"], "computer");
    const user = userEvent.setup();
    render(<ChessPage />);
    expect(screen.getByText("Against the computer · Easy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const level = screen.getByRole("group", { name: "Level" });
    expect(within(level).getByRole("button", { name: "Easy" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(level).getByRole("button", { name: "Hard" }));
    expect(within(level).getByRole("button", { name: "Hard" })).toHaveAttribute("aria-pressed", "true");
    expect(loadChessGame()?.setup.level).toBe("hard");
    // The moves stay; the next new game starts at Hard too.
    expect(loadChessGame()?.state.moves).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem("isputnik-games.chess.setup")!).level).toBe("hard");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText("Against the computer · Hard")).toBeInTheDocument();
  });

  it("exits to the lobby after asking, and leaves no game behind", async () => {
    saved(["e2e4", "e7e5"]);
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Exit game" }));
    const dialog = screen.getByRole("dialog", { name: "Leave this game?" });
    await user.click(within(dialog).getByRole("button", { name: "Exit game" }));
    expect(window.location.pathname).toBe("/games/");
    expect(loadChessGame()).toBeNull();
  });

  it("offers the way back to the games once a game is over", async () => {
    saved(["e2e4", "e7e5"], "computer");
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Resign" }));
    await user.click(within(screen.getByRole("dialog", { name: "Resign this game?" })).getByRole("button", { name: "Resign" }));
    const result = screen.getByRole("dialog", { name: "Game over" });
    expect(result).toHaveTextContent("Computer wins");
    await user.click(within(result).getByRole("button", { name: "Back to games" }));
    expect(window.location.pathname).toBe("/games/");
  });

  it("asks what a pawn becomes", async () => {
    saved(["h2h4", "g7g5", "h4g5", "g8f6", "g5f6", "h8g8", "f6e7", "a7a6"]);
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(square("e7"));
    await user.click(square("f8"));
    const dialog = screen.getByRole("dialog", { name: "The pawn becomes…" });
    await user.click(within(dialog).getByRole("button", { name: "White knight" }));
    expect(square("f8")).toHaveAccessibleName("f8, White knight");
    expect(screen.getByRole("log")).toHaveTextContent("5. exf8=N");
  });

  it("announces a checkmate", async () => {
    saved(["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6"]);
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(square("h5"));
    await user.click(square("f7"));
    const dialog = screen.getByRole("dialog", { name: "Game over" });
    expect(dialog).toHaveTextContent("White wins");
    expect(dialog).toHaveTextContent("Checkmate.");
    expect(square("e8")).toHaveClass("is-check");
  });
});

describe("piece letters", () => {
  it("writes the moves in the reader's letters", () => {
    const ru = "Кр,Ф,Л,С,К";
    expect(localSan("Nxe5+", ru)).toBe("Кxe5+");
    expect(localSan("Kd2", ru)).toBe("Крd2");
    expect(localSan("e8=Q#", ru)).toBe("e8=Ф#");
    expect(localSan("O-O", ru)).toBe("O-O");
    expect(localSan("Bb5", "K,Q,R,B,N")).toBe("Bb5");
  });
});

const me = { id: "mum", name: "Мама", role: "member" as const, lang: "en", theme: "minimalist" };
const session = { status: "ready" as const, user: me, guests: false, version: "test", stage: null };
const withSession = (ui: React.ReactElement) => render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>);

const summary = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  id: "m1",
  game: "chess",
  options: {},
  status: "playing",
  players: [{ id: "mum", name: "Мама" }, { id: "dad", name: "Dad" }],
  createdBy: "mum",
  moveCount: 0,
  turn: 0,
  winner: null,
  finishReason: null,
  score: null,
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
  finishedAt: null,
  ...over
});

describe("online chess", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/games/");
  });

  it("sends a move to the server, and faces Black's board to Black", async () => {
    const start = Chess.createGame();
    const detail: MatchDetail = { ...summary(), state: start, feed: [], messages: [] };
    vi.mocked(api.fetchMatch).mockResolvedValue(detail);
    const after = Chess.applyMove(start, { from: "e2", to: "e4" });
    vi.mocked(api.postMove).mockResolvedValue({ ...summary({ moveCount: 1, turn: 1 }), state: after, feed: [], messages: [] });
    const user = userEvent.setup();
    withSession(<ChessMatchPage matchId="m1" />);

    expect(await screen.findByRole("status")).toHaveTextContent("Your move");
    await user.click(square("e2"));
    await user.click(square("e4"));
    expect(api.postMove).toHaveBeenCalledWith("m1", { from: "e2", to: "e4" }, 0);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Dad to move"));
  });

  it("offers a draw, and answers the other side's offer", async () => {
    const start = Chess.createGame();
    vi.mocked(api.fetchMatch).mockResolvedValue({ ...summary(), state: start, feed: [], messages: [], draw: { offeredBy: 1, canOffer: false } });
    vi.mocked(api.drawMatch).mockResolvedValue({ ...summary({ status: "finished", turn: null, winner: null, finishReason: "agreed" }), state: Chess.finish(start, "agreed"), feed: [], messages: [] });
    const user = userEvent.setup();
    withSession(<ChessMatchPage matchId="m1" />);

    expect(await screen.findByText("Dad offers a draw")).toBeInTheDocument();
    // An offer stands: no second one over it.
    expect(screen.queryByRole("button", { name: "Offer a draw" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Accept the draw" }));
    expect(api.drawMatch).toHaveBeenCalledWith("m1", "accept");
    await waitFor(() => expect(screen.getAllByText("Drawn by agreement.").length).toBeGreaterThan(0));
  });

  it("lets the player offer a draw when none stands", async () => {
    const start = Chess.createGame();
    vi.mocked(api.fetchMatch).mockResolvedValue({ ...summary(), state: start, feed: [], messages: [], draw: { offeredBy: null, canOffer: true } });
    vi.mocked(api.drawMatch).mockResolvedValue({ ...summary(), state: start, feed: [], messages: [], draw: { offeredBy: 0, canOffer: false } });
    const user = userEvent.setup();
    withSession(<ChessMatchPage matchId="m1" />);
    await user.click(await screen.findByRole("button", { name: "Offer a draw" }));
    expect(api.drawMatch).toHaveBeenCalledWith("m1", "offer");
    expect(await screen.findByText("You offered a draw")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take the offer back" })).toBeInTheDocument();
  });

  it("puts Black at the bottom for the player with Black", async () => {
    const detail: MatchDetail = {
      ...summary({ players: [{ id: "dad", name: "Dad" }, { id: "mum", name: "Мама" }], turn: 0 }),
      state: Chess.createGame(), feed: [], messages: []
    };
    vi.mocked(api.fetchMatch).mockResolvedValue(detail);
    withSession(<ChessMatchPage matchId="m1" />);
    await screen.findByRole("status");
    const squares = within(screen.getByRole("group", { name: "Chessboard" })).getAllByRole("button");
    expect(squares[0]).toHaveAccessibleName("h1, White rook");
    expect(squares[63]).toHaveAccessibleName("a8, Black rook");
  });

  it("invites with a colour and no other settings", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([]);
    vi.mocked(api.fetchMembers).mockResolvedValue([{ id: "dad", name: "Dad" }]);
    vi.mocked(api.createMatch).mockResolvedValue(summary({ id: "new", status: "invited", turn: null }));
    const user = userEvent.setup();
    withSession(<LobbyPage />);
    await user.click(await screen.findByRole("button", { name: "Invite a member" }));
    const dialog = screen.getByRole("dialog", { name: "Invite to play" });
    await user.click(within(dialog).getByRole("button", { name: "Chess" }));
    await user.click(await within(dialog).findByRole("radio", { name: "Dad" }));
    await user.click(within(dialog).getByRole("button", { name: "Black" }));
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(api.createMatch).toHaveBeenCalledWith({ game: "chess", options: {}, opponent: { id: "dad", name: "Dad" }, seat: 1 });
    await waitFor(() => expect(window.location.pathname).toBe("/games/chess/m/new"));
  });
});
