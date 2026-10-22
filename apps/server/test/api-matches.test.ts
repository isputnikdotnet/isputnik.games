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
