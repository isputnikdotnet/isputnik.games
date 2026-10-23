import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  return { ...actual, fetchMatches: vi.fn(), fetchMatch: vi.fn(), postMove: vi.fn(), createMatch: vi.fn(), fetchMembers: vi.fn() };
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
    await user.click(await within(dialog).findByRole("button", { name: "Dad" }));
    await user.click(within(dialog).getByRole("button", { name: "Black" }));
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(api.createMatch).toHaveBeenCalledWith({ game: "chess", options: {}, opponent: { id: "dad", name: "Dad" }, seat: 1 });
    await waitFor(() => expect(window.location.pathname).toBe("/games/chess/m/new"));
  });
});
