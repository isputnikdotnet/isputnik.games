import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { flushOutbox, queuedCount, sendOrQueue, setOutboxOwner } from "../src/outbox";
import { recallMe, rememberMe } from "../src/offline";
import { ApiError, type MeResponse } from "../src/api";
import { App } from "../src/App";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchMe: vi.fn(), flushQueued: vi.fn(), fetchMatches: vi.fn(), fetchStats: vi.fn(), fetchSummary: vi.fn() };
});
import * as api from "../src/api";

const dad: MeResponse = { user: { id: "dad", name: "Dad", role: "member", lang: "en", theme: "minimalist" }, games: ["chess"], guests: true, version: "1.2.3", stage: null };
const lost = () => Promise.reject(new TypeError("Failed to fetch"));

beforeEach(() => {
  localStorage.clear();
  setOutboxOwner("dad");
  vi.mocked(api.fetchMe).mockReset();
  vi.mocked(api.flushQueued).mockReset().mockResolvedValue(0);
  vi.mocked(api.fetchMatches).mockReset().mockResolvedValue([]);
  vi.mocked(api.fetchStats).mockReset().mockImplementation(lost);
  vi.mocked(api.fetchSummary).mockReset().mockImplementation(lost);
});

describe("the outbox", () => {
  const entry = { path: "/computer-results", body: { game: "chess", key: "k1", result: "won" } };

  it("keeps a result the server could not be reached for, once, and sends it later", async () => {
    await expect(sendOrQueue(lost, entry)).rejects.toThrow();
    await expect(sendOrQueue(lost, entry)).rejects.toThrow();
    expect(queuedCount()).toBe(1);

    const send = vi.fn().mockResolvedValue({ recorded: true });
    expect(await flushOutbox(send)).toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining(entry));
    expect(queuedCount()).toBe(0);
  });

  it("does not keep what the server refused, and drops a kept one it refuses later", async () => {
    await expect(sendOrQueue(() => Promise.reject(new ApiError(400, "Bad")), entry)).rejects.toThrow();
    expect(queuedCount()).toBe(0);

    await expect(sendOrQueue(lost, entry)).rejects.toThrow();
    expect(await flushOutbox(() => Promise.reject(new ApiError(422, "No")))).toBe(0);
    expect(queuedCount()).toBe(0);
  });

  it("stops at the first one that cannot be sent and keeps the rest in order", async () => {
    await expect(sendOrQueue(lost, entry)).rejects.toThrow();
    await expect(sendOrQueue(lost, { path: "/records", body: { key: "k2" } })).rejects.toThrow();
    const send = vi.fn().mockImplementation(lost);
    expect(await flushOutbox(send)).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(queuedCount()).toBe(2);
  });

  it("never sends one member's results as another's", async () => {
    await expect(sendOrQueue(lost, entry)).rejects.toThrow();
    setOutboxOwner("mum");
    const send = vi.fn().mockResolvedValue({});
    expect(await flushOutbox(send)).toBe(0);
    expect(send).not.toHaveBeenCalled();
    setOutboxOwner("dad");
    expect(queuedCount()).toBe(1);
  });

  it("drops a kept result once it is sent the ordinary way", async () => {
    await expect(sendOrQueue(lost, entry)).rejects.toThrow();
    await sendOrQueue(() => Promise.resolve({ recorded: true }), entry);
    expect(queuedCount()).toBe(0);
  });
});

describe("starting with no server", () => {
  it("opens the lobby as the member this device remembers, and says it is offline", async () => {
    rememberMe(dad);
    vi.mocked(api.fetchMe).mockImplementation(lost);
    window.history.replaceState(null, "", "/games/");
    render(<App />);
    expect(await screen.findByText("Playing offline")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chess" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invite a member/ })).toBeDisabled();
    expect(api.fetchMatches).not.toHaveBeenCalled();
  });

  it("says what needs a connection instead of failing", async () => {
    rememberMe(dad);
    vi.mocked(api.fetchMe).mockImplementation(lost);
    window.history.replaceState(null, "", "/games/chess/puzzles");
    render(<App />);
    expect(await screen.findByText("This needs a connection")).toBeInTheDocument();
  });

  it("is not available on a device nobody has signed in on", async () => {
    vi.mocked(api.fetchMe).mockImplementation(lost);
    window.history.replaceState(null, "", "/games/");
    render(<App />);
    expect(await screen.findByText("The games are not available")).toBeInTheDocument();
  });

  it("forgets the member when the server says they are signed out", async () => {
    rememberMe(dad);
    vi.mocked(api.fetchMe).mockRejectedValue(new ApiError(401, "Unauthorized"));
    window.history.replaceState(null, "", "/games/");
    render(<App />);
    expect(await screen.findByText("Not signed in")).toBeInTheDocument();
    expect(recallMe()).toBeNull();
  });

  it("online, remembers the member and sends what waited; a guest is never remembered", async () => {
    vi.mocked(api.fetchMe).mockResolvedValue(dad);
    window.history.replaceState(null, "", "/games/");
    const { unmount } = render(<App />);
    await waitFor(() => expect(api.flushQueued).toHaveBeenCalled());
    expect(recallMe()?.user.id).toBe("dad");
    expect(screen.queryByText("Playing offline")).not.toBeInTheDocument();
    unmount();

    rememberMe({ ...dad, user: { ...dad.user, id: "g1", role: "guest" } });
    expect(recallMe()).toBeNull();
  });
});
