import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileNav } from "../src/shared/MobileNav";
import { LobbyPage } from "../src/pages/LobbyPage";
import { SessionContext } from "../src/session";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchSummary: vi.fn(), fetchMatches: vi.fn() };
});
import * as api from "../src/api";

const me = { id: "mum", name: "Мама", role: "member" as const, lang: "en", theme: "minimalist" };

beforeEach(() => {
  window.history.replaceState(null, "", "/games/");
});

describe("phone tab bar", () => {
  it("offers Home, Games and Matches, lights the tab for the page, and counts what waits", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue({ invitations: [], yourMove: [], counts: { invitations: 1, yourMove: 2 } });
    render(<MobileNav />);
    const nav = screen.getByRole("navigation", { name: "Main tabs" });
    expect(nav).toHaveTextContent("Home");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Games" })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: /Matches/ })).toHaveAttribute("href", "/games/#online");
    expect(await screen.findByLabelText("3 waiting on you")).toHaveTextContent("3");
  });

  it("lights Matches on a match page and shows no badge when nothing waits", async () => {
    window.history.replaceState(null, "", "/games/dots/m/abc");
    vi.mocked(api.fetchSummary).mockResolvedValue({ invitations: [], yourMove: [], counts: { invitations: 0, yourMove: 0 } });
    render(<MobileNav />);
    expect(screen.getByRole("link", { name: /Matches/ })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: "Games" })).not.toHaveClass("is-active");
    await Promise.resolve();
    expect(screen.queryByLabelText(/waiting on you/)).not.toBeInTheDocument();
  });
});

describe("lobby foot", () => {
  it("names the games app's version and stage", async () => {
    vi.mocked(api.fetchMatches).mockResolvedValue([]);
    render(
      <SessionContext.Provider value={{ status: "ready", user: me, guests: true, version: "0.6.0", stage: "alpha" }}>
        <LobbyPage />
      </SessionContext.Provider>
    );
    expect(await screen.findByText("iSputnik Games 0.6.0 · alpha")).toBeInTheDocument();
  });
});
