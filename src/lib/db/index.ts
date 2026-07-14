import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import * as schema from "./schema";

const DDL = `
CREATE TABLE IF NOT EXISTS years (
  year INTEGER PRIMARY KEY,
  unlock_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reflection_text TEXT,
  reflection_status TEXT NOT NULL DEFAULT 'none',
  reflection_error TEXT
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  sealed_at TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  prompt_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_year_week ON entries(year, week_number);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function createDb(file: string) {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
