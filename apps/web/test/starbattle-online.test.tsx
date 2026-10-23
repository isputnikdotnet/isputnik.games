import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StarBattle, type StarBattleState, type Vessel } from "@isputnik/games-engine";
import type { MatchDetail } from "../src/api";
import { SessionContext } from "../src/session";
import { StarBattleMatchPage } from "../src/games/starbattle/StarBattleMatchPage";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchMatch: vi.fn(), postMove: vi.fn(), resignMatch: vi.fn(), answerMatch: vi.fn() };
});
import * as api from "../src/api";

const me = { id: "mum", name: "Мама", role: "member" as const, lang: "en", theme: "minimalist" };
const session = { status: "ready" as const, user: me, version: "test", stage: null };

const fleet = (row: number): Vessel[] => [
  { x: 0, y: row, length: 3, horizontal: true },
  { x: 4, y: row, length: 2, horizontal: true },
  { x: 7, y: row, length: 2, horizontal: true },
  { x: 0, y: row + 2, length: 1, horizontal: true },
  { x: 2, y: row + 2, length: 1, horizontal: true },
  { x: 4, y: row + 2, length: 1, horizontal: true }
];

const detail = (state: StarBattleState, over: Partial<MatchDetail> = {}): MatchDetail => ({
  id: "m1",
  game: "starbattle",
  options: { fleet: "small" },
  status: "playing",
  players: [{ id: "mum", name: "Мама" }, { id: "dad", name: "Dad" }],
  createdBy: "mum",
  moveCount: state.moveCount,
  turn: state.status.kind === "playing" ? state.status.turn : null,
  winner: state.status.kind === "finished" ? state.status.winner : null,
  finishReason: state.status.kind === "finished" ? state.status.reason : null,
  score: state.destroyed,
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
  finishedAt: null,
  state,
  feed: [],
  messages: [],
  ...over
});

const tapAt = (board: HTMLElement, x: number, y: number) => {
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 110, height: 110, right: 110, bottom: 110, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(board, { button: 0, clientX: (x + 1) * 10 + 5, clientY: (y + 1) * 10 + 5, pointerType: "mouse" });
};

const withSession = (ui: React.ReactElement) => render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>);

beforeEach(() => {
  window.history.replaceState(null, "", "/games/starbattle/m/m1");
});

describe("online Star Battle", () => {
  it("lays the fleet as the first move and then waits for the other side", async () => {
    const fresh = StarBattle.createGame({ fleet: "small" });
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(fresh));
    const deployed = StarBattle.applyMove(fresh, { kind: "place", vessels: fleet(0) });
    vi.mocked(api.postMove).mockResolvedValue(detail(StarBattle.viewFor(deployed, 0)));
    const user = userEvent.setup();
    withSession(<StarBattleMatchPage matchId="m1" />);

    expect(await screen.findByRole("heading", { name: "You, deploy your fleet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Random" }));
    await user.click(screen.getByRole("button", { name: "Ready" }));
    expect(api.postMove).toHaveBeenCalledTimes(1);
    const [, move, count] = vi.mocked(api.postMove).mock.calls[0];
    expect(count).toBe(0);
    expect((move as { kind: string }).kind).toBe("place");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Waiting for Dad to deploy the fleet"));
    // Own fleet shown, the other sector empty.
    expect(screen.getByRole("img", { name: "Your sector, 10 by 10" }).querySelectorAll(".star-vessel")).toHaveLength(6);
  });

  it("fires at the other sector and shows the server's answer, never their vessels", async () => {
    let state = StarBattle.createGame({ fleet: "small" });
    state = StarBattle.applyMove(state, { kind: "place", vessels: fleet(0) });
    state = StarBattle.applyMove(state, { kind: "place", vessels: fleet(5) });
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(StarBattle.viewFor(state, 0)));
    const afterHit = StarBattle.applyMove(state, { kind: "shoot", x: 0, y: 5 });
    vi.mocked(api.postMove).mockResolvedValue(detail(StarBattle.viewFor(afterHit, 0)));
    withSession(<StarBattleMatchPage matchId="m1" />);

    expect(await screen.findByRole("status")).toHaveTextContent("Your shot");
    const enemy = screen.getByRole("img", { name: "Enemy sector, 10 by 10" });
    expect(enemy.querySelectorAll(".star-vessel")).toHaveLength(0);
    tapAt(enemy, 0, 5);
    expect(api.postMove).toHaveBeenCalledWith("m1", { kind: "shoot", x: 0, y: 5 }, 2);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Damaged! Fire again."));
    expect(screen.getByText("You: A6 — damaged")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Enemy sector, 10 by 10" }).querySelectorAll(".star-hit")).toHaveLength(1);
  });

  it("announces the end with the vessels destroyed", async () => {
    let state = StarBattle.createGame({ fleet: "small" });
    state = StarBattle.applyMove(state, { kind: "place", vessels: fleet(0) });
    state = StarBattle.applyMove(state, { kind: "place", vessels: fleet(5) });
    for (const vessel of fleet(5)) for (const c of StarBattle.vesselCells(vessel)) state = StarBattle.applyMove(state, { kind: "shoot", x: c.x, y: c.y });
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(StarBattle.viewFor(state, 0), { status: "finished", finishedAt: "2026-10-23T01:00:00.000Z" }));
    withSession(<StarBattleMatchPage matchId="m1" />);
    const dialog = await screen.findByRole("dialog", { name: "Game over" });
    expect(dialog).toHaveTextContent("You win");
    expect(dialog).toHaveTextContent("You 6 : 0 Dad");
    expect(dialog).toHaveTextContent("Dad's fleet is destroyed.");
  });
});
