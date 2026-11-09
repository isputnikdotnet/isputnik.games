import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MobileNav } from "../src/shared/MobileNav";
import { LobbyPage } from "../src/pages/LobbyPage";
import { SessionContext } from "../src/session";
import type { Me } from "../src/api";

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
  const admin = { ...me, role: "admin" as const };
  const renderNav = (user: Me = me) =>
    render(
      <SessionContext.Provider value={{ status: "ready", user, guests: true, version: "0.6.0", stage: null }}>
        <MobileNav />
      </SessionContext.Provider>
    );

  it("is the home app's four tabs, with Media lit and what waits counted on it", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue({ invitations: [], yourMove: [], counts: { invitations: 1, yourMove: 2 } });
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Main tabs" });
    expect(nav.children).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /Media/ })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: "Offline" })).toHaveAttribute("href", "/downloads");
    expect(screen.getByRole("button", { name: "Profile" })).not.toHaveClass("is-active");
    expect(await screen.findByLabelText("3 waiting on you")).toHaveTextContent("3");
  });

  it("opens Media on the household's libraries with Games as the one you are in", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue({ invitations: [], yourMove: [], counts: { invitations: 0, yourMove: 0 } });
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Media" }));
    const sheet = screen.getByRole("dialog", { name: "Choose library" });
    expect(within(sheet).getByRole("link", { name: "Audiobooks" })).toHaveAttribute("href", "/audiobooks");
    expect(within(sheet).getByRole("link", { name: "Stories" })).toHaveAttribute("href", "/stories");
    expect(within(sheet).getByRole("link", { name: "Tags" })).toHaveAttribute("href", "/tags");
    expect(within(sheet).getByRole("link", { name: "Games" })).toHaveAttribute("aria-current", "page");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens Profile on the person's pages, the control panel for an admin, and Bugs in a new tab", async () => {
    vi.mocked(api.fetchSummary).mockResolvedValue({ invitations: [], yourMove: [], counts: { invitations: 0, yourMove: 0 } });
    renderNav(admin);
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    const sheet = screen.getByRole("dialog", { name: "Account & library" });
    expect(screen.getByRole("button", { name: "Profile" })).toHaveClass("is-active");
    expect(screen.getByRole("button", { name: "Media" })).not.toHaveClass("is-active");
    expect(within(sheet).getByRole("link", { name: "Likes" })).toHaveAttribute("href", "/likes");
    expect(within(sheet).getByRole("link", { name: "Control panel" })).toHaveAttribute("href", "/control/overview");
    expect(within(sheet).getByRole("link", { name: "Bugs" })).toHaveAttribute("target", "_blank");
    expect(within(sheet).getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });

  it("keeps the control panel from a member", () => {
    vi.mocked(api.fetchSummary).mockResolvedValue({ invitations: [], yourMove: [], counts: { invitations: 0, yourMove: 0 } });
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(screen.queryByRole("link", { name: "Control panel" })).not.toBeInTheDocument();
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
