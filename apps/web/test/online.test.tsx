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
const session = { status: "ready" as const, user: me, version: "test", stage: null };

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
  it("groups matches by who they wait on, and accepting opens the match", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([
      summary({ id: "inv", status: "invited", createdBy: "dad", players: [{ id: "dad", name: "Dad" }, { id: "mum", name: "Мама" }], turn: null }),
      summary({ id: "mine", turn: 0 }),
      summary({ id: "theirs", turn: 1, score: [2, 1] }),
      summary({ id: "done", status: "finished", turn: null, winner: 1, finishReason: "resigned" })
    ]);
    vi.mocked(api.answerMatch).mockResolvedValue(summary({ id: "inv" }));
    const user = userEvent.setup();
    withSession(<LobbyPage />);

    const invitations = await screen.findByRole("heading", { name: "Invitations" });
    const invitationList = invitations.parentElement!;
    expect(within(invitationList).getByText(/Dad invites you/)).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Your move" }).parentElement!).getByText("vs Dad")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Waiting for the other player" }).parentElement!).getByText(/2 : 1/)).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Finished" }).parentElement!).getByText(/Dad wins/)).toBeInTheDocument();

    await user.click(within(invitationList).getByRole("button", { name: "Accept" }));
    expect(api.answerMatch).toHaveBeenCalledWith("inv", "accept");
    await waitFor(() => expect(window.location.pathname).toBe("/games/dots/m/inv"));
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
