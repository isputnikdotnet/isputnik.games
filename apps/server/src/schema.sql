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
