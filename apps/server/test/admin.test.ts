// The admin's window (docs/plan.md → Logging): the events a match leaves behind,
// the refused callers, and the log tail — all behind the gateway's admin role.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { BODY_LIMIT, buildApp } from "../src/app.js";
import { createLogBuffer } from "../src/log-buffer.js";

const SECRET = "s3cret-s3cret-s3cret";

const as = (id: string, name: string, role: "admin" | "member" = "member") => ({
  "x-isputnik-gateway": SECRET,
  "x-isputnik-user-id": id,
  "x-isputnik-user-name": encodeURIComponent(name),
  "x-isputnik-user-role": role,
  "x-isputnik-client-ip": "192.168.2.10",
  "x-isputnik-request-id": `home-${id}`
});
const admin = as("admin", "Admin", "admin");
const mum = as("mum", "Мама");
const dad = as("dad", "Dad");

let app: FastifyInstance;
let logBuffer = createLogBuffer(100, { write: () => undefined });
beforeEach(async () => {
  logBuffer = createLogBuffer(100, { write: () => undefined });
  app = await buildApp({
    gatewaySecret: SECRET, devUser: null, staticPath: "", dbPath: ":memory:", version: "0.0.0-test", stage: null,
    logBuffer,
    fastify: { logger: { level: "info", stream: logBuffer } }
  });
});
afterEach(async () => {
  await app.close();
});

const post = (url: string, headers: Record<string, string>, payload?: unknown) =>
  app.inject({ method: "POST", url, headers, ...(payload === undefined ? {} : { payload }) });
const get = (url: string, headers: Record<string, string>) => app.inject({ method: "GET", url, headers });
const events = async (query = "") => (await get(`/games/api/admin/events${query}`, admin)).json();

