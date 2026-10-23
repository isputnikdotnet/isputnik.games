import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifyServerOptions } from "fastify";
import staticFiles from "@fastify/static";
import { z } from "zod";
import { AI_LEVELS, Chess, GAME_IDS, type AiLevel, type PuzzleLevel } from "@isputnik/games-engine";
import { BASE_PATH } from "./config.js";
import { openDatabase } from "./db.js";
import {
  clientIpFrom,
  devIdentity,
  forwardedRequestId,
  identityFrom,
  isGuestId,
  rejectionReason,
  type Identity
} from "./identity.js";
import { EVENT_LEVELS, EVENT_RETENTION_DAYS, countEventsSince, listEvents, pruneEvents, recordEvent, type EventLevel } from "./events.js";
import type { LogBuffer } from "./log-buffer.js";
import {
  MESSAGE_MAX,
  MatchError,
  answerInvitation,
  cancelInvitation,
  createMatch,
  getMatch,
  listMatches,
  playMove,
  postMessage,
  rememberMember,
  resign,
  summaryFor,
  type Member
} from "./matches.js";
import { nextPuzzle, recordPuzzleResult, UnknownPuzzleError } from "./puzzles.js";
import { getRecord, listReviews, saveRecord } from "./records.js";
import { chessRatingOf } from "./chess-rating.js";
import { familyStats, recordComputerResult } from "./stats.js";

declare module "fastify" {
  interface FastifyRequest {
    identity: Identity | null;
    /** The browser's address as the gateway saw it; the socket's otherwise. */
    clientIp: string;
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
  /** The last lines of the log, for GET /games/api/admin/log (index.ts wires
   *  the same object in as pino's stream). Without one the route answers empty. */
  logBuffer?: LogBuffer;
  fastify?: FastifyServerOptions;
}

const API = `${BASE_PATH}/api`;

/** A request body is a move or a match's options: a few hundred bytes. The limit
 *  keeps a client from parking a megabyte in a match that both players would
 *  then download with every poll. */
export const BODY_LIMIT = 16 * 1024;

/** Lines the log route hands out at most; the buffer holds no more anyway. */
const LOG_LINES_MAX = 500;

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

// "This month" begins at the member's own midnight on the 1st, which only the
// browser knows; the server takes it as an instant and counts from there.
const statsQuerySchema = z.object({
  since: z.string().max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), "since must be a date")
    .transform((value) => new Date(value).toISOString())
    .optional()
});

// A game against the computer, finished in the browser. The key is the
// browser's own id for that game, so reporting it again changes nothing.
const computerResultSchema = z.object({
  game: z.string().refine((game) => GAME_IDS.includes(game), "unknown game"),
  level: z.enum(AI_LEVELS as [AiLevel, ...AiLevel[]]),
  result: z.enum(["won", "lost", "drawn"]),
  key: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)
});

// A chess puzzle: the next one at a level ("auto" — near the member's
// rating — when none is given), and how a try went.
const puzzleQuerySchema = z.object({
  level: z.enum(["auto", ...Chess.PUZZLE_LEVELS] as ["auto", ...PuzzleLevel[]]).default("auto")
});

const puzzleResultSchema = z.object({
  solved: z.boolean(),
  hints: z.number().int().min(0).max(2)
});

const puzzleId = (request: FastifyRequest) => z.string().regex(/^[A-Za-z0-9]{1,16}$/).parse((request.params as { id?: string }).id);

// A finished chess game from one device, kept for review; the moves are
// checked by replaying them (records.ts), so only their count is capped here.
const recordSchema = z.object({
  game: z.literal("chess"),
  key: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  mode: z.enum(["computer", "local"]),
  level: z.enum(AI_LEVELS as [AiLevel, ...AiLevel[]]).optional(),
  seat: z.union([z.literal(0), z.literal(1)]).optional(),
  moves: z.array(z.unknown()).max(1000),
  finish: z.object({
    reason: z.enum(["agreed", "resigned"]),
    resigning: z.union([z.literal(0), z.literal(1)]).optional()
  }).optional()
});

const reviewQuerySchema = z.object({ game: z.literal("chess").default("chess") });

const messageSchema = z.object({
  text: z.string().min(1).max(MESSAGE_MAX)
});

const moveSchema = z.object({
  move: z.unknown(),
  moveCount: z.number().int().min(0)
});

const eventsQuerySchema = z.object({
  level: z.enum(EVENT_LEVELS as [EventLevel, ...EventLevel[]]).optional(),
  event: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
});

const logQuerySchema = z.object({
  lines: z.coerce.number().int().min(10).max(LOG_LINES_MAX).default(200)
});

