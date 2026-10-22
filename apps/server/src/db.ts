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
  db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
  return db;
}

export type Db = Database.Database;
