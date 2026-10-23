import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyStats } from "../src/api";
import { Leaderboard, YourMonth, computerStandings, standings } from "../src/pages/LobbyStats";

const stats: FamilyStats = {
  since: "2026-10-01T05:00:00.000Z",
  month: [
    { id: "mum", name: "Мама", game: "dots", played: 4, won: 3, drawn: 0 },
    { id: "mum", name: "Мама", game: "chess", played: 2, won: 1, drawn: 1 },
    { id: "dad", name: "Dad", game: "dots", played: 4, won: 1, drawn: 0 },
    { id: "kid", name: "Kid", game: "chess", played: 2, won: 0, drawn: 1 }
  ],
  all: [
    { id: "mum", name: "Мама", game: "dots", played: 10, won: 4, drawn: 0 },
    { id: "dad", name: "Dad", game: "dots", played: 12, won: 8, drawn: 0 }
  ],
  streak: 2,
  computer: {
    month: [
      // Kid's wins are fewer but harder: Hard is worth three Easy wins.
      { id: "kid", name: "Kid", game: "starbattle", played: 3, won: 2, drawn: 0, score: 6, best: "hard" },
      { id: "mum", name: "Мама", game: "chess", played: 6, won: 5, drawn: 0, score: 5, best: "easy" },
      { id: "dad", name: "Dad", game: "chess", played: 2, won: 0, drawn: 1, score: 0, best: null }
    ],
    all: [
      { id: "kid", name: "Kid", game: "starbattle", played: 3, won: 2, drawn: 0, score: 6, best: "hard" },
      { id: "mum", name: "Мама", game: "chess", played: 9, won: 7, drawn: 0, score: 9, best: "normal" }
    ]
  }
};

// The player cell is the avatar's initial, then the name: read the name.
const names = (table: HTMLElement) => within(table).getAllByRole("row").slice(1)
  .map((row) => within(row).getAllByRole("cell")[1].querySelector(".board-player > span:last-child")?.textContent);

describe("standings", () => {
  it("sums every game, or keeps one, most wins first and fewer games breaking a tie", () => {
    expect(standings(stats.month, null).map((s) => [s.id, s.won, s.played])).toEqual([["mum", 4, 6], ["dad", 1, 4], ["kid", 0, 2]]);
    expect(standings(stats.month, "chess").map((s) => s.id)).toEqual(["mum", "kid"]);
    expect(standings([
      { id: "a", name: "A", game: "dots", played: 9, won: 3, drawn: 0 },
      { id: "b", name: "B", game: "dots", played: 5, won: 3, drawn: 0 }
    ], null).map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("the leaderboard", () => {
  it("switches between this month and all time, and between games", async () => {
    const user = userEvent.setup();
    render(<Leaderboard stats={stats} myId="mum" />);
    const panel = screen.getByRole("region", { name: /Family leaderboard/ });
    expect(names(within(panel).getByRole("table"))).toEqual(["Мама (you)", "Dad", "Kid"]);

    await user.click(within(panel).getByRole("button", { name: "All time" }));
    expect(names(within(panel).getByRole("table"))).toEqual(["Dad", "Мама (you)"]);

    await user.click(within(panel).getByRole("button", { name: "This month" }));
    await user.click(within(panel).getByRole("button", { name: "Chess" }));
    expect(names(within(panel).getByRole("table"))).toEqual(["Мама (you)", "Kid"]);

    await user.click(within(panel).getByRole("button", { name: "Star Battle" }));
    expect(within(panel).queryByRole("table")).not.toBeInTheDocument();
    expect(panel).toHaveTextContent("No online games finished this month yet.");
    expect(panel).toHaveTextContent("Games against the computer, and with guests, don’t count.");
  });
});

describe("the vs Computer board", () => {
  it("ranks by points, then wins, then fewer games, and keeps the hardest level beaten", () => {
    expect(computerStandings(stats.computer.month, null).map((s) => [s.id, s.score])).toEqual([["kid", 6], ["mum", 5], ["dad", 0]]);
    expect(computerStandings([
      { id: "a", name: "A", game: "dots", played: 4, won: 2, drawn: 0, score: 4, best: "normal" },
      { id: "a", name: "A", game: "chess", played: 1, won: 1, drawn: 0, score: 3, best: "hard" },
      { id: "b", name: "B", game: "dots", played: 9, won: 7, drawn: 0, score: 7, best: "easy" }
    // Seven points each: the one with more wins goes first. A's hardest level
    // beaten is the Hard win in Chess, not Normal in Dots.
    ], null).map((s) => [s.id, s.score, s.won, s.best])).toEqual([
      ["b", 7, 7, { level: "easy", game: "dots" }],
      ["a", 7, 3, { level: "hard", game: "chess" }]
    ]);
  });

  it("is the leaderboard's second tab, with scores, wins of games played and its own footnote", async () => {
    const user = userEvent.setup();
    render(<Leaderboard stats={stats} myId="mum" />);
    const panel = screen.getByRole("region", { name: /Family leaderboard/ });
    expect(within(panel).getByRole("tab", { name: "Each other" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(panel).getByRole("tab", { name: "vs Computer" }));
    expect(within(panel).getByRole("tab", { name: "vs Computer" })).toHaveAttribute("aria-selected", "true");
    const table = within(panel).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Player", "Score", "Won"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Kid");
    expect(rows[0]).toHaveTextContent("Beat Hard in Star Battle");
    expect(rows[0]).toHaveTextContent("2 / 3");
    expect(rows[1]).toHaveTextContent("Мама (you)");
    expect(panel).toHaveTextContent("A win on Easy scores 1, on Normal 2, on Hard 3.");

    await user.click(within(panel).getByRole("button", { name: "Dots" }));
    expect(within(panel).queryByRole("table")).not.toBeInTheDocument();
    expect(panel).toHaveTextContent("No games against the computer finished this month yet.");

    await user.click(within(panel).getByRole("button", { name: "All time" }));
    await user.click(within(panel).getByRole("button", { name: "Chess" }));
    expect(within(panel).getByRole("table")).toHaveTextContent("Beat Normal in Chess");
  });
});

describe("your month", () => {
  it("shows what you played and won, the streak, and each game", () => {
    render(<YourMonth stats={stats} myId="mum" myName="Мама" />);
    const panel = screen.getByRole("region", { name: "Your month" });
    const figures = within(panel).getAllByRole("definition").map((d) => d.textContent);
    expect(figures).toEqual(["6", "4", "2"]);
    expect(panel).toHaveTextContent("67%");
    expect(panel).toHaveTextContent("wins in a row");
    expect(panel).toHaveTextContent("Dots3 of 4");
    expect(panel).toHaveTextContent("Chess1 of 2");
  });

  it("says so when you have not finished a game this month", () => {
    render(<YourMonth stats={{ ...stats, streak: 0 }} myId="nobody" myName="Nobody" />);
    expect(screen.getByRole("region", { name: "Your month" })).toHaveTextContent("You haven’t finished an online game this month yet.");
  });
});
