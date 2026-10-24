import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dominoes, seededRandom, type DominoesMove, type DominoesState } from "@isputnik/games-engine";
import { DominoesPage } from "../src/games/dominoes/DominoesPage";
import { playsOfTile } from "../src/games/dominoes/DominoesTable";
import { loadDominoesGame } from "../src/games/dominoes/storage";
import { COMPUTER_DELAYS } from "../src/games/dominoes/useDominoesGame";

vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  reportComputerResult: vi.fn(async () => ({ recorded: true }))
}));

// The computer answers at once instead of pausing for a person to follow.
COMPUTER_DELAYS.play = 0;
COMPUTER_DELAYS.draw = 0;
COMPUTER_DELAYS.pass = 0;

type Play = Extract<DominoesMove, { kind: "play" }>;

/** A game played out at random until it is the person's move (seat 0) in a
 *  position `wanted` likes; saved to the device as the game in progress. */
function saveWhere(wanted: (state: DominoesState) => boolean, target: 101 | 51 = 101): DominoesState {
  for (let seed = 1; seed < 2000; seed++) {
    const random = seededRandom(seed * 13 + 1);
    let state = Dominoes.createGame({ target }, seed);
    const moves: DominoesMove[] = [];
    for (let guard = 0; guard < 600 && state.status.kind === "playing"; guard++) {
      if (state.status.turn === 0 && wanted(state)) {
        localStorage.setItem("isputnik-games.dominoes.local", JSON.stringify({
          setup: { target, level: "easy" }, key: `test-${seed}-${guard}`, seed, moves, finished: null
        }));
        return state;
      }
      const legal = Dominoes.legalMoves(state);
      const move = legal[Math.floor(random() * legal.length)];
      state = Dominoes.applyMove(state, move);
      moves.push(move);
    }
  }
  throw new Error("No game reached the position");
}

const playsOf = (state: DominoesState) => Dominoes.legalMoves(state).filter((m): m is Play => m.kind === "play");
const name = (tile: readonly number[]) => `${tile[0]}:${tile[1]}`;
/** The person holds one tile, and it goes down at a tap: the next play goes out. */
const goesOut = (s: DominoesState) => s.hands[0].length === 1 && playsOfTile(s, playsOf(s), s.hands[0][0]).length === 1;

describe("DominoesPage, against the computer", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/games/dominoes");
  });

  it("opens on the new-game dialog: how far to play and the level, no seat to pick", async () => {
    const user = userEvent.setup();
    render(<DominoesPage />);
    const dialog = screen.getByRole("dialog", { name: "New game" });
    expect(within(dialog).getByRole("group", { name: "Play to" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Computer's level" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "51 — a quick game" }));
    await user.click(within(dialog).getByRole("button", { name: "Start game" }));
    expect(screen.getByRole("group", { name: "Dominoes table" })).toBeInTheDocument();
    expect(screen.getByText("First to 51 is «козёл»")).toBeInTheDocument();
    expect(loadDominoesGame()?.setup.target).toBe(51);
    // Whoever holds the lowest double leads; either way it ends on the person's move.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/You lead|Your move|draw|pass/));
  });

  it("lays a tile that fits one end at a tap, and the computer answers", async () => {
    const user = userEvent.setup();
    const state = saveWhere((s) => s.line.length > 0 && playsOf(s).some((p) => playsOfTile(s, playsOf(s), p.tile).length === 1));
    const tile = playsOf(state).find((p) => playsOfTile(state, playsOf(state), p.tile).length === 1)!.tile;
    render(<DominoesPage />);
    await user.click(screen.getByRole("button", { name: `${name(tile)}, fits` }));
    expect(screen.queryByRole("button", { name: `${name(tile)}, fits` })).not.toBeInTheDocument();
    const log = screen.getByRole("log");
    await waitFor(() => expect(within(log).getAllByText(new RegExp(`${name(tile)} on the (left|right)`)).length).toBeGreaterThan(0));
    // Tiles that fit nothing cannot be pressed.
    for (const button of screen.getAllByRole("button", { name: /^\d:\d$/ })) expect(button).toBeDisabled();
  });

  it("asks which end when a tile fits both, and lays it on the one tapped", async () => {
    const user = userEvent.setup();
    const state = saveWhere((s) => playsOf(s).some((p) => playsOfTile(s, playsOf(s), p.tile).length === 2));
    const tile = playsOf(state).find((p) => playsOfTile(state, playsOf(state), p.tile).length === 2)!.tile;
    render(<DominoesPage />);
    await user.click(screen.getByRole("button", { name: `${name(tile)}, fits` }));
    expect(screen.getByRole("status")).toHaveTextContent(`Tap a lit end to lay ${name(tile)}.`);
    const left = screen.getByRole("button", { name: `Lay ${name(tile)} on the left end` });
    expect(screen.getByRole("button", { name: `Lay ${name(tile)} on the right end` })).toBeInTheDocument();
    const before = loadDominoesGame()!.moves.length;
    await user.click(left);
    expect(loadDominoesGame()!.moves[before]).toEqual({ kind: "play", tile, end: "left" });
  });

  it("draws from the boneyard when nothing fits", async () => {
    const user = userEvent.setup();
    const state = saveWhere((s) => Dominoes.legalMoves(s)[0].kind === "draw");
    render(<DominoesPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing fits — draw from the boneyard.");
    await user.click(screen.getByRole("button", { name: "Draw a tile" }));
    expect(loadDominoesGame()!.state.boneyardCount).toBe(state.boneyardCount - 1);
  });

  it("sums up a finished hand and holds the computer until the person plays on", async () => {
    const user = userEvent.setup();
    const state = saveWhere((s) => goesOut(s) && s.totals[1] + Dominoes.handPips(s.hands[1]) < 101);
    render(<DominoesPage />);
    await user.click(screen.getByRole("button", { name: `${name(state.hands[0][0])}, fits` }));
    const dialog = await screen.findByRole("dialog", { name: "You went out" });
    expect(within(dialog).getByText(/Computer collects \d+\./)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The hand is over.");
    const moves = loadDominoesGame()!.moves.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(loadDominoesGame()!.moves.length).toBe(moves);
    await user.click(within(dialog).getByRole("button", { name: "Play on" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(`Hand ${state.hand + 1}`)).toBeInTheDocument();
  });

  it("ends the game when the computer reaches the target", async () => {
    const user = userEvent.setup();
    // The person goes out with the computer close enough to 51 that its hand takes it over.
    const state = saveWhere((s) => goesOut(s) && s.totals[1] + Dominoes.handPips(s.hands[1]) >= 51, 51);
    expect(state.status.kind).toBe("playing");
    render(<DominoesPage />);
    await user.click(screen.getByRole("button", { name: `${name(state.hands[0][0])}, fits` }));
    const dialog = await screen.findByRole("dialog", { name: "Computer is «козёл»" });
    expect(within(dialog).getByText("Game over")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You win — the computer is «козёл»");
    await user.click(within(dialog).getByRole("button", { name: "New game" }));
    expect(screen.getByRole("dialog", { name: "New game" })).toBeInTheDocument();
  });

  it("leaves the game after a confirmation", async () => {
    const user = userEvent.setup();
    saveWhere((s) => s.line.length > 0);
    render(<DominoesPage />);
    await user.click(screen.getByRole("button", { name: "Exit game" }));
    const dialog = screen.getByRole("dialog", { name: "Leave this game?" });
    await user.click(within(dialog).getByRole("button", { name: "Exit game" }));
    expect(loadDominoesGame()).toBeNull();
  });
});
