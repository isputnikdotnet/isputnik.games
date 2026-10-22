import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifyServerOptions } from "fastify";
import staticFiles from "@fastify/static";
import { z } from "zod";
import { GAME_IDS } from "@isputnik/games-engine";
import { BASE_PATH } from "./config.js";
import { openDatabase } from "./db.js";
import { devIdentity, identityFrom, type Identity } from "./identity.js";
import {
  MatchError,
  answerInvitation,
  cancelInvitation,
  createMatch,
  getMatch,
  listMatches,
  playMove,
  rememberMember,
  resign
} from "./matches.js";

declare module "fastify" {
  interface FastifyRequest {
    identity: Identity | null;
  }
}

export interface AppOptions {
  gatewaySecret: string | null;
  /** Used when no secret is configured — development only. */
  devUser: string | null;
  staticPath: string;
  /** The SQLite file; ":memory:" in tests. */
  dbPath: string;
  version: string;
  stage: string | null;
  fastify?: FastifyServerOptions;
}

const API = `${BASE_PATH}/api`;

const memberSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120)
});

const createMatchSchema = z.object({
  game: z.string().min(1).max(32),
  options: z.unknown(),
  opponent: memberSchema,
  seat: z.union([z.literal(0), z.literal(1)]).default(0)
});

const moveSchema = z.object({
  move: z.unknown(),
  moveCount: z.number().int().min(0)
});

// Standalone development has no home app to list the family, so the invite
// dialog gets a made-up one: the developer identity plus a few names.
const DEV_FAMILY = [
  { id: "mum", name: "Mum" },
  { id: "dad", name: "Dad" },
  { id: "kid", name: "Kid" }
];

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify(options.fastify ?? {});
  const dev = options.gatewaySecret ? null : options.devUser ? devIdentity(options.devUser) : null;
  const db = openDatabase(options.dbPath);
  app.addHook("onClose", async () => {
    db.close();
  });

  app.decorateRequest("identity", null);
  app.addHook("onRequest", async (request) => {
    request.identity = options.gatewaySecret ? identityFrom(request.headers, options.gatewaySecret) : dev;
    // The names a match list shows come from here: whoever visits is on record.
    if (request.identity && request.url.startsWith(`${API}/`)) {
      rememberMember(db, { id: request.identity.id, name: request.identity.name });
    }
  });

  // Nothing here should ever be indexed, and it is never embedded elsewhere.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Robots-Tag", "noindex, nofollow");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof MatchError) return reply.code(error.status).send({ error: error.message });
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "Invalid request", details: error.issues });
    const status = typeof (error as { statusCode?: number }).statusCode === "number" ? (error as { statusCode: number }).statusCode : 500;
    if (status >= 500) app.log.error({ err: error }, "Unhandled error");
    return reply.code(status).send({ error: status >= 500 ? "Something went wrong" : (error as Error).message });
  });

  const requireIdentity = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.identity) return reply.code(401).send({ error: "Not signed in" });
  };
  const me = (request: FastifyRequest) => ({ id: request.identity!.id, name: request.identity!.name });
  const idOf = (request: FastifyRequest) => (request.params as { id: string }).id;

  app.get(`${API}/health`, async () => ({ ok: true, version: options.version }));

  app.get(`${API}/me`, { preHandler: requireIdentity }, async (request) => ({
    user: request.identity,
    games: GAME_IDS,
    version: options.version,
    stage: options.stage
  }));

  if (dev) {
    app.get(`${API}/dev/members`, async () => ({
      members: [{ id: dev.id, name: dev.name }, ...DEV_FAMILY.filter((m) => m.id !== dev.id)]
    }));
  }

  // ── Online matches (docs/plan.md → Phase 2) ──────────────────────────────
  app.get(`${API}/matches`, { preHandler: requireIdentity }, async (request) => ({
    matches: listMatches(db, request.identity!.id)
  }));

  app.post(`${API}/matches`, { preHandler: requireIdentity }, async (request, reply) => {
    const input = createMatchSchema.parse(request.body ?? {});
    return reply.code(201).send(createMatch(db, me(request), input));
  });

  app.get(`${API}/matches/:id`, { preHandler: requireIdentity }, async (request) =>
    getMatch(db, request.identity!.id, idOf(request))
  );

  app.post(`${API}/matches/:id/accept`, { preHandler: requireIdentity }, async (request) =>
    answerInvitation(db, request.identity!.id, idOf(request), "accept")
  );

  app.post(`${API}/matches/:id/decline`, { preHandler: requireIdentity }, async (request) =>
    answerInvitation(db, request.identity!.id, idOf(request), "decline")
  );

  app.post(`${API}/matches/:id/cancel`, { preHandler: requireIdentity }, async (request) =>
    cancelInvitation(db, request.identity!.id, idOf(request))
  );

  app.post(`${API}/matches/:id/moves`, { preHandler: requireIdentity }, async (request) => {
    const input = moveSchema.parse(request.body ?? {});
    return playMove(db, request.identity!.id, idOf(request), input.move, input.moveCount);
  });

  app.post(`${API}/matches/:id/resign`, { preHandler: requireIdentity }, async (request) =>
    resign(db, request.identity!.id, idOf(request))
  );

  if (options.staticPath) {
    await app.register(staticFiles, {
      root: options.staticPath,
      prefix: `${BASE_PATH}/`,
      wildcard: false,
      // Built files are content-hashed; index.html is not.
      cacheControl: false
    });
    // The bare prefix and every page under it is the app shell; the API answers
    // its own 404s so a stale client never gets HTML where it expected JSON.
    app.get(BASE_PATH, async (_request, reply) => reply.redirect(`${BASE_PATH}/`, 301));
    app.get("/", async (_request, reply) => reply.redirect(`${BASE_PATH}/`, 302));
    app.setNotFoundHandler(async (request, reply) => {
      const pathname = request.url.split("?")[0];
      if (pathname.startsWith(`${API}/`)) return reply.code(404).send({ error: "Not found" });
      if (pathname.startsWith(`${BASE_PATH}/`)) {
        return reply.header("Cache-Control", "no-cache").sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  }

  return app;
}
