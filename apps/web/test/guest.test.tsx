import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuestInvite, MatchSummary } from "../src/api";
import { SessionContext, type SessionState } from "../src/session";
import { Shell } from "../src/shared/Shell";
import { GuestLobby } from "../src/pages/GuestLobby";
import { LobbyPage } from "../src/pages/LobbyPage";
import { GuestLinkPanel } from "../src/shared/GuestLinkPanel";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return {
    ...actual,
    fetchMatches: vi.fn(),
    fetchSummary: vi.fn(),
    fetchMembers: vi.fn(),
    createMatch: vi.fn(),
    createGuestInvite: vi.fn(),
    fetchGuestInvite: vi.fn(),
    renewGuestInvite: vi.fn(),
    revokeGuestInvite: vi.fn()
  };
});
import * as api from "../src/api";

const alex = { id: "guest_abc123def456", name: "Alex", role: "guest" as const, guestMatch: "m1", lang: "en", theme: "system" };
const mum = { id: "mum", name: "Мама", role: "member" as const, lang: "en", theme: "minimalist" };
const asGuest: SessionState = { status: "ready", user: alex, guests: true, version: "test", stage: null };
const asMum: SessionState = { status: "ready", user: mum, guests: true, version: "test", stage: null };

const match = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  id: "m1",
  game: "dots",
  options: { size: 10, targetCaptures: null },
  status: "invited",
  players: [{ id: "mum", name: "Мама" }, { id: "guest_abc123def456", name: "Alex", guest: true }],
  createdBy: "mum",
  moveCount: 0,
  turn: null,
  winner: null,
  finishReason: null,
  score: [0, 0],
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
  finishedAt: null,
  ...over
});

const invite = (over: Partial<GuestInvite> = {}): GuestInvite => ({
  id: "inv1",
  guestId: "guest_abc123def456",
  guestName: "Alex",
  game: "dots",
  matchId: "m1",
  createdBy: { id: "mum", name: "Мама" },
  createdAt: "2026-10-23T00:00:00.000Z",
  expiresAt: "2026-11-06T00:00:00.000Z",
  revokedAt: null,
  openedCount: 0,
  firstOpenedAt: null,
  lastSeenAt: null,
  lastIp: null,
  state: "live",
  ...over
});

const withSession = (session: SessionState, ui: React.ReactElement) => render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>);

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/games/");
  vi.mocked(api.fetchSummary).mockResolvedValue({ invitations: [], yourMove: [], counts: { invitations: 0, yourMove: 0 } });
});