describe("admin routes", () => {
  it("answer an admin only", async () => {
    expect((await get("/games/api/admin/events", {})).statusCode).toBe(401);
    expect((await get("/games/api/admin/events", mum)).statusCode).toBe(403);
    expect((await get("/games/api/admin/log", mum)).statusCode).toBe(403);
    expect((await get("/games/api/admin/events", admin)).statusCode).toBe(200);
    expect((await get("/games/api/admin/log", admin)).statusCode).toBe(200);
  });

  it("record a refused caller, with why but never the secret", async () => {
    await get("/games/api/matches", {});
    await get("/games/api/me", { "x-isputnik-gateway": "guess-the-secret", "x-isputnik-user-id": "x", "x-isputnik-user-role": "admin" });
    // Health is open and leaves nothing: the home server probes it without headers.
    await get("/games/api/health", {});
    const page = await events("?event=gateway");
    expect(page.events.map((e: { detail: string }) => e.detail)).toEqual([
      "GET /games/api/me: wrong gateway secret",
      "GET /games/api/matches: no gateway header"
    ]);
    expect(page.rejected24h).toBe(2);
    expect(JSON.stringify(page)).not.toContain("guess-the-secret");
    const warned = logBuffer.tail(100).map((line) => JSON.parse(line) as { level: number; reason?: string }).filter((line) => line.reason);
    expect(warned.map((line) => line.reason)).toEqual(["no gateway header", "wrong gateway secret"]);
  });

  it("leave the trail of a match, naming who and from where", async () => {
    const created = await post("/games/api/matches", mum, {
      game: "dots", options: { size: 10, targetCaptures: null, padding: "x".repeat(2000) }, opponent: { id: "dad", name: "Dad" }, seat: 0
    });
    const id = created.json().id as string;
    // Only what the game reads was stored.
    expect(created.json().options).toEqual({ size: 10, targetCaptures: null });

    await post(`/games/api/matches/${id}/accept`, dad);
    await post(`/games/api/matches/${id}/moves`, dad, { move: { x: 1, y: 1 }, moveCount: 0 }); // not his turn
    await post(`/games/api/matches/${id}/moves`, mum, { move: { x: 1, y: 1, note: "dropped" }, moveCount: 0 });
    await post(`/games/api/matches/${id}/moves`, dad, { move: { x: 1, y: 1 }, moveCount: 1 }); // taken
    await post(`/games/api/matches/${id}/moves`, dad, { move: "nope", moveCount: 1 });
    await post(`/games/api/matches/${id}/resign`, dad);

    const detail = await get(`/games/api/matches/${id}`, mum);
    expect(detail.json().state.moves).toEqual([{ x: 1, y: 1 }]);

    const page = await events();
    expect(page.events.map((e: { event: string; actorId: string | null; matchId: string | null }) => [e.event, e.actorId, e.matchId])).toEqual([
      ["match.resigned", "dad", id],
      ["move.illegal", "dad", id],
      ["move.illegal", "dad", id],
      ["move.refused", "dad", id],
      ["match.accepted", "dad", id],
      ["match.created", "mum", id]
    ]);
    const created0 = page.events.at(-1);
    expect(created0).toMatchObject({ level: "info", actorName: "Мама", ip: "192.168.2.10", requestId: "home-mum", detail: "dots: invited Dad (dad), plays first" });
    expect(page.events[0].detail).toBe("dots: resigned against Мама (mum) after 1 moves");
    expect(page.facets.event).toEqual(["match.accepted", "match.created", "match.resigned", "move.illegal", "move.refused"]);
    expect(page.retentionDays).toBe(90);
    expect((await events("?level=warn")).events.every((e: { level: string }) => e.level === "warn")).toBe(true);
    expect((await events("?event=match&pageSize=10")).total).toBe(3);
  });

  it("record a finished match", async () => {
    const id = (await post("/games/api/matches", mum, {
      game: "dots", options: { size: 10, targetCaptures: 1 }, opponent: { id: "dad", name: "Dad" }, seat: 0
    })).json().id as string;
    await post(`/games/api/matches/${id}/accept`, dad);
    // Blue rings one red dot at (2,2): (1,2) (2,1) (3,2) (2,3); red fills in far away.
    const blue = [[1, 2], [2, 1], [3, 2], [2, 3]];
    const red = [[2, 2], [8, 8], [8, 7], [8, 6]];
    for (let i = 0; i < 4; i++) {
      expect((await post(`/games/api/matches/${id}/moves`, mum, { move: { x: blue[i][0], y: blue[i][1] }, moveCount: i * 2 })).statusCode).toBe(200);
      if (i < 3) expect((await post(`/games/api/matches/${id}/moves`, dad, { move: { x: red[i][0], y: red[i][1] }, moveCount: i * 2 + 1 })).statusCode).toBe(200);
    }
    const finished = (await events("?event=match.finished")).events;
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ actorId: "mum", matchId: id, detail: "dots: Мама wins (target, 1–0) after 7 moves" });
  });

  it("refuse a body over the limit, and say so in the events", async () => {
    const res = await post("/games/api/matches", mum, {
      game: "dots", options: { size: 10, targetCaptures: null, padding: "x".repeat(BODY_LIMIT) }, opponent: { id: "dad", name: "Dad" }, seat: 0
    });
    expect(res.statusCode).toBe(413);
    const page = await events("?event=request.too_large");
    expect(page.total).toBe(1);
    expect(page.events[0].detail).toBe(`POST /games/api/matches: body over ${BODY_LIMIT} bytes`);
  });

  it("record a malformed request", async () => {
    await post("/games/api/matches", mum, { game: "dots" });
    const page = await events("?event=request.invalid");
    expect(page.events[0]).toMatchObject({ level: "warn", actorId: "mum", detail: "POST /games/api/matches: options, opponent" });
  });

  it("hand the whole database over for the home server's backup, to an admin only", async () => {
    await post("/games/api/matches", mum, {
      game: "dots", options: { size: 10, targetCaptures: null }, opponent: { id: "dad", name: "Dad" }, seat: 0
    });
    expect((await get("/games/api/admin/backup", {})).statusCode).toBe(401);
    expect((await get("/games/api/admin/backup", mum)).statusCode).toBe(403);

    const res = await get("/games/api/admin/backup", admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.sqlite3");
    expect(res.headers["x-isputnik-backup-version"]).toBe("0.0.0-test");
    expect(res.headers["cache-control"]).toBe("no-store");
    // A real SQLite file, holding the match made above.
    const bytes = res.rawPayload;
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\0");
    const copy = new Database(bytes);
    expect((copy.prepare("SELECT COUNT(*) AS n FROM matches").get() as { n: number }).n).toBe(1);
    // The event about the copy is written after it, so it is not inside it.
    expect((copy.prepare("SELECT COUNT(*) AS n FROM events WHERE event = 'backup.taken'").get() as { n: number }).n).toBe(0);
    copy.close();
    const taken = (await events("?event=backup.taken")).events;
    expect(taken).toHaveLength(1);
    expect(taken[0]).toMatchObject({ actorId: "admin", level: "info" });
  });

  it("hand out the log tail, with who and where on every line", async () => {
    await get("/games/api/me", mum);
    const res = await get("/games/api/admin/log?lines=50", admin);
    const body = res.json() as { lines: string[]; capacity: number; available: boolean };
    expect(body.available).toBe(true);
    expect(body.capacity).toBe(100);
    const completed = body.lines.map((line) => JSON.parse(line) as { msg: string; user?: string; ip?: string; reqId?: string; req?: { url: string } })
      .find((line) => line.msg === "request completed" && line.reqId === "home-mum");
    expect(completed).toMatchObject({ user: "mum", ip: "192.168.2.10" });
    expect((await get("/games/api/admin/log?lines=5000", admin)).statusCode).toBe(400);
  });
});
