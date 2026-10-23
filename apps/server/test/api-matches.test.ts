import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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

describe("matches API", () => {
  it("plays an invitation through to a move on each side", async () => {
    const created = await post("/games/api/matches", mum, {
      game: "dots", options: { size: 10, targetCaptures: null }, opponent: { id: "dad", name: "Dad" }, seat: 0
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    // Dad sees it waiting on him; a stranger does not see it at all.
    const dadList = await get("/games/api/matches", dad);
    expect(dadList.json().matches.map((m: { id: string }) => m.id)).toEqual([id]);
    expect((await get(`/games/api/matches/${id}`, as("kid", "Kid"))).statusCode).toBe(404);

    expect((await post(`/games/api/matches/${id}/accept`, dad)).json().status).toBe("playing");

    const early = await post(`/games/api/matches/${id}/moves`, dad, { move: { x: 1, y: 1 }, moveCount: 0 });
    expect(early.statusCode).toBe(409);

    const first = await post(`/games/api/matches/${id}/moves`, mum, { move: { x: 1, y: 1 }, moveCount: 0 });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ moveCount: 1, turn: 1, players: [{ name: "Мама" }, { name: "Dad" }] });

    const bad = await post(`/games/api/matches/${id}/moves`, dad, { move: { x: 1, y: 1 }, moveCount: 1 });
    expect(bad.statusCode).toBe(400);
    const stale = await post(`/games/api/matches/${id}/moves`, dad, { move: { x: 2, y: 2 }, moveCount: 0 });
    expect(stale.statusCode).toBe(409);
    const second = await post(`/games/api/matches/${id}/moves`, dad, { move: { x: 2, y: 2 }, moveCount: 1 });
    expect(second.json().state.status).toEqual({ kind: "playing", turn: 0 });

    const resigned = await post(`/games/api/matches/${id}/resign`, mum);
    expect(resigned.json()).toMatchObject({ status: "finished", winner: 1, finishReason: "resigned" });
  });

  it("summarises what waits on the signed-in member", async () => {
    expect((await get("/games/api/summary", {})).statusCode).toBe(401);
    const created = await post("/games/api/matches", mum, {
      game: "dots", options: { size: 10, targetCaptures: null }, opponent: { id: "dad", name: "Dad" }, seat: 0
    });
    const id = created.json().id as string;

    const invited = await get("/games/api/summary", dad);
    expect(invited.statusCode).toBe(200);
    expect(invited.json()).toEqual({
      invitations: [{ id, game: "dots", from: { id: "mum", name: "Мама" }, createdAt: expect.any(String) }],
      yourMove: [],
      counts: { invitations: 1, yourMove: 0 }
    });
    expect((await get("/games/api/summary", mum)).json().counts).toEqual({ invitations: 0, yourMove: 0 });

    await post(`/games/api/matches/${id}/accept`, dad);
    const playing = await get("/games/api/summary", mum);
    expect(playing.json()).toEqual({
      invitations: [],
      yourMove: [{ id, game: "dots", opponent: { id: "dad", name: "Dad" }, updatedAt: expect.any(String) }],
      counts: { invitations: 0, yourMove: 1 }
    });
    expect((await get("/games/api/summary", dad)).json().counts.yourMove).toBe(0);
  });

  it("validates the request body and requires identity", async () => {
    expect((await get("/games/api/matches", {})).statusCode).toBe(401);
    const bad = await post("/games/api/matches", mum, { game: "dots", opponent: { id: "" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("Invalid request");
    const unknown = await post("/games/api/matches", mum, { game: "chess", options: {}, opponent: { id: "dad", name: "Dad" } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error).toBe("Unknown game");
  });

  it("sends each player of Star Battle their own view: the other fleet stays on the server", async () => {
    const fleet = (shift: number) => [
      { x: 0, y: shift, length: 3, horizontal: true },
      { x: 4, y: shift, length: 2, horizontal: true },
      { x: 7, y: shift, length: 2, horizontal: true },
      { x: 0, y: shift + 2, length: 1, horizontal: true },
      { x: 2, y: shift + 2, length: 1, horizontal: true },
      { x: 4, y: shift + 2, length: 1, horizontal: true }
    ];
    const created = await post("/games/api/matches", mum, {
      game: "starbattle", options: { fleet: "small", extra: true }, opponent: { id: "dad", name: "Dad" }, seat: 0
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().options).toEqual({ fleet: "small" });
    const id = created.json().id as string;
    await post(`/games/api/matches/${id}/accept`, dad);

    // A shot before the fleets are deployed is illegal; mum lays hers, then dad his.
    expect((await post(`/games/api/matches/${id}/moves`, mum, { move: { kind: "shoot", x: 0, y: 0 }, moveCount: 0 })).statusCode).toBe(400);
    const deployed = await post(`/games/api/matches/${id}/moves`, mum, { move: { kind: "place", vessels: fleet(0) }, moveCount: 0 });
    expect(deployed.statusCode).toBe(200);
    expect(deployed.json().state.vessels).toEqual([fleet(0), null]);
    expect(deployed.json().turn).toBe(1);

    // Dad's view before he lays his own: mum's fleet is there as "deployed", not as vessels.
    const dadView = (await get(`/games/api/matches/${id}`, dad)).json();
    expect(dadView.state.placed).toEqual([true, false]);
    expect(dadView.state.vessels).toEqual([[], null]);

    await post(`/games/api/matches/${id}/moves`, dad, { move: { kind: "place", vessels: fleet(5) }, moveCount: 1 });
    // Mum fires first; a hit keeps the turn, a miss passes it.
    const hit = await post(`/games/api/matches/${id}/moves`, mum, { move: { kind: "shoot", x: 0, y: 5 }, moveCount: 2 });
    expect(hit.json().state.lastShot).toEqual({ by: 0, x: 0, y: 5, result: "hit" });
    expect(hit.json().turn).toBe(0);
    expect(hit.json().state.vessels[1]).toEqual([]);
    const destroyed = await post(`/games/api/matches/${id}/moves`, mum, { move: { kind: "shoot", x: 0, y: 7 }, moveCount: 3 });
    expect(destroyed.json().state.lastShot.result).toBe("destroyed");
    expect(destroyed.json().state.vessels[1]).toEqual([{ x: 0, y: 7, length: 1, horizontal: true }]);
    expect(destroyed.json().score).toEqual([1, 0]);
    const miss = await post(`/games/api/matches/${id}/moves`, mum, { move: { kind: "shoot", x: 9, y: 9 }, moveCount: 4 });
    expect(miss.json().turn).toBe(1);
    // The JSON dad gets never carries mum's unsunk vessels, anywhere.
    const dadNow = (await get(`/games/api/matches/${id}`, dad)).json();
    expect(dadNow.state.vessels[0]).toEqual([]);
    expect(dadNow.state.vessels[1]).toEqual(fleet(5));
    expect(JSON.stringify(dadNow)).not.toContain('{"x":0,"y":0,"length":3');
  });

  it("carries the feed and the talk with every view of a match", async () => {
    const created = await post("/games/api/matches", mum, {
      game: "dots", options: { size: 10, targetCaptures: null }, opponent: { id: "dad", name: "Dad" }, seat: 0
    });
    const id = created.json().id as string;
    // Nothing to say before the other side has accepted.
    expect((await post(`/games/api/matches/${id}/messages`, mum, { text: "hurry up" })).statusCode).toBe(409);
    await post(`/games/api/matches/${id}/accept`, dad);

    const moved = await post(`/games/api/matches/${id}/moves`, mum, { move: { x: 1, y: 1 }, moveCount: 0 });
    expect(moved.json().feed).toEqual([{ by: 0, kind: "dot", x: 1, y: 1, captured: 0, lost: false }]);
    expect(moved.json().messages).toEqual([]);

    const said = await post(`/games/api/matches/${id}/messages`, dad, { text: "  nice   opening " });
    expect(said.statusCode).toBe(201);
    expect(said.json().messages).toEqual([{ id: 1, by: 1, text: "nice opening", afterMove: 1, at: expect.any(String) }]);
    expect((await post(`/games/api/matches/${id}/messages`, dad, { text: "   " })).statusCode).toBe(400);
    expect((await post(`/games/api/matches/${id}/messages`, dad, { text: "x".repeat(121) })).statusCode).toBe(400);
    expect((await post(`/games/api/matches/${id}/messages`, as("kid", "Kid"), { text: "hi" })).statusCode).toBe(404);

    const view = (await get(`/games/api/matches/${id}`, mum)).json();
    expect(view.feed).toHaveLength(1);
    expect(view.messages).toHaveLength(1);
  });

  it("offers a made-up family in standalone development only", async () => {
    expect((await get("/games/api/dev/members", mum)).statusCode).toBe(404);
    const dev = await buildApp({ gatewaySecret: null, devUser: "dev:Developer:admin", staticPath: "", dbPath: ":memory:", version: "0.0.0-test", stage: null });
    try {
      const res = await dev.inject({ method: "GET", url: "/games/api/dev/members" });
      expect(res.statusCode).toBe(200);
      expect(res.json().members[0]).toEqual({ id: "dev", name: "Developer" });
    } finally {
      await dev.close();
    }
  });
});
