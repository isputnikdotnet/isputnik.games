// Scores of the games for one player (docs/plan.md → Sputnik Catch). A run is
// played in the browser and sent here when it ends as its seed, its variant
// and its input log — never as a score. The run is replayed through the
// engine and the score it comes to is the one kept, so a browser cannot claim
// a number it did not play. game_key is the browser's id for the run: sent
// twice, it is kept once.
import {
  ArcadeReplayError,
  getArcadeGame,
  parseInputLog,
  parseSeed,
  replayRun
} from "@isputnik/games-engine";
import type { Db } from "./db.js";
import { MatchError } from "./matches.js";

/** A run longer than this is not a run anyone played: the floor tick is 210 ms,
 *  so this is over seventeen hours of play. */
export const ARCADE_MAX_TICKS = 300_000;
/** Net moves a run may log. */
export const ARCADE_MAX_INPUTS = 40_000;
/** The request body a long run's log needs (the app's default is far smaller). */
export const ARCADE_BODY_LIMIT = 512 * 1024;

export interface ArcadeScoreInput {
  game: string;
  variant: unknown;
  seed: unknown;
  key: string;
  log: unknown;
}

export interface ArcadeScoreAnswer {
  recorded: boolean;
  /** The score the replay came to. */
  score: number;
  /** The member's best at this game and variant, this one included. */
  best: number;
}

export function saveArcadeScore(db: Db, memberId: string, input: ArcadeScoreInput): ArcadeScoreAnswer {
  const game = getArcadeGame(input.game);
  if (!game) throw new MatchError(400, "No such game for one player");
  let variant: string;
  let state;
  let log;
  let seed: number;
  try {
    variant = game.parseVariant(input.variant);
    seed = parseSeed(input.seed);
    log = parseInputLog(game.parseInput, input.log, ARCADE_MAX_INPUTS);
    state = replayRun(game, variant, seed, log, ARCADE_MAX_TICKS);
  } catch (error) {
    const message = error instanceof ArcadeReplayError || error instanceof Error ? error.message : String(error);
    throw new MatchError(400, `Not a run that can be replayed: ${message}`);
  }
  const score = game.scoreOf(state);

  const info = db.prepare(`
    INSERT INTO arcade_scores (member_id, game, variant, score, seed, inputs, ticks, game_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (member_id, game_key) DO NOTHING
  `).run(memberId, game.id, variant, score, seed, JSON.stringify(log), state.tick, input.key);

  const best = db.prepare("SELECT MAX(score) AS best FROM arcade_scores WHERE member_id = ? AND game = ? AND variant = ?")
    .get(memberId, game.id, variant) as { best: number | null };
  return { recorded: info.changes > 0, score, best: best.best ?? score };
}

/** One member's runs at one game and variant, for the leaderboard. */
export interface ArcadeRow {
  id: string;
  name: string;
  game: string;
  variant: string;
  best: number;
  played: number;
}

interface ArcadeTally {
  member_id: string;
  game: string;
  variant: string;
  best: number;
  played: number;
}

export function arcadeStats(db: Db, names: Map<string, string>, since: string): { month: ArcadeRow[]; all: ArcadeRow[] } {
  const tally = (where: string, ...params: string[]): ArcadeRow[] =>
    (db.prepare(`
      SELECT member_id, game, variant, MAX(score) AS best, COUNT(*) AS played
      FROM arcade_scores ${where}
      GROUP BY member_id, game, variant
    `).all(...params) as ArcadeTally[]).map((row) => ({
      id: row.member_id,
      name: names.get(row.member_id) ?? row.member_id,
      game: row.game,
      variant: row.variant,
      best: row.best,
      played: row.played
    }));
  return { month: tally("WHERE finished_at >= ?", since), all: tally("") };
}
