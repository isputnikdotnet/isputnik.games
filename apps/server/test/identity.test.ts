import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { devIdentity, identityFrom } from "../src/identity.js";

const SECRET = "s3cret-s3cret-s3cret";

const gatewayHeaders = (overrides: Record<string, string> = {}) => ({
  "x-isputnik-gateway": SECRET,
  "x-isputnik-user-id": "u_42",
  "x-isputnik-user-name": encodeURIComponent("Мама"),
  "x-isputnik-user-role": "member",
  "x-isputnik-user-lang": "ru",
  "x-isputnik-user-theme": "plain-dark",
  ...overrides
});

describe("identityFrom", () => {
  it("reads the gateway's headers when the secret matches", () => {
    expect(identityFrom(gatewayHeaders(), SECRET)).toEqual({
      id: "u_42", name: "Мама", role: "member", lang: "ru", theme: "plain-dark"
    });
  });

  it("is anonymous without the secret, with a wrong one, or with none configured", () => {
    expect(identityFrom(gatewayHeaders({ "x-isputnik-gateway": "nope" }), SECRET)).toBeNull();
    const { "x-isputnik-gateway": _dropped, ...withoutSecret } = gatewayHeaders();
    expect(identityFrom(withoutSecret, SECRET)).toBeNull();
    expect(identityFrom(gatewayHeaders(), null)).toBeNull();
    expect(identityFrom(gatewayHeaders({ "x-isputnik-gateway": "" }), "")).toBeNull();
  });

  it("refuses an unknown role and a missing id; defaults a bad language or theme", () => {
    expect(identityFrom(gatewayHeaders({ "x-isputnik-user-role": "owner" }), SECRET)).toBeNull();
    expect(identityFrom(gatewayHeaders({ "x-isputnik-user-id": "" }), SECRET)).toBeNull();
    const loose = identityFrom(gatewayHeaders({ "x-isputnik-user-lang": "<script>", "x-isputnik-user-theme": "Not A Theme" }), SECRET)!;
    expect(loose.lang).toBe("en");
    expect(loose.theme).toBe("minimalist");
  });

  it("falls back to the id when the name is empty, and survives a malformed encoding", () => {
    expect(identityFrom(gatewayHeaders({ "x-isputnik-user-name": "" }), SECRET)!.name).toBe("u_42");
    expect(identityFrom(gatewayHeaders({ "x-isputnik-user-name": "%E0%A4%A" }), SECRET)!.name).toBe("%E0%A4%A");
  });

  it("parses the developer identity", () => {
    expect(devIdentity("dev:Developer:admin")).toEqual({ id: "dev", name: "Developer", role: "admin", lang: "en", theme: "minimalist" });
    expect(devIdentity("kid:Kid:member:ru:dark").role).toBe("member");
    expect(devIdentity("kid:Kid:owner").role).toBe("admin");
  });
});

describe("api", () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  const boot = (gatewaySecret: string | null, devUser: string | null = null) =>
    buildApp({ gatewaySecret, devUser, staticPath: "", dbPath: ":memory:", version: "0.0.0-test", stage: null });

  it("answers health without identity, and /me only with it", async () => {
    app = await boot(SECRET);
    expect((await app.inject({ method: "GET", url: "/games/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/games/api/me" })).statusCode).toBe(401);
    const me = await app.inject({ method: "GET", url: "/games/api/me", headers: gatewayHeaders() });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { id: "u_42", name: "Мама" }, games: ["dots", "starbattle", "chess", "dominoes", "checkers"] });
  });

  it("ignores identity headers from a caller without the secret", async () => {
    app = await boot(SECRET);
    const res = await app.inject({ method: "GET", url: "/games/api/me", headers: gatewayHeaders({ "x-isputnik-gateway": "guess" }) });
    expect(res.statusCode).toBe(401);
  });

  it("uses the developer identity only when no secret is configured", async () => {
    app = await boot(null, "dev:Developer:admin");
    const res = await app.inject({ method: "GET", url: "/games/api/me" });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ id: "dev", role: "admin" });
  });

  it("with no secret and no developer identity, everyone is anonymous", async () => {
    app = await boot(null, null);
    expect((await app.inject({ method: "GET", url: "/games/api/me" })).statusCode).toBe(401);
  });
});
