import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

// The server's SQLite file: DB_PATH, else data/games.sqlite under the repo root
// (the image sets /config/games.sqlite). ":memory:" for the tests. The schema is
// idempotent (CREATE IF NOT EXISTS), applied on every open; a column added later
// goes in as an ALTER guarded by a lookup, here, in order.
const here = path.dirname(fileURLToPath(import.meta.url));

export function openDatabase(file: string): Database.Database {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  upgradeDatabase(db);
  return db;
}

/** This version's schema on a database of any older one: what opening does, and
 *  what a backup goes through before it is restored (restore.ts). */
export function upgradeDatabase(db: Database.Database): void {
  db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
  // 0.5.0: Sea Battle became Star Battle; matches recorded under the old game
  // id replay through the same rules under the new one. Idempotent.
  db.prepare("UPDATE matches SET game = 'starbattle' WHERE game = 'seabattle'").run();
  // 0.27.0: chess on the clock. A table made before has neither column; the
  // CREATE above leaves an existing table as it was.
  const columns = new Set((db.prepare("PRAGMA table_info(matches)").all() as { name: string }[]).map((c) => c.name));
  if (!columns.has("move_times")) db.exec("ALTER TABLE matches ADD COLUMN move_times TEXT NOT NULL DEFAULT '[]'");
  if (!columns.has("turn_started_at")) db.exec("ALTER TABLE matches ADD COLUMN turn_started_at TEXT");
}

export type Db = Database.Database;
