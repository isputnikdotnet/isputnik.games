import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "../src/db.js";
import { countEventsSince, listEvents, pruneEvents, recordEvent } from "../src/events.js";
import { createLogBuffer } from "../src/log-buffer.js";
import { checkSecret, clientIpFrom, forwardedRequestId, rejectionReason } from "../src/identity.js";

describe("events", () => {
  let db: Db;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });
  afterEach(() => {
    db.close();
  });

  it("records, lists newest first, filters by level and by category or name", () => {
    recordEvent(db, { level: "info", event: "match.created", actorId: "mum", actorName: "Мама", matchId: "m1", ip: "192.168.2.10", requestId: "req-1", detail: "dots" });
    recordEvent(db, { level: "warn", event: "gateway.rejected", ip: "172.18.0.9", detail: "no gateway header" });
    recordEvent(db, { level: "info", event: "match.finished", matchId: "m1", detail: "x".repeat(900) });

    const all = listEvents(db, { page: 1, pageSize: 10 });
    expect(all.total).toBe(3);
    expect(all.events.map((e) => e.event)).toEqual(["match.finished", "gateway.rejected", "match.created"]);
    expect(all.events[2]).toMatchObject({ actorId: "mum", actorName: "Мама", matchId: "m1", ip: "192.168.2.10", requestId: "req-1", detail: "dots" });
    expect(all.events[0].detail).toHaveLength(500);
    expect(all.facets.event).toEqual(["gateway.rejected", "match.created", "match.finished"]);

    expect(listEvents(db, { level: "warn", page: 1, pageSize: 10 }).events.map((e) => e.event)).toEqual(["gateway.rejected"]);
    expect(listEvents(db, { event: "match", page: 1, pageSize: 10 }).total).toBe(2);
    expect(listEvents(db, { event: "match.created", page: 1, pageSize: 10 }).total).toBe(1);
    // A page past the end lands on the last one rather than coming back empty.
    expect(listEvents(db, { page: 9, pageSize: 10 }).page).toBe(1);
  });

  it("counts a recent event and prunes old ones", () => {
    recordEvent(db, { level: "warn", event: "gateway.rejected", detail: "now" });
    db.prepare("INSERT INTO events (at, level, event, detail) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 'warn', 'gateway.rejected', 'old')").run();
    db.prepare("INSERT INTO events (at, level, event, detail) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-100 days'), 'info', 'match.created', 'ancient')").run();
    expect(countEventsSince(db, "gateway.rejected", 24)).toBe(1);
    expect(pruneEvents(db, 90)).toBe(1);
    expect(listEvents(db, { page: 1, pageSize: 10 }).total).toBe(2);
  });
});

describe("log buffer", () => {
  it("passes every chunk to the sink and keeps the newest lines, oldest first", () => {
    const sunk: string[] = [];
    const buffer = createLogBuffer(3, { write: (chunk) => sunk.push(chunk) });
    expect(buffer.tail(10)).toEqual([]);
    buffer.write("a\n");
    buffer.write("b\nc\n");
    expect(buffer.tail(10)).toEqual(["a", "b", "c"]);
    buffer.write("d\n");
    expect(buffer.tail(10)).toEqual(["b", "c", "d"]);
    expect(buffer.tail(2)).toEqual(["c", "d"]);
    expect(sunk).toEqual(["a\n", "b\nc\n", "d\n"]);
  });
});

describe("gateway helpers", () => {
  const SECRET = "s3cret-s3cret-s3cret";
  const gateway = { "x-isputnik-gateway": SECRET, "x-isputnik-client-ip": "192.168.2.10", "x-isputnik-request-id": "req-7f" };

  it("takes the forwarded address and request id only from the gateway", () => {
    expect(clientIpFrom(gateway, SECRET, "172.18.0.2")).toBe("192.168.2.10");
    expect(forwardedRequestId(gateway, SECRET)).toBe("req-7f");
    expect(clientIpFrom({ ...gateway, "x-isputnik-gateway": "nope" }, SECRET, "172.18.0.2")).toBe("172.18.0.2");
    expect(forwardedRequestId({ ...gateway, "x-isputnik-gateway": "nope" }, SECRET)).toBeUndefined();
    expect(clientIpFrom(gateway, null, "172.18.0.2")).toBe("172.18.0.2");
    // Malformed values are not worth logging either.
    expect(clientIpFrom({ ...gateway, "x-isputnik-client-ip": "not an address" }, SECRET, "172.18.0.2")).toBe("172.18.0.2");
    expect(forwardedRequestId({ ...gateway, "x-isputnik-request-id": "a b" }, SECRET)).toBeUndefined();
  });

  it("names why a caller was refused without repeating the secret", () => {
    expect(rejectionReason({}, SECRET)).toBe("no gateway header");
    expect(rejectionReason({ "x-isputnik-gateway": "guess" }, SECRET)).toBe("wrong gateway secret");
    expect(rejectionReason({ "x-isputnik-gateway": SECRET }, SECRET)).toBe("gateway headers without a valid identity");
    expect(rejectionReason({ "x-isputnik-gateway": "guess" }, SECRET)).not.toContain("guess");
  });

  it("accepts only a real secret in production, and anything from source", () => {
    expect(checkSecret(null, true)).toMatch(/not set/);
    expect(checkSecret("change-me-to-a-long-random-secret", true)).toMatch(/placeholder/);
    expect(checkSecret("dev-games-secret", true)).toMatch(/too short/);
    expect(checkSecret("c".repeat(32), true)).toBeNull();
    expect(checkSecret("dev-games-secret", false)).toBeNull();
    expect(checkSecret(null, false)).toBeNull();
  });
});