describe("a guest's frame", () => {
  it("names the guest, and offers neither the way home nor the tabs", () => {
    withSession(asGuest, <Shell><p>page</p></Shell>);
    expect(screen.getByText("Alex · guest")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "iSputnik home" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main tabs" })).not.toBeInTheDocument();
  });

  it("keeps both for a member", () => {
    withSession(asMum, <Shell><p>page</p></Shell>);
    expect(screen.getByRole("link", { name: "iSputnik home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("navigation", { name: "Main tabs" })).toBeInTheDocument();
  });

  it("shows the guest their one match and who invited them", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([match()]);
    withSession(asGuest, <GuestLobby />);
    expect(await screen.findByText("You are playing as Мама’s guest. Your link opens this match only.")).toBeInTheDocument();
    const row = screen.getByRole("link", { name: /vs Мама/ });
    expect(row).toHaveAttribute("href", "/games/dots/m/m1");
    expect(row).toHaveTextContent("Мама invites you");
  });
});

describe("inviting someone outside the family", () => {
  it("makes a link on the home server and shows it once", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([]);
    vi.mocked(api.fetchMembers).mockResolvedValue([{ id: "mum", name: "Мама" }, { id: "dad", name: "Dad" }]);
    vi.mocked(api.createGuestInvite).mockResolvedValue({ invite: invite(), url: "https://home.example/games/guest/TOKEN", match: match() });
    const user = userEvent.setup();
    withSession(asMum, <LobbyPage />);

    await user.click(await screen.findByRole("button", { name: "Invite a member" }));
    const dialog = screen.getByRole("dialog", { name: "Invite to play" });
    await user.click(await within(dialog).findByRole("tab", { name: /External invite/ }));
    // Nothing is sent without a name, and the dialog says so.
    await user.click(within(dialog).getByRole("button", { name: "Create link" }));
    expect(api.createGuestInvite).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Type their name first");
    expect(within(dialog).getByLabelText("Their name")).toHaveAttribute("aria-invalid", "true");
    await user.type(within(dialog).getByLabelText("Their name"), "  Alex ");
    await user.selectOptions(within(dialog).getByLabelText("Expires in"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Create link" }));

    expect(api.createGuestInvite).toHaveBeenCalledWith({ game: "dots", options: { size: 15, targetCaptures: null }, seat: 0, guestName: "Alex", days: 1 });
    // The link, beside the form: a QR code, the address to copy, and how long it works.
    const share = await within(dialog).findByRole("complementary", { name: "The link to share" });
    expect(within(share).getByRole("img", { name: "QR code of the link" })).toBeInTheDocument();
    expect(within(share).getByLabelText("Link")).toHaveValue("https://home.example/games/guest/TOKEN");
    expect(within(share).getByRole("link", { name: "Email invite" }).getAttribute("href")).toContain(encodeURIComponent("https://home.example/games/guest/TOKEN"));
    expect(share).toHaveTextContent("Works until");
    // The match exists now: its settings no longer change.
    expect(within(dialog).getByLabelText("Their name")).toBeDisabled();
    await user.click(within(share).getByRole("link", { name: "Go to the match" }));
    await waitFor(() => expect(window.location.pathname).toBe("/games/dots/m/m1"));
  });

  it("is not offered without a gateway to make links", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([]);
    vi.mocked(api.fetchMembers).mockResolvedValue([{ id: "dad", name: "Dad" }]);
    const user = userEvent.setup();
    withSession({ ...asMum, guests: false }, <LobbyPage />);
    await user.click(await screen.findByRole("button", { name: "Invite a member" }));
    const dialog = screen.getByRole("dialog", { name: "Invite to play" });
    expect(await within(dialog).findByRole("radio", { name: "Dad" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("tab", { name: /External invite/ })).not.toBeInTheDocument();
  });
});

describe("the inviter's guest link panel", () => {
  it("says whether the link was opened, renews it with a fresh link, and revokes it after a confirmation", async () => {
    vi.mocked(api.fetchGuestInvite).mockResolvedValue(invite());
    vi.mocked(api.renewGuestInvite).mockResolvedValue({ invite: invite({ openedCount: 2, lastSeenAt: "2026-10-24T10:00:00.000Z" }), url: "https://home.example/games/guest/NEW" });
    vi.mocked(api.revokeGuestInvite).mockResolvedValue({ invite: invite({ state: "revoked", revokedAt: "2026-10-25T00:00:00.000Z" }) });
    const user = userEvent.setup();
    withSession(asMum, <GuestLinkPanel matchId="m1" guestName="Alex" />);

    const panel = await screen.findByRole("region", { name: "Guest link" });
    expect(panel).toHaveTextContent("Not opened yet");
    expect(panel).toHaveTextContent("works until");

    await user.click(within(panel).getByRole("button", { name: "New link" }));
    expect(api.renewGuestInvite).toHaveBeenCalledWith("inv1");
    expect(await within(panel).findByLabelText("Link")).toHaveValue("https://home.example/games/guest/NEW");
    expect(panel).toHaveTextContent("Opened 2 times");

    await user.click(within(panel).getByRole("button", { name: "Revoke link" }));
    const confirm = screen.getByRole("dialog", { name: "Revoke the guest link?" });
    expect(confirm).toHaveTextContent("Alex can no longer open this match.");
    await user.click(within(confirm).getByRole("button", { name: "Revoke link" }));
    expect(api.revokeGuestInvite).toHaveBeenCalledWith("inv1");
    await waitFor(() => expect(panel).toHaveTextContent("The link was revoked"));
    expect(within(panel).queryByRole("button", { name: "Revoke link" })).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText("Link")).not.toBeInTheDocument();
  });

  it("draws nothing when the match has no guest link", async () => {
    vi.mocked(api.fetchGuestInvite).mockResolvedValue(null);
    withSession(asMum, <GuestLinkPanel matchId="m1" guestName="Alex" />);
    await waitFor(() => expect(api.fetchGuestInvite).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Guest link" })).not.toBeInTheDocument();
  });
});
