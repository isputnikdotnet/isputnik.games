import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChessPage } from "../src/games/chess/ChessPage";
import { setChessTheme } from "../src/games/chess/theme";

describe("Chess settings", () => {
  beforeEach(() => {
    setChessTheme("classic");
    localStorage.clear();
    window.history.replaceState(null, "", "/games/chess");
  });

  it("puts the chosen theme on the page and remembers it on this device", async () => {
    const user = userEvent.setup();
    render(<ChessPage />);
    await user.click(screen.getByRole("button", { name: "Two players, one screen" }));
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(document.documentElement.dataset.chessTheme).toBe("classic");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const choices = screen.getAllByRole("radio");
    expect(choices.map((choice) => choice.textContent)).toEqual([
      expect.stringContaining("Mono"),
      expect.stringContaining("Classic"),
      expect.stringContaining("Green"),
      expect.stringContaining("Slate"),
      expect.stringContaining("Walnut"),
      expect.stringContaining("Sputnik"),
      expect.stringContaining("Gzhel"),
      expect.stringContaining("Khokhloma")
    ]);
    // Two at one screen has no computer, so no level.
    expect(screen.queryByRole("group", { name: "Level" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Classic/ })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: /Walnut/ }));
    expect(screen.getByRole("radio", { name: /Walnut/ })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.chessTheme).toBe("walnut");
    expect(localStorage.getItem("isputnik-games-chess-theme")).toBe("walnut");

    // Back to the default: nothing left behind in storage.
    await user.click(screen.getByRole("radio", { name: /Classic/ }));
    expect(localStorage.getItem("isputnik-games-chess-theme")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
