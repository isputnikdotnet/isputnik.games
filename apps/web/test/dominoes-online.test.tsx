import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dominoes, narrateMoves, dominoes, seededRandom, type DominoesMove, type DominoesState } from "@isputnik/games-engine";
import type { MatchDetail } from "../src/api";
import { SessionContext } from "../src/session";
import { DominoesMatchPage } from "../src/games/dominoes/DominoesMatchPage";
import { playsOfTile } from "../src/games/dominoes/DominoesTable";
import { scoreText } from "../src/shared/score";
import i18n from "../src/i18n";

vi.mock("../src/api", async () => {
  const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
  return { ...actual, fetchMatch: vi.fn(), postMove: vi.fn(), resignMatch: vi.fn(), answerMatch: vi.fn() };
});
import * as api from "../src/api";

const me = { id: "mum", name: "Мама", role: "member" as const, lang: "en", theme: "minimalist" };
const session = { status: "ready" as const, user: me, guests: true, version: "test", stage: null };
const withSession = (ui: React.ReactElement) => render(<SessionContext.Provider value={session}>{ui}</SessionContext.Provider>);

type Play = Extract<DominoesMove, { kind: "play" }>;
const playsOf = (s: DominoesState) => Dominoes.legalMoves(s).filter((m): m is Play => m.kind === "play");
const name = (tile: readonly number[]) => `${tile[0]}:${tile[1]}`;

/** A match as the server sends it to mum (seat 0): her view, the feed, the score. */
function detail(seed: number, moves: DominoesMove[], over: Partial<MatchDetail> = {}): MatchDetail {
  const { state, events } = narrateMoves(dominoes, { target: 51 }, moves, seed);
  return {
    id: "m1",
    game: "dominoes",
    options: { target: 51 },
    status: state.status.kind === "finished" ? "finished" : "playing",
    players: [{ id: "mum", name: "Мама" }, { id: "dad", name: "Dad" }],
    createdBy: "mum",
    moveCount: moves.length,
    turn: state.status.kind === "playing" ? state.status.turn : null,
    winner: state.status.kind === "finished" ? state.status.winner : null,
    finishReason: state.status.kind === "finished" ? state.status.reason : null,
    score: state.totals,
    createdAt: "2026-10-23T00:00:00.000Z",
    updatedAt: "2026-10-23T00:00:00.000Z",
    finishedAt: null,
    state: Dominoes.viewFor(state, 0),
    feed: events,
    messages: [],
    ...over
  };
}

/** Random moves from a seed until it is mum's move in a position `wanted` likes. */
function reach(wanted: (s: DominoesState) => boolean): { seed: number; moves: DominoesMove[]; state: DominoesState } {
  for (let seed = 1; seed < 2000; seed++) {
    const random = seededRandom(seed);
    let state = Dominoes.createGame({ target: 51 }, seed);
    const moves: DominoesMove[] = [];
    for (let guard = 0; guard < 600 && state.status.kind === "playing"; guard++) {
      if (state.status.turn === 0 && wanted(state)) return { seed, moves, state };
      const legal = Dominoes.legalMoves(state);
      const move = legal[Math.floor(random() * legal.length)];
      state = Dominoes.applyMove(state, move);
      moves.push(move);
    }
  }
  throw new Error("not reached");
}

beforeEach(() => {
  vi.mocked(api.postMove).mockReset();
  window.history.replaceState(null, "", "/games/dominoes/m/m1");
});

describe("online Dominoes", () => {
  it("shows only mum's own hand and sends her tile with the move count she saw", async () => {
    const { seed, moves, state } = reach((s) => s.line.length > 0 && playsOf(s).some((p) => playsOfTile(s, playsOf(s), p.tile).length === 1));
    const play = playsOf(state).find((p) => playsOfTile(state, playsOf(state), p.tile).length === 1)!;
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(seed, moves));
    vi.mocked(api.postMove).mockResolvedValue(detail(seed, [...moves, play]));
    const user = userEvent.setup();
    withSession(<DominoesMatchPage matchId="m1" />);

    await screen.findByRole("group", { name: "Dominoes table" });
    // Her tiles are buttons; Dad's are only a count.
    expect(screen.getAllByRole("button", { name: /^\d:\d(, fits)?$/ })).toHaveLength(state.hands[0].length);
    expect(screen.getByText(`Dad · ${state.hands[1].length} ${state.hands[1].length === 1 ? "tile" : "tiles"}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `${name(play.tile)}, fits` }));
    expect(api.postMove).toHaveBeenCalledWith("m1", play, moves.length);
  });

  it("sums up a hand that ends while the page is open, not the ones before it", async () => {
    const { seed, moves, state } = reach((s) => s.history.length >= 1 && s.hands[0].length === 1
      && playsOfTile(s, playsOf(s), s.hands[0][0]).length === 1 && s.totals[1] + Dominoes.handPips(s.hands[1]) < 51);
    const play = playsOf(state)[0];
    vi.mocked(api.fetchMatch).mockResolvedValue(detail(seed, moves));
    vi.mocked(api.postMove).mockResolvedValue(detail(seed, [...moves, play]));
    const user = userEvent.setup();
    withSession(<DominoesMatchPage matchId="m1" />);

    await screen.findByRole("group", { name: "Dominoes table" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `${name(state.hands[0][0])}, fits` }));
    const dialog = await screen.findByRole("dialog", { name: "You went out" });
    expect(within(dialog).getByText(/Dad collects \d+\./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Play on" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("marks a penalty score in lists, so the lower total reads as the lead", () => {
    const t = i18n.t.bind(i18n) as Parameters<typeof scoreText>[1];
    expect(scoreText({ game: "dominoes", score: [12, 54], options: { target: 101 } }, t)).toBe("12 : 54 towards 101, fewer leads");
    expect(scoreText({ game: "dots", score: [3, 1], options: {} }, t)).toBe("3 : 1");
    expect(scoreText({ game: "chess", score: null, options: {} }, t)).toBeNull();
  });
});
