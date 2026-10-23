import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeaBattle, type SeaBattleState, type Ship } from "@isputnik/games-engine";
import type { MatchDetail } from "../src/api";
import { SessionContext } from "../src/session";
import { SeaBattleMatchPage } from "../src/games/seabattle/SeaBattleMatchPage";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchMatch: vi.fn(), postMove: vi.fn(), resignMatch: vi.fn(), answerMatch: vi.fn() };
});
import * as api from "../src/api";

const me = { id: "mum", name: "Мама", role: "member" as const, lang: "en", theme: "minimalist" };
const session = { status: "ready" as const, user: me, version: "test" };

const fleet = (row: number): Ship[] => [
  { x: 0, y: row, length: 3, horizontal: true },
  { x: 4, y: row, length: 2, horizontal: true },
  { x: 7, y: row, length: 2, horizontal: true },
  { x: 0, y: row + 2, length: 1, horizontal: true },
  { x: 2, y: row + 2, length: 1, horizontal: true },
  { x: 4, y: row + 2, length: 1, horizontal: true }
];

const detail = (state: SeaBattleState, over: Partial<MatchDetail> = {}): MatchDetail => ({
  id: "m1",
  game: "seabattle",
  options: { fleet: "small" },
  status: "playing",
  players: [{ id: "mum", name: "Мама" }, { id: "dad", name: "Dad" }],
  createdBy: "mum",
  moveCount: state.moveCount,
  turn: state.status.kind === "playing" ? state.status.turn : null,
  winner: state.status.kind === "finished" ? state.status.winner : null,
  finishReason: state.status.kind === "finished" ? state.status.reason : null,
  score: state.sunk,
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
  finishedAt: null,
  state,
  ...over
});

const tapAt = (board: HTMLElement, x: number, y: number) => {
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 110, height: 110, right: 110, bottom: 110, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(board, { button: 0, clientX: (x + 1) * 10 + 5, clientY: (y + 1) * 10 + 5, pointerType: "mouse" });
};

const withSession = (ui: React.ReactElement) => render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>);

beforeEach(() => {
  window.history.replaceState(null, "", "/games/seabattle/m/m1");
});

describe("online Sea Battle", () => {
  it("lays the fleet as the first move and then waits for the other side", async () => {
    const fresh = SeaBattle.createGame({ fleet: "small" });
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(fresh));
    const laid = SeaBattle.applyMove(fresh, { kind: "place", ships: fleet(0) });
    vi.mocked(api.postMove).mockResolvedValue(detail(SeaBattle.viewFor(laid, 0)));
    const user = userEvent.setup();
    withSession(<SeaBattleMatchPage matchId="m1" />);

    expect(await screen.findByRole("heading", { name: "You, lay your fleet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Random" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));
    expect(api.postMove).toHaveBeenCalledTimes(1);
    const [, move, count] = vi.mocked(api.postMove).mock.calls[0];
    expect(count).toBe(0);
    expect((move as { kind: string }).kind).toBe("place");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Waiting for Dad to lay the fleet"));
    // Own fleet shown, the other sea empty.
    expect(screen.getByRole("img", { name: "Your sea, 10 by 10" }).querySelectorAll(".sea-ship")).toHaveLength(6);
  });

  it("fires at the other sea and shows the server's answer, never their ships", async () => {
    let state = SeaBattle.createGame({ fleet: "small" });
    state = SeaBattle.applyMove(state, { kind: "place", ships: fleet(0) });
    state = SeaBattle.applyMove(state, { kind: "place", ships: fleet(5) });
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(SeaBattle.viewFor(state, 0)));
    const afterHit = SeaBattle.applyMove(state, { kind: "shoot", x: 0, y: 5 });
    vi.mocked(api.postMove).mockResolvedValue(detail(SeaBattle.viewFor(afterHit, 0)));
    withSession(<SeaBattleMatchPage matchId="m1" />);

    expect(await screen.findByRole("status")).toHaveTextContent("Your shot");
    const enemy = screen.getByRole("img", { name: "Enemy sea, 10 by 10" });
    expect(enemy.querySelectorAll(".sea-ship")).toHaveLength(0);
    tapAt(enemy, 0, 5);
    expect(api.postMove).toHaveBeenCalledWith("m1", { kind: "shoot", x: 0, y: 5 }, 2);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Hit! Fire again."));
    expect(screen.getByText("You: A6 — hit")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Enemy sea, 10 by 10" }).querySelectorAll(".sea-hit")).toHaveLength(1);
  });

  it("announces the end with the ships sunk", async () => {
    let state = SeaBattle.createGame({ fleet: "small" });
    state = SeaBattle.applyMove(state, { kind: "place", ships: fleet(0) });
    state = SeaBattle.applyMove(state, { kind: "place", ships: fleet(5) });
    for (const ship of fleet(5)) for (const c of SeaBattle.shipCells(ship)) state = SeaBattle.applyMove(state, { kind: "shoot", x: c.x, y: c.y });
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(SeaBattle.viewFor(state, 0), { status: "finished", finishedAt: "2026-10-23T01:00:00.000Z" }));
    withSession(<SeaBattleMatchPage matchId="m1" />);
    const dialog = await screen.findByRole("dialog", { name: "Game over" });
    expect(dialog).toHaveTextContent("You win");
    expect(dialog).toHaveTextContent("You 6 : 0 Dad");
    expect(dialog).toHaveTextContent("Dad's fleet is sunk.");
  });
});
