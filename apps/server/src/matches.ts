// Online matches (docs/plan.md → Phase 2). The server is the authority: it holds
// the move list, replays it through the engine on every read, and accepts a move
// only from the seat whose turn it is. Everything here is a plain function over
// the database so the routes stay thin and the tests need no HTTP.
import { nanoid } from "nanoid";
import { getGame, otherPlayer, type AnyGame, type GameEvent, type GameStatus, type PlayerIndex } from "@isputnik/games-engine";
import type { Db } from "./db.js";
import { isGuestId } from "./identity.js";

export type MatchStatus = "invited" | "playing" | "finished" | "declined" | "cancelled";

export interface MatchRow {
  id: string;
  game: string;
  options: string;
  blue_id: string;
  red_id: string;
  created_by: string;
  status: MatchStatus;
  moves: string;
  move_count: number;
  turn: number | null;
  finish_reason: string | null;
  winner: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface Member {
  id: string;
  name: string;
  /** Someone the home server let in by guest link, not a member of the household. */
  guest?: boolean;
}

/** What a list shows: enough to name the match and say whether it waits on you. */
export interface MatchSummary {
  id: string;
  game: string;
  options: unknown;
  status: MatchStatus;
  players: [Member, Member];
  createdBy: string;
  moveCount: number;
  turn: PlayerIndex | null;
  winner: PlayerIndex | null;
  finishReason: string | null;
  score: [number, number] | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/** A line said in the match's Comms panel. */
export interface MatchMessage {
  id: number;
  by: PlayerIndex;
  text: string;
  /** The move count when it was said. */
  afterMove: number;
  at: string;
}

/** How long a message may be: a line, not a letter. */
export const MESSAGE_MAX = 120;

export interface MatchDetail extends MatchSummary {
  state: { status: GameStatus };
  /** What every move did, in order (GameDefinition.narrate). */
  feed: GameEvent[];
  messages: MatchMessage[];
}

/** What waits on one member — shown by the home app, not by the games client. */
export interface MatchActivity {
  invitations: { id: string; game: string; from: Member; createdAt: string }[];
  yourMove: { id: string; game: string; opponent: Member; updatedAt: string }[];
  counts: { invitations: number; yourMove: number };
}

export class MatchError extends Error {
  /**
   * @param event The event the refusal leaves in the log (events.ts), for the
   *   ones worth a record: "move.illegal" (the client sent a move the rules
   *   refuse — a legitimate client checks first) and "move.refused" (not your
   *   turn, the match moved on, not being played: a stale page, a double tap).
   */
  constructor(public status: number, message: string, public event: "move.illegal" | "move.refused" | null = null) {
    super(message);
    this.name = "MatchError";
  }
}

/** How long an unanswered invitation lives. */
const INVITATION_DAYS = 14;

export function rememberMember(db: Db, member: Member): void {
  db.prepare(`
    INSERT INTO members (id, name, last_seen_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, last_seen_at = excluded.last_seen_at
  `).run(member.id, member.name);
}

/** A name for someone who has not visited yet: kept only if nobody else is on record. */
function rememberIfUnknown(db: Db, member: Member): void {
  db.prepare("INSERT OR IGNORE INTO members (id, name) VALUES (?, ?)").run(member.id, member.name);
}

function memberOf(db: Db, id: string): Member {
  const row = db.prepare("SELECT id, name FROM members WHERE id = ?").get(id) as Member | undefined;
  const member = row ?? { id, name: id };
  return isGuestId(id) ? { ...member, guest: true } : member;
}

function gameOf(row: MatchRow): AnyGame {
  const game = getGame(row.game);
  if (!game) throw new MatchError(500, `Unknown game "${row.game}"`);
  return game;
}

interface Replay {
  state: { status: GameStatus };
  feed: GameEvent[];
}

function replay(row: MatchRow): Replay {
  const game = gameOf(row);
  let state = game.createGame(JSON.parse(row.options));
  const feed: GameEvent[] = [];
  for (const move of JSON.parse(row.moves) as unknown[]) {
    const next = game.applyMove(state, move);
    const event = game.narrate?.(state, move, next);
    if (event) feed.push(event);
    state = next;
  }
  if (row.status === "finished" && state.status.kind === "playing" && (row.finish_reason === "agreed" || row.finish_reason === "resigned")) {
    state = game.finish(state, row.finish_reason, row.winner === null ? undefined : otherPlayer(row.winner as PlayerIndex));
  }
  return { state, feed };
}

function messagesOf(db: Db, row: MatchRow): MatchMessage[] {
  const rows = db.prepare("SELECT id, author_id, text, after_move, at FROM match_messages WHERE match_id = ? ORDER BY id").all(row.id) as
    { id: number; author_id: string; text: string; after_move: number; at: string }[];
  return rows.map((m) => ({ id: m.id, by: m.author_id === row.blue_id ? 0 : 1, text: m.text, afterMove: m.after_move, at: m.at }));
}

/** The whole answer for one seat: the summary, their view, the feed, the talk. */
function detailFor(db: Db, row: MatchRow, replayed: Replay, seat: PlayerIndex): MatchDetail {
  return { ...summarize(db, row, replayed.state), state: viewOf(row, replayed.state, seat), feed: replayed.feed, messages: messagesOf(db, row) };
}

function summarize(db: Db, row: MatchRow, state?: { status: GameStatus }): MatchSummary {
  const game = gameOf(row);
  const replayed = state ?? replay(row).state;
  return {
    id: row.id,
    game: row.game,
    options: JSON.parse(row.options),
    status: row.status,
    players: [memberOf(db, row.blue_id), memberOf(db, row.red_id)],
    createdBy: row.created_by,
    moveCount: row.move_count,
    turn: row.status === "playing" ? (row.turn as PlayerIndex) : null,
    winner: row.winner === null ? null : (row.winner as PlayerIndex),
    finishReason: row.finish_reason,
    score: game.scoreOf ? game.scoreOf(replayed) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at
  };
}

/** The position as one seat may see it: a game with hidden information (Sea
 *  Battle's fleets) redacts the other side's; the rest hand back the whole. */
function viewOf(row: MatchRow, state: { status: GameStatus }, seat: PlayerIndex): { status: GameStatus } {
  const game = gameOf(row);
  return game.viewFor ? game.viewFor(state, seat) : state;
}

function rowOf(db: Db, id: string): MatchRow {
  const row = db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as MatchRow | undefined;
  if (!row) throw new MatchError(404, "Match not found");
  return row;
}

function seatOf(row: MatchRow, userId: string): PlayerIndex {
  if (row.blue_id === userId) return 0;
  if (row.red_id === userId) return 1;
  throw new MatchError(404, "Match not found");
}

export interface CreateMatchInput {
  game: string;
  options: unknown;
  opponent: Member;
  /** The seat the creator takes; the opponent gets the other. */
  seat: PlayerIndex;
}

export function createMatch(db: Db, me: Member, input: CreateMatchInput): MatchSummary {
  const game = getGame(input.game);
  if (!game) throw new MatchError(400, "Unknown game");
  if (input.opponent.id === me.id) throw new MatchError(400, "You cannot invite yourself");
  // Only what the game reads is kept: the client may have sent more, and both
  // players would download it with every poll.
  let options: unknown;
  try {
    options = game.parseOptions(input.options);
    game.createGame(options);
  } catch (err) {
    throw new MatchError(400, err instanceof Error ? err.message : "Invalid options");
  }
  rememberIfUnknown(db, input.opponent);
  const id = nanoid(16);
  const [blue, red] = input.seat === 0 ? [me.id, input.opponent.id] : [input.opponent.id, me.id];
  db.prepare(`
    INSERT INTO matches (id, game, options, blue_id, red_id, created_by, status)
    VALUES (?, ?, ?, ?, ?, ?, 'invited')
  `).run(id, input.game, JSON.stringify(options), blue, red, me.id);
  return summarize(db, rowOf(db, id));
}

export function getMatch(db: Db, userId: string, id: string): MatchDetail {
  const row = rowOf(db, id);
  const seat = seatOf(row, userId);
  return detailFor(db, row, replay(row), seat);
}

/** `only` narrows the list to one match: a guest's world is the match their link named. */
export function listMatches(db: Db, userId: string, only?: string): MatchSummary[] {
  expireInvitations(db);
  const rows = db.prepare(`
    SELECT * FROM matches
    WHERE (blue_id = ? OR red_id = ?) AND status IN ('invited', 'playing', 'finished')
      AND (? IS NULL OR id = ?)
    ORDER BY updated_at DESC, rowid DESC
    LIMIT 100
  `).all(userId, userId, only ?? null, only ?? null) as MatchRow[];
  return rows.map((row) => summarize(db, row));
}

/** Invitations sent to the member and matches waiting on their move. */
export function summaryFor(db: Db, userId: string, only?: string): MatchActivity {
  expireInvitations(db);
  const other = (row: MatchRow) => memberOf(db, row.blue_id === userId ? row.red_id : row.blue_id);
  const invited = db.prepare(`
    SELECT * FROM matches
    WHERE (blue_id = ? OR red_id = ?) AND status = 'invited' AND created_by != ?
      AND (? IS NULL OR id = ?)
    ORDER BY created_at DESC, rowid DESC
  `).all(userId, userId, userId, only ?? null, only ?? null) as MatchRow[];
  const playing = db.prepare(`
    SELECT * FROM matches
    WHERE status = 'playing' AND ((blue_id = ? AND turn = 0) OR (red_id = ? AND turn = 1))
      AND (? IS NULL OR id = ?)
    ORDER BY updated_at DESC, rowid DESC
  `).all(userId, userId, only ?? null, only ?? null) as MatchRow[];
  const invitations = invited.map((row) => ({ id: row.id, game: row.game, from: other(row), createdAt: row.created_at }));
  const yourMove = playing.map((row) => ({ id: row.id, game: row.game, opponent: other(row), updatedAt: row.updated_at }));
  return { invitations, yourMove, counts: { invitations: invitations.length, yourMove: yourMove.length } };
}

/** An invitation nobody answered for INVITATION_DAYS is cancelled. */
export function expireInvitations(db: Db): number {
  const result = db.prepare(`
    UPDATE matches SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE status = 'invited' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
  `).run(`-${INVITATION_DAYS} days`);
  return result.changes;
}

export function answerInvitation(db: Db, userId: string, id: string, answer: "accept" | "decline"): MatchSummary {
  const row = rowOf(db, id);
  seatOf(row, userId);
  if (row.status !== "invited") throw new MatchError(409, "This invitation has already been answered");
  if (row.created_by === userId) throw new MatchError(403, "You sent this invitation; the other player answers it");
  if (answer === "accept") {
    db.prepare("UPDATE matches SET status = 'playing', turn = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
  } else {
    db.prepare("UPDATE matches SET status = 'declined', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
  }
  return summarize(db, rowOf(db, id));
}

export function cancelInvitation(db: Db, userId: string, id: string): MatchSummary {
  const row = rowOf(db, id);
  seatOf(row, userId);
  if (row.status !== "invited") throw new MatchError(409, "Only an unanswered invitation can be withdrawn");
  if (row.created_by !== userId) throw new MatchError(403, "Only the sender can withdraw an invitation");
  db.prepare("UPDATE matches SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(id);
  return summarize(db, rowOf(db, id));
}

/**
 * One move. `expectedCount` is the move count the client saw; a mismatch means
 * the client is behind (the other player moved, or this is a double submit)
 * and answers 409 rather than applying a move to a position the player never saw.
 */
export function playMove(db: Db, userId: string, id: string, move: unknown, expectedCount: number): MatchDetail {
  return db.transaction(() => {
    const row = rowOf(db, id);
    const seat = seatOf(row, userId);
    if (row.status !== "playing") throw new MatchError(409, "This match is not being played", "move.refused");
    if (row.turn !== seat) throw new MatchError(409, "It is not your turn", "move.refused");
    if (row.move_count !== expectedCount) throw new MatchError(409, "The match has moved on; reload it", "move.refused");

    const game = gameOf(row);
    const before = replay(row);
    let state = before.state;
    let event: GameEvent | null = null;
    try {
      // The move as the game reads it, not as the client sent it (see createMatch).
      move = game.parseMove(move);
      state = game.applyMove(state, move);
      event = game.narrate?.(before.state, move, state) ?? null;
    } catch (err) {
      throw new MatchError(400, err instanceof Error ? err.message : "Illegal move", "move.illegal");
    }
    const moves = [...(JSON.parse(row.moves) as unknown[]), move];
    if (state.status.kind === "finished") {
      db.prepare(`
        UPDATE matches SET moves = ?, move_count = ?, turn = NULL, status = 'finished', finish_reason = ?, winner = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(JSON.stringify(moves), moves.length, state.status.reason, state.status.winner, id);
    } else {
      db.prepare(`
        UPDATE matches SET moves = ?, move_count = ?, turn = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(JSON.stringify(moves), moves.length, state.status.turn, id);
    }
    const updated = rowOf(db, id);
    return detailFor(db, updated, { state, feed: event ? [...before.feed, event] : before.feed }, seat);
  })();
}

/** A line in the match's Comms panel, from either player, while it is being
 *  played or once it is over — not before the other side has even accepted. */
export function postMessage(db: Db, userId: string, id: string, text: string): MatchDetail {
  const row = rowOf(db, id);
  const seat = seatOf(row, userId);
  if (row.status !== "playing" && row.status !== "finished") throw new MatchError(409, "This match is not being played");
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) throw new MatchError(400, "Say something");
  if (line.length > MESSAGE_MAX) throw new MatchError(400, `A message is at most ${MESSAGE_MAX} characters`);
  db.prepare("INSERT INTO match_messages (match_id, author_id, text, after_move) VALUES (?, ?, ?, ?)").run(id, userId, line, row.move_count);
  return detailFor(db, row, replay(row), seat);
}

export function resign(db: Db, userId: string, id: string): MatchDetail {
  return db.transaction(() => {
    const row = rowOf(db, id);
    const seat = seatOf(row, userId);
    if (row.status !== "playing") throw new MatchError(409, "This match is not being played");
    db.prepare(`
      UPDATE matches SET turn = NULL, status = 'finished', finish_reason = 'resigned', winner = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
    `).run(otherPlayer(seat), id);
    const updated = rowOf(db, id);
    return detailFor(db, updated, replay(updated), seat);
  })();
}
