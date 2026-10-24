import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { Dominoes, type DominoesMove, type DominoesState, type Tile } from "@isputnik/games-engine";
import { buildApp } from "../src/app.js";

const SECRET = "s3cret-s3cret-s3cret";

const as = (id: string, name: string) => ({
  "x-isputnik-gateway": SECRET,
  "x-isputnik-user-id": id,
  "x-isputnik-user-name": encodeURIComponent(name),
  "x-isputnik-user-role": "member"
});
const mum = as("mum", "Мама");
const dad = as("dad", "Dad");
const seats = [mum, dad];

let app: FastifyInstance;
beforeEach(async () => {
  app = await buildApp({ gatewaySecret: SECRET, devUser: null, staticPath: "", dbPath: ":memory:", version: "0.0.0-test", stage: null });
});
afterEach(async () => {
  await app.close();
});

const post = (url: string, headers: Record<string, string>, payload?: unknown) =>
  app.inject({ method: "POST", url, headers, ...(payload === undefined ? {} : { payload }) });
const get = (url: string, headers: Record<string, string>) => app.inject({ method: "GET", url, headers });

async function newMatch(): Promise<string> {
  const created = await post("/games/api/matches", mum, { game: "dominoes", options: { target: 51, seed: 7 }, opponent: { id: "dad", name: "Dad" }, seat: 0 });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
}

const key = (tile: Tile) => `${tile[0]}:${tile[1]}`;

describe("Dominoes online", () => {
  it("deals from a seed the players never see, and keeps each hand to its seat", async () => {
    const id = await newMatch();
    const created = (await get(`/games/api/matches/${id}`, mum)).json();
    // The options are only what the game reads: a seed sent by the client is dropped.
    expect(created.options).toEqual({ target: 51 });

    const asMum = (await get(`/games/api/matches/${id}`, mum)).json().state as DominoesState;
    const asDad = (await get(`/games/api/matches/${id}`, dad)).json().state as DominoesState;
    expect(asMum.seed).toBe(0);
    expect(asMum.boneyard).toEqual([]);
    expect(asMum.hands[0]).toHaveLength(7);
    expect(asMum.hands[1]).toEqual([]);
    expect(asDad.hands[0]).toEqual([]);
    expect(asDad.hands[1]).toHaveLength(7);
    const mine = new Set(asMum.hands[0].map(key));
    expect(asDad.hands[1].some((tile) => mine.has(key(tile)))).toBe(false);
    // Nothing the server sends names a tile of the other hand — but the tile
    // that must open the game, which a table announces anyway (the turn says
    // who holds it).
    const sent = (await get(`/games/api/matches/${id}`, mum)).json();
    // Pairs of numbers that are not tiles: the totals, the hand counts, the score.
    delete sent.state.totals;
    delete sent.state.handCounts;
    delete sent.score;
    const raw = JSON.stringify(sent);
    for (const tile of asDad.hands[1]) {
      if (asMum.mustLead && key(tile) === key(asMum.mustLead)) continue;
      expect(raw).not.toContain(`[${tile[0]},${tile[1]}]`);
    }
    const list = (await get("/games/api/matches", mum)).body;
    expect(list).not.toMatch(/"seed":[1-9]/);
  });

  it("gives the first move to whoever holds the lead tile, and plays to the end", async () => {
    const id = await newMatch();
    await post(`/games/api/matches/${id}/accept`, dad);
    let match = (await get(`/games/api/matches/${id}`, mum)).json();
    // The lead's holder is the one whose view shows mustLead in their own hand.
    const views = await Promise.all(seats.map(async (who) => (await get(`/games/api/matches/${id}`, who)).json().state as DominoesState));
    const lead = views[0].mustLead!;
    const holder = views[0].hands[0].some((t) => key(t) === key(lead)) ? 0 : 1;
    expect(match.turn).toBe(holder);

    // Both play their own view's first legal move until the match is over.
    for (let guard = 0; guard < 2000 && match.status === "playing"; guard++) {
      const seat = match.turn as 0 | 1;
      const view = (await get(`/games/api/matches/${id}`, seats[seat])).json();
      const move: DominoesMove = Dominoes.legalMoves(view.state as DominoesState)[0];
      const answer = await post(`/games/api/matches/${id}/moves`, seats[seat], { move, moveCount: view.moveCount });
      expect(answer.statusCode).toBe(200);
      match = answer.json();
      // A draw never says what was drawn: not in the feed, not in the move.
      const last = match.feed[match.feed.length - 1];
      if (move.kind === "draw") expect(last).toEqual({ by: seat, kind: "draw" });
    }
    expect(match.status).toBe("finished");
    expect(match.finishReason).toBe("target");
    const loser = match.winner === 0 ? 1 : 0;
    expect(match.score[loser]).toBeGreaterThanOrEqual(51);
  });
});
