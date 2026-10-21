import fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import staticFiles from "@fastify/static";
import { GAME_IDS } from "@isputnik/games-engine";
import { BASE_PATH } from "./config.js";
import { devIdentity, identityFrom, type Identity } from "./identity.js";

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
  version: string;
  stage: string | null;
  fastify?: FastifyServerOptions;
}

const API = `${BASE_PATH}/api`;

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = fastify(options.fastify ?? {});
  const dev = options.gatewaySecret ? null : options.devUser ? devIdentity(options.devUser) : null;

  app.decorateRequest("identity", null);
  app.addHook("onRequest", async (request) => {
    request.identity = options.gatewaySecret ? identityFrom(request.headers, options.gatewaySecret) : dev;
  });

  // Nothing here should ever be indexed, and it is never embedded elsewhere.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Robots-Tag", "noindex, nofollow");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });

  app.get(`${API}/health`, async () => ({ ok: true, version: options.version }));

  app.get(`${API}/me`, async (request, reply) => {
    if (!request.identity) return reply.code(401).send({ error: "Not signed in" });
    return {
      user: request.identity,
      games: GAME_IDS,
      version: options.version,
      stage: options.stage
    };
  });

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