// Standalone development has no home app to list the family, so the invite
// dialog gets a made-up one: the developer identity plus a few names.
const DEV_FAMILY = [
  { id: "mum", name: "Mum" },
  { id: "dad", name: "Dad" },
  { id: "kid", name: "Kid" }
];

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const secret = options.gatewaySecret;
  const dev = secret ? null : options.devUser ? devIdentity(options.devUser) : null;
  let requestCounter = 0;
  const app = fastify({
    bodyLimit: BODY_LIMIT,
    ...options.fastify,
    // The gateway's id for the request, so a line here and the home server's line
    // for the same request can be matched; a caller that is not the gateway gets
    // this server's own, as Fastify would have given it.
    genReqId: (raw) => forwardedRequestId(raw.headers, secret) ?? `req-${(++requestCounter).toString(36)}`
  });
  const db = openDatabase(options.dbPath);
  app.addHook("onClose", async () => {
    clearInterval(pruning);
    db.close();
  });

  // Yesterday's season goes on start and once a day after; nothing waits on it.
  pruneEvents(db, EVENT_RETENTION_DAYS);
  const pruning = setInterval(() => pruneEvents(db, EVENT_RETENTION_DAYS), 24 * 60 * 60 * 1000);
  pruning.unref();

  // Every request line says who: the member and the browser's address, as the
  // gateway forwarded them. Without them the log named only the home container.
  app.setChildLoggerFactory(function (logger, bindings, loggerOptions, raw) {
    const identity = secret ? identityFrom(raw.headers, secret) : dev;
    return logger.child({ ...bindings, user: identity?.id ?? null, ip: clientIpFrom(raw.headers, secret, raw.socket?.remoteAddress) }, loggerOptions);
  });

  app.decorateRequest("identity", null);
  app.decorateRequest("clientIp", "");
  app.addHook("onRequest", async (request) => {
    request.identity = secret ? identityFrom(request.headers, secret) : dev;
    request.clientIp = clientIpFrom(request.headers, secret, request.ip);
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

  /** An event with everything the request knows about who and where. */
  const note = (request: FastifyRequest, level: EventLevel, event: string, fields: { matchId?: string | null; detail: string }) => {
    recordEvent(db, {
      level,
      event,
      actorId: request.identity?.id ?? null,
      actorName: request.identity?.name ?? null,
      matchId: fields.matchId ?? null,
      ip: request.clientIp || null,
      requestId: String(request.id),
      detail: fields.detail
    });
  };
  const pathOf = (request: FastifyRequest) => request.url.split("?")[0];
  const idOf = (request: FastifyRequest) => (request.params as { id?: string }).id ?? null;

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof MatchError) {
      if (error.event) note(request, error.event === "move.illegal" ? "warn" : "info", error.event, { matchId: idOf(request), detail: error.message });
      return reply.code(error.status).send({ error: error.message });
    }
    if (error instanceof UnknownPuzzleError) return reply.code(404).send({ error: error.message });
    if (error instanceof z.ZodError) {
      const fields = [...new Set(error.issues.map((issue) => issue.path.join(".") || "(body)"))].join(", ");
      note(request, "warn", "request.invalid", { matchId: idOf(request), detail: `${request.method} ${pathOf(request)}: ${fields}` });
      return reply.code(400).send({ error: "Invalid request", details: error.issues });
    }
    const status = typeof (error as { statusCode?: number }).statusCode === "number" ? (error as { statusCode: number }).statusCode : 500;
    if (status === 413) {
      note(request, "warn", "request.too_large", { matchId: idOf(request), detail: `${request.method} ${pathOf(request)}: body over ${BODY_LIMIT} bytes` });
    }
    if (status >= 500) {
      request.log.error({ err: error }, "Unhandled error");
      note(request, "error", "request.error", { matchId: idOf(request), detail: `${request.method} ${pathOf(request)}: ${(error as Error).message}` });
    }
    return reply.code(status).send({ error: status >= 500 ? "Something went wrong" : (error as Error).message });
  });

  // A caller without a valid identity. With a secret configured that is someone
  // who reached this port without going through the gateway — or a gateway with
  // the wrong secret — and either is worth a line and an event.
  const requireIdentity = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.identity) return;
    if (secret) {
      const reason = rejectionReason(request.headers, secret);
      request.log.warn({ reason }, "Request refused at the gateway check");
      note(request, "warn", "gateway.rejected", { detail: `${request.method} ${pathOf(request)}: ${reason}` });
    }
    return reply.code(401).send({ error: "Not signed in" });
  };
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    await requireIdentity(request, reply);
    if (reply.sent) return;
    if (request.identity!.role !== "admin") return reply.code(403).send({ error: "Admins only" });
  };
  const matchId = (request: FastifyRequest) => (request.params as { id: string }).id;
  // A member, or a guest in the one match their link is for (docs/plan.md →
  // Guests). A guest asking after any other match is someone poking at the
  // API with a guest cookie, and leaves an event behind.
  const requirePlayer = async (request: FastifyRequest, reply: FastifyReply) => {
    await requireIdentity(request, reply);
    if (reply.sent) return;
    const identity = request.identity!;
    if (identity.role === "guest" && identity.guestMatch !== matchId(request)) {
      note(request, "warn", "guest.refused", { matchId: matchId(request), detail: `${request.method} ${pathOf(request)}: a guest of match ${identity.guestMatch}` });
      return reply.code(403).send({ error: "This link opens one match only" });
    }
  };
  // Inviting is a member's act: a guest has no one to invite and no lobby to do it from.
  const requireMember = async (request: FastifyRequest, reply: FastifyReply) => {
    await requireIdentity(request, reply);
    if (reply.sent) return;
    if (request.identity!.role === "guest") return reply.code(403).send({ error: "Guests cannot invite" });
  };
  const me = (request: FastifyRequest): Member => ({ id: request.identity!.id, name: request.identity!.name });
  const opponentIn = (players: [Member, Member], userId: string) => players.find((player) => player.id !== userId) ?? players[1];
  /** "Dad (dad)" — and "Alex (guest_…, a guest)" for someone let in by link. */
  const who = (member: Member) => `${member.name} (${member.id}${isGuestId(member.id) ? ", a guest" : ""})`;
  /** The one match a guest may see; everything, for a member. */
  const scopeOf = (request: FastifyRequest) => (request.identity!.role === "guest" ? request.identity!.guestMatch : undefined);

  app.get(`${API}/health`, async () => ({ ok: true, version: options.version }));

  app.get(`${API}/me`, { preHandler: requireIdentity }, async (request) => ({
    user: request.identity,
    games: GAME_IDS,
    // Guest links are minted by the home server: there are none without a gateway.
    guests: Boolean(secret),
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
    matches: listMatches(db, request.identity!.id, scopeOf(request))
  }));

  // What the home app shows on its own pages: invitations and "your move" counts.
  app.get(`${API}/summary`, { preHandler: requireIdentity }, async (request) =>
    summaryFor(db, request.identity!.id, scopeOf(request))
  );

  // The family leaderboard and the member's own month (stats.ts). The family's
  // results are the family's: a guest, here for one match, has none to see.
  app.get(`${API}/stats`, { preHandler: requireIdentity }, async (request, reply) => {
    if (request.identity!.role === "guest") return reply.code(403).send({ error: "Guests have no family results" });
    const { since } = statsQuerySchema.parse(request.query ?? {});
    return familyStats(db, request.identity!.id, since);
  });

  // A finished game against the computer, for the leaderboard's vs Computer
  // tab. A guest's games are not the family's results.
  app.post(`${API}/computer-results`, { preHandler: requireIdentity }, async (request, reply) => {
    if (request.identity!.role === "guest") return reply.code(403).send({ error: "Guests have no family results" });
    const input = computerResultSchema.parse(request.body ?? {});
    const recorded = recordComputerResult(db, request.identity!.id, input);
    // A chess game moves the chess rating: the answer carries where it stands now.
    const chessRating = input.game === "chess" ? chessRatingOf(db, request.identity!.id) : undefined;
    return reply.code(recorded ? 201 : 200).send({ recorded, chessRating });
  });

  // Chess puzzles, for members: a guest is here for one match.
  app.get(`${API}/puzzles/next`, { preHandler: requireIdentity }, async (request, reply) => {
    if (request.identity!.role === "guest") return reply.code(403).send({ error: "Puzzles are for the family" });
    const { level } = puzzleQuerySchema.parse(request.query ?? {});
    return nextPuzzle(db, request.identity!.id, level);
  });

  app.post(`${API}/puzzles/:id/result`, { preHandler: requireIdentity }, async (request, reply) => {
    if (request.identity!.role === "guest") return reply.code(403).send({ error: "Puzzles are for the family" });
    const input = puzzleResultSchema.parse(request.body ?? {});
    return recordPuzzleResult(db, request.identity!.id, puzzleId(request), input);
  });

  // The member's chess rating, for the panel once an online game is over.
  app.get(`${API}/chess/rating`, { preHandler: requireMember }, async (request) => chessRatingOf(db, request.identity!.id));

  // Finished games for review: the member's own, online and on one device.
  app.post(`${API}/records`, { preHandler: requireMember }, async (request, reply) => {
    const saved = saveRecord(db, request.identity!.id, recordSchema.parse(request.body ?? {}));
    return reply.code(saved.recorded ? 201 : 200).send(saved);
  });

  app.get(`${API}/records`, { preHandler: requireMember }, async (request) => {
    const { game } = reviewQuerySchema.parse(request.query ?? {});
    return { items: listReviews(db, request.identity!.id, game) };
  });

  app.get(`${API}/records/:id`, { preHandler: requireMember }, async (request, reply) => {
    const record = getRecord(db, request.identity!.id, z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).parse((request.params as { id?: string }).id));
    return record ?? reply.code(404).send({ error: "No such game" });
  });

  app.post(`${API}/matches`, { preHandler: requireMember }, async (request, reply) => {
    const input = createMatchSchema.parse(request.body ?? {});
    const match = createMatch(db, me(request), input);
    note(request, "info", "match.created", { matchId: match.id, detail: `${match.game}: invited ${who(input.opponent)}, plays ${input.seat === 0 ? "first" : "second"}` });
    return reply.code(201).send(match);
  });

  app.get(`${API}/matches/:id`, { preHandler: requirePlayer }, async (request) =>
    getMatch(db, request.identity!.id, matchId(request))
  );

  app.post(`${API}/matches/:id/accept`, { preHandler: requirePlayer }, async (request) => {
    const match = answerInvitation(db, request.identity!.id, matchId(request), "accept");
    const from = opponentIn(match.players, request.identity!.id);
    note(request, "info", "match.accepted", { matchId: match.id, detail: `${match.game}: accepted the invitation from ${who(from)}` });
    return match;
  });

  app.post(`${API}/matches/:id/decline`, { preHandler: requirePlayer }, async (request) => {
    const match = answerInvitation(db, request.identity!.id, matchId(request), "decline");
    const from = opponentIn(match.players, request.identity!.id);
    note(request, "info", "match.declined", { matchId: match.id, detail: `${match.game}: declined the invitation from ${who(from)}` });
    return match;
  });

  app.post(`${API}/matches/:id/cancel`, { preHandler: requirePlayer }, async (request) => {
    const match = cancelInvitation(db, request.identity!.id, matchId(request));
    const to = opponentIn(match.players, request.identity!.id);
    note(request, "info", "match.cancelled", { matchId: match.id, detail: `${match.game}: withdrew the invitation to ${who(to)}` });
    return match;
  });

  app.post(`${API}/matches/:id/moves`, { preHandler: requirePlayer }, async (request) => {
    const input = moveSchema.parse(request.body ?? {});
    const match = playMove(db, request.identity!.id, matchId(request), input.move, input.moveCount);
    if (match.status === "finished") {
      const winner = match.winner === null ? "a draw" : `${match.players[match.winner].name} wins`;
      const score = match.score ? `, ${match.score[0]}–${match.score[1]}` : "";
      note(request, "info", "match.finished", { matchId: match.id, detail: `${match.game}: ${winner} (${match.finishReason}${score}) after ${match.moveCount} moves` });
    }
    return match;
  });

  app.post(`${API}/matches/:id/messages`, { preHandler: requirePlayer }, async (request, reply) => {
    const input = messageSchema.parse(request.body ?? {});
    return reply.code(201).send(postMessage(db, request.identity!.id, matchId(request), input.text));
  });

  app.post(`${API}/matches/:id/resign`, { preHandler: requirePlayer }, async (request) => {
    const match = resign(db, request.identity!.id, matchId(request));
    const to = opponentIn(match.players, request.identity!.id);
    note(request, "info", "match.resigned", { matchId: match.id, detail: `${match.game}: resigned against ${who(to)} after ${match.moveCount} moves` });
    return match;
  });

  // ── The admin's window, read by the home app through the gateway ─────────
  // (docs/plan.md → Logging). Nothing is written here; the games server never
  // calls the home server, and the home server asks only on an admin's behalf.
  app.get(`${API}/admin/events`, { preHandler: requireAdmin }, async (request) => {
    const query = eventsQuerySchema.parse(request.query ?? {});
    return {
      ...listEvents(db, { level: query.level ?? null, event: query.event || null, page: query.page, pageSize: query.pageSize }),
      retentionDays: EVENT_RETENTION_DAYS,
      // The one number worth a glance: callers refused at the gateway check lately.
      rejected24h: countEventsSince(db, "gateway.rejected", 24)
    };
  });

  app.get(`${API}/admin/log`, { preHandler: requireAdmin }, async (request) => {
    const query = logQuerySchema.parse(request.query ?? {});
    return {
      lines: options.logBuffer?.tail(query.lines) ?? [],
      capacity: options.logBuffer?.capacity ?? 0,
      // The log route needs the buffer index.ts wires in; a test without one gets nothing.
      available: Boolean(options.logBuffer)
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
