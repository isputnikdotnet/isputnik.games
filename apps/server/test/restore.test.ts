// A backup going back in (restore.ts): a copy home holds replaces what is here,
// at once, with no restart; the database it replaced can be put back once.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { buildApp } from "../src/app.js";

const SECRET = "s3cret-s3cret-s3cret";
const as = (id: string, name: string, role: "admin" | "member" = "member") => ({
  "x-isputnik-gateway": SECRET,
  "x-isputnik-user-id": id,
  "x-isputnik-user-name": encodeURIComponent(name),
  "x-isputnik-user-role": role
});
const admin = as("admin", "Admin", "admin");
const mum = as("mum", "Mama");

let dir: string;
let app: FastifyInstance;
const build = (dbPath: string, version = "1.0.0") => buildApp({ gatewaySecret: SECRET, devUser: null, staticPath: "", dbPath, version, stage: null, fastify: { logger: false } });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "games-restore-"));
  app = await build(path.join(dir, "games.sqlite"));
});
afterEach(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A backup as a database to look into: a copy of a WAL file opens in memory only
 *  once its header stops saying WAL. */
const opened = (bytes: Buffer) => {
  const image = Buffer.from(bytes);
  image[18] = 1;
  image[19] = 1;
  return new Database(image);
};

const newMatch = async () => {
  const res = await app.inject({
    method: "POST",
    url: "/games/api/matches",
    headers: mum,
    payload: { game: "dots", options: { size: 10, targetCaptures: null }, opponent: { id: "dad", name: "Dad" }, seat: 0 }
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { id: string }).id;
};
const matchIds = async () => {
  const res = await app.inject({ method: "GET", url: "/games/api/matches", headers: mum });
  return JSON.stringify(res.json());
};
const backup = async () => (await app.inject({ method: "GET", url: "/games/api/admin/backup", headers: admin })).rawPayload;
const restore = (body: Buffer, headers: Record<string, string> = admin, version?: string) =>
  app.inject({
    method: "POST",
    url: "/games/api/admin/restore",
    headers: { ...headers, "content-type": "application/vnd.sqlite3", ...(version ? { "x-isputnik-backup-version": version } : {}) },
    payload: body
  });
const undo = () => app.inject({ method: "GET", url: "/games/api/admin/restore/undo", headers: admin });
const undoNow = () => app.inject({ method: "POST", url: "/games/api/admin/restore/undo", headers: admin });

describe("restoring a backup", () => {
  it("is for an admin only, before any file is read", async () => {
    expect((await restore(Buffer.from("x"), {})).statusCode).toBe(401);
    expect((await restore(Buffer.from("x"), mum)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/games/api/admin/restore/undo", headers: mum })).statusCode).toBe(403);
  });

  it("puts the old rows back and takes the newer ones away, at once", async () => {
    const before = await newMatch();
    const snapshot = await backup();
    const after = await newMatch();

    const res = await restore(snapshot, admin, "1.0.0");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ restored: true, version: "1.0.0" });

    const listed = await matchIds();
    expect(listed).toContain(before);
    expect(listed).not.toContain(after);

    // It still takes writes: nothing was closed under it.
    const another = await newMatch();
    expect(await matchIds()).toContain(another);
  });

  it("keeps the database it replaced, and that can be put back once", async () => {
    const snapshot = await backup();
    const made = await newMatch();
    expect((await undo()).json()).toEqual({ undo: null });

    await restore(snapshot);
    expect(await matchIds()).not.toContain(made);
    expect((await undo()).json().undo).toMatchObject({ version: "1.0.0", bytes: expect.any(Number) });

    expect((await undoNow()).statusCode).toBe(200);
    expect(await matchIds()).toContain(made);
    expect((await undo()).json()).toEqual({ undo: null });
    expect((await undoNow()).statusCode).toBe(404);
  });

  it("does not hand out an id the backup had already used", async () => {
    await app.inject({ method: "GET", url: "/games/api/me", headers: { "x-isputnik-gateway": "wrong" } }); // an event, so a sequence
    const snapshot = await backup();
    const taken = opened(snapshot);
    const seq = (taken.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'events'").get() as { seq: number }).seq;
    taken.close();
    expect(seq).toBeGreaterThan(0);
    await restore(snapshot);
    const copy = opened(await backup());
    expect((copy.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'events'").get() as { seq: number }).seq).toBeGreaterThan(seq);
    copy.close();
  });

  it("brings a backup from an older version up to this one's schema", async () => {
    // An older file: the same database without a table added since.
    const older = opened(await backup());
    older.exec("DROP TABLE arcade_scores");
    const bytes = older.serialize();
    older.close();
    expect((await restore(bytes, admin, "0.5.0")).statusCode).toBe(200);
    const copy = opened(await backup());
    expect(copy.prepare("SELECT COUNT(*) AS n FROM arcade_scores").get()).toEqual({ n: 0 });
    copy.close();
  });

  it("refuses a backup from a newer version", async () => {
    const snapshot = await backup();
    const made = await newMatch();
    expect((await restore(snapshot, admin, "2.0.0")).statusCode).toBe(409);
    expect(await matchIds()).toContain(made);
  });

  it("refuses a backup that knows tables or columns this version does not, whatever it says it is", async () => {
    const newer = opened(await backup());
    newer.exec("ALTER TABLE matches ADD COLUMN from_the_future TEXT");
    const bytes = newer.serialize();
    newer.close();
    const made = await newMatch();
    const res = await restore(bytes);
    expect(res.statusCode).toBe(409);
    expect(await matchIds()).toContain(made);
    expect((await undo()).json()).toEqual({ undo: null });
  });

  it("refuses what is not a database, or not this app's", async () => {
    const made = await newMatch();
    expect((await restore(Buffer.from("<html>oops</html>"))).statusCode).toBe(400);
    const other = new Database(":memory:");
    other.exec("CREATE TABLE books (id TEXT)");
    const res = await restore(other.serialize());
    other.close();
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not a backup of the games/);
    expect(await matchIds()).toContain(made);
  });

  it("leaves everything as it was when the swap fails halfway", async () => {
    const made = await newMatch();
    // A row the live schema's constraint refuses, which only the insert finds out.
    const broken = opened(await backup());
    broken.exec("DROP TABLE match_messages; CREATE TABLE match_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT, author_id TEXT, text TEXT, after_move INTEGER, at TEXT)");
    broken.exec("INSERT INTO match_messages (match_id, author_id) VALUES ('m', NULL)");
    const bytes = broken.serialize();
    broken.close();
    const res = await restore(bytes);
    expect(res.statusCode).toBe(500);
    expect(await matchIds()).toContain(made);
    expect((await undo()).json()).toEqual({ undo: null });
  });

  it("leaves a line in the events", async () => {
    await restore(await backup(), admin, "1.0.0");
    const page = (await app.inject({ method: "GET", url: "/games/api/admin/events?event=backup", headers: admin })).json();
    expect(page.events[0]).toMatchObject({ event: "backup.restored", actorName: "Admin" });
    expect(page.events[0].detail).toContain("version 1.0.0");
  });
});
