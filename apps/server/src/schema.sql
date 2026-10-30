-- The games server's own data (docs/plan.md → Phase 2). Members are known by
-- the ids the home app forwards; nothing about them is stored beyond a display
-- name, so a match list can name an opponent who has not visited lately.
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One online match. The move list is the record: the position is replayed
-- through the engine on every read, so the database can never disagree with
-- the rules. Seats: 0 blue (moves first), 1 red.
CREATE TABLE IF NOT EXISTS matches (
  id            TEXT PRIMARY KEY,
  game          TEXT NOT NULL,
  options       TEXT NOT NULL,                 -- JSON, the game's options
  blue_id       TEXT NOT NULL,
  red_id        TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('invited', 'playing', 'finished', 'declined', 'cancelled')),
  moves         TEXT NOT NULL DEFAULT '[]',    -- JSON array of the game's moves
  move_count    INTEGER NOT NULL DEFAULT 0,
  turn          INTEGER,                       -- 0 or 1 while playing
  finish_reason TEXT,                          -- the engine's reason once finished
  winner        INTEGER,                       -- 0, 1, or NULL for a draw
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at   TEXT
);

CREATE INDEX IF NOT EXISTS matches_blue ON matches (blue_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS matches_red ON matches (red_id, updated_at DESC);

-- A line said in a match's Comms panel. Kept with the match; after_move is the
-- move count when it was said, so the panel can slot it between the moves.
CREATE TABLE IF NOT EXISTS match_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id   TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL,
  text       TEXT NOT NULL,
  after_move INTEGER NOT NULL,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS match_messages_match ON match_messages (match_id, id);

-- The seed a match was dealt from, for a game dealt at random (Dominoes). Kept
-- apart from the match row, which is listed and sent to both players: the
-- seed decides every hand, so whoever saw it would know the other hand and
-- the boneyard. Only replay() in matches.ts reads it.
CREATE TABLE IF NOT EXISTS match_secrets (
  match_id TEXT PRIMARY KEY REFERENCES matches (id) ON DELETE CASCADE,
  seed     INTEGER NOT NULL
);

-- What happened, for the admin: who was refused at the gateway, who invited whom,
-- how a match ended, which move was thrown out, what broke. Read by the home app
-- through the gateway (GET /games/api/admin/events) and pruned after a season.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  level      TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  event      TEXT NOT NULL,
  actor_id   TEXT,
  actor_name TEXT,
  match_id   TEXT,
  ip         TEXT,
  request_id TEXT,
  detail     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS events_at ON events (at DESC);
CREATE INDEX IF NOT EXISTS events_event ON events (event, at DESC);

-- A game against the computer, played in a member's browser and reported here
-- when it ends, for the family leaderboard's vs Computer tab. The game itself
-- never reaches the server; game_key is the browser's id for it, so a result
-- reported twice (a reload of the finished game) is kept once.
CREATE TABLE IF NOT EXISTS computer_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL,
  game        TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('easy', 'normal', 'hard')),
  result      TEXT NOT NULL CHECK (result IN ('won', 'lost', 'drawn')),
  game_key    TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (member_id, game_key)
);

CREATE INDEX IF NOT EXISTS computer_results_at ON computer_results (finished_at DESC);

-- Chess puzzles: a member's first try at each puzzle, with their puzzle
-- rating before and after it (their rating is their latest row's). A second
-- try is practice and is not kept. hints: 0 none, 1 the piece, 2 the move.
CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     TEXT NOT NULL,
  puzzle_id     TEXT NOT NULL,
  solved        INTEGER NOT NULL CHECK (solved IN (0, 1)),
  hints         INTEGER NOT NULL CHECK (hints BETWEEN 0 AND 2),
  rating_before INTEGER NOT NULL,
  rating_after  INTEGER NOT NULL,
  finished_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (member_id, puzzle_id)
);

-- Crossmath: a member's first solve of each puzzle, with their rating before and
-- after it (their rating is their latest row's). best_seconds is the quickest
-- solve with no hints, this one or a later try; seconds is NULL for a solve from
-- before the clock always ran.
CREATE TABLE IF NOT EXISTS crossmath_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     TEXT NOT NULL,
  puzzle_id     TEXT NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('easy', 'medium', 'hard', 'expert')),
  hints         INTEGER NOT NULL,
  seconds       INTEGER,
  best_seconds  INTEGER,
  rating_before INTEGER NOT NULL,
  rating_after  INTEGER NOT NULL,
  finished_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (member_id, puzzle_id)
);

-- A finished game played on one device (against the computer, or two at one
-- screen), kept for review. Online matches are in matches already. game_key
-- is the browser's own id for the game, so a resend changes nothing; moves
-- were replayed through the rules before they were kept.
CREATE TABLE IF NOT EXISTS game_records (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL,
  game          TEXT NOT NULL,
  game_key      TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('computer', 'local')),
  level         TEXT CHECK (level IN ('easy', 'normal', 'hard')),
  seat          INTEGER,
  moves         TEXT NOT NULL,
  finish_reason TEXT NOT NULL,
  winner        INTEGER,
  finished_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (member_id, game_key)
);

CREATE INDEX IF NOT EXISTS game_records_member ON game_records (member_id, finished_at DESC);

-- A finished run of a game for one player (arcade.ts). The score is what the
-- server's own replay of seed + inputs came to, never a number the browser
-- sent; the inputs are kept so the run can be replayed again. game_key is the
-- browser's id for the run, so a resend changes nothing.
CREATE TABLE IF NOT EXISTS arcade_scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL,
  game        TEXT NOT NULL,
  variant     TEXT NOT NULL,
  score       INTEGER NOT NULL,
  seed        INTEGER NOT NULL,
  inputs      TEXT NOT NULL,                   -- JSON [[tick, input], …]
  ticks       INTEGER NOT NULL,
  game_key    TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (member_id, game_key)
);

CREATE INDEX IF NOT EXISTS arcade_scores_board ON arcade_scores (game, variant, score DESC);
