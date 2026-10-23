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
