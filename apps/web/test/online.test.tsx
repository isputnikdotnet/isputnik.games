import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dots } from "@isputnik/games-engine";
import type { MatchDetail, MatchSummary } from "../src/api";
import { SessionContext } from "../src/session";
import { LobbyPage } from "../src/pages/LobbyPage";
import { DotsMatchPage } from "../src/games/dots/DotsMatchPage";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return {
    ...actual,
    fetchMatches: vi.fn(),
    fetchMatch: vi.fn(),
    answerMatch: vi.fn(),
    postMove: vi.fn(),
    resignMatch: vi.fn(),
    createMatch: vi.fn(),
    fetchMembers: vi.fn()
  };
});
import * as api from "../src/api";

const me = { id: "mum", name: "Мама", role: "member" as const, lang: "en", theme: "minimalist" };
const session = { status: "ready" as const, user: me, guests: true, version: "test", stage: null };

const summary = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  id: "m1",
  game: "dots",
  options: { size: 10, targetCaptures: null },
  status: "playing",
  players: [{ id: "mum", name: "Мама" }, { id: "dad", name: "Dad" }],
  createdBy: "mum",
  moveCount: 0,
  turn: 0,
  winner: null,
  finishReason: null,
  score: [0, 0],
  createdAt: "2026-10-21T00:00:00.000Z",
  updatedAt: "2026-10-21T00:00:00.000Z",
  finishedAt: null,
  ...over
});

const detail = (over: Partial<MatchSummary> = {}, state = Dots.createGame({ size: 10, targetCaptures: null })): MatchDetail => ({
  ...summary(over),
  state,
  feed: [],
  messages: []
});

const withSession = (ui: React.ReactElement) => render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>);

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/games/");
});

describe("lobby, online section", () => {
  it("puts what waits on you first, the rest after, and accepting opens the match", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([
      summary({ id: "inv", status: "invited", createdBy: "dad", players: [{ id: "dad", name: "Dad" }, { id: "mum", name: "Мама" }], turn: null }),
      summary({ id: "mine", turn: 0, score: [3, 1] }),
      summary({ id: "theirs", turn: 1, score: [2, 1] }),
      summary({ id: "done", status: "finished", turn: null, winner: 1, finishReason: "resigned" })
    ]);
    vi.mocked(api.answerMatch).mockResolvedValue(summary({ id: "inv" }));
    const user = userEvent.setup();
    withSession(<LobbyPage />);

    const waiting = await screen.findByRole("region", { name: /^Your turn/ });
    await within(waiting).findByText("Dad invites you");
    expect(screen.getByText(/2 games are waiting on you\./)).toBeInTheDocument();
    const cards = within(waiting).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Invitation");
    expect(cards[1]).toHaveTextContent("Your move");
    expect(cards[1]).toHaveTextContent("vs Dad");
    expect(cards[1]).toHaveTextContent("3 : 1");
    // Their move: one quiet line, each a link to its match.
    expect(within(waiting).getByRole("link", { name: "Dots vs Dad" })).toHaveAttribute("href", "/games/dots/m/theirs");

    // The Dots card says it is your move there.
    const games = screen.getByRole("region", { name: "Choose a game" });
    const dotsCard = within(games).getByRole("heading", { name: "Dots" }).closest("article")!;
    expect(dotsCard).toHaveTextContent("Your move");

    const recent = screen.getByRole("region", { name: "Recent games" });
    expect(within(recent).getByRole("link", { name: /Dots vs Dad.*Dad wins/ })).toHaveAttribute("href", "/games/dots/m/done");

    await user.click(within(cards[0]).getByRole("button", { name: "Accept" }));
    expect(api.answerMatch).toHaveBeenCalledWith("inv", "accept");
    await waitFor(() => expect(window.location.pathname).toBe("/games/dots/m/inv"));
  });

  it("lists Sputnik Catch as a game for one, with Play and no Invite", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([]);
    withSession(<LobbyPage />);
    const games = await screen.findByRole("region", { name: "Choose a game" });
    const card = within(games).getByRole("heading", { name: "Sputnik Catch" }).closest("article")!;
    expect(within(card).getByText("Solo")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Play" })).toHaveAttribute("href", "/games/sputnik");
    expect(within(card).queryByRole("button", { name: "Invite" })).toBeNull();
  });

  it("a game card's Invite opens the dialog on that game", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([]);
    vi.mocked(api.fetchMembers).mockResolvedValue([{ id: "dad", name: "Dad" }]);
    const user = userEvent.setup();
    withSession(<LobbyPage />);
    const games = await screen.findByRole("region", { name: "Choose a game" });
    const chessCard = within(games).getByRole("heading", { name: "Chess" }).closest("article")!;
    await user.click(within(chessCard).getByRole("button", { name: "Invite" }));
    const dialog = screen.getByRole("dialog", { name: "Invite to play" });
    expect(within(dialog).getByRole("button", { name: "Chess" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends an invitation from the dialog", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([]);
    vi.mocked(api.fetchMembers).mockResolvedValue([{ id: "mum", name: "Мама" }, { id: "dad", name: "Dad" }]);
    vi.mocked(api.createMatch).mockResolvedValue(summary({ id: "new", status: "invited", turn: null }));
    const user = userEvent.setup();
    withSession(<LobbyPage />);

    expect(await screen.findByText("No online matches yet. Invite a member to play.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Invite a member" }));
    const dialog = screen.getByRole("dialog", { name: "Invite to play" });
    // Only the others are offered.
    expect(within(dialog).queryByRole("button", { name: "Мама" })).not.toBeInTheDocument();
    await user.click(await within(dialog).findByRole("button", { name: "Dad" }));
    await user.click(within(dialog).getByRole("button", { name: "Red" }));
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    expect(api.createMatch).toHaveBeenCalledWith({
      game: "dots", options: { size: 15, targetCaptures: null }, opponent: { id: "dad", name: "Dad" }, seat: 1
    });
    await waitFor(() => expect(window.location.pathname).toBe("/games/dots/m/new"));
  });
});

describe("online match page", () => {
  const board = () => screen.getByRole("img", { name: "Dots board, 10 by 10" });
  const placeAt = (x: number, y: number) => {
    const svg = board();
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(svg, { button: 0, clientX: x * 10 + 5, clientY: y * 10 + 5, pointerType: "mouse" });
  };

  it("sends my move to the server and shows the answer", async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(detail());
    const after = Dots.applyMove(Dots.createGame({ size: 10, targetCaptures: null }), { x: 3, y: 3 });
    vi.mocked(api.postMove).mockResolvedValue(detail({ moveCount: 1, turn: 1 }, after));
    withSession(<DotsMatchPage matchId="m1" />);

    expect(await screen.findByRole("status")).toHaveTextContent("Your move");
    placeAt(3, 3);
    expect(api.postMove).toHaveBeenCalledWith("m1", { x: 3, y: 3 }, 0);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Dad to move"));
    // Not my move any more: a tap does nothing.
    placeAt(4, 4);
    expect(api.postMove).toHaveBeenCalledTimes(1);
  });

  it("announces the result and names the resigner", async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(detail({ status: "finished", turn: null, winner: 1, finishReason: "resigned", score: [0, 0] },
      Dots.finish(Dots.createGame({ size: 10, targetCaptures: null }), "resigned", 0)));
    withSession(<DotsMatchPage matchId="m1" />);
    const dialog = await screen.findByRole("dialog", { name: "Game over" });
    expect(dialog).toHaveTextContent("Dad wins");
    expect(dialog).toHaveTextContent("You resigned.");
    expect(dialog).toHaveTextContent("You 0 : 0 Dad");
  });
});
