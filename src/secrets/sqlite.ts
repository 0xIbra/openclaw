/**
 * SQLite persistence for secrets vault and audit log (SPEC §4.7).
 *
 * Follows the same conventions as src/tasks/sqlite.ts:
 *  - Uses node:sqlite via requireNodeSqlite()
 *  - State dir resolved from config/paths
 *  - WAL mode for concurrent reads
 */

import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

export type SecretsDatabase = DatabaseSync;

export const SECRETS_SCHEMA_VERSION = 1;

export function resolveSecretsDbPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "secrets", "secrets.sqlite");
}

export function openSecretsDatabase(opts?: { dbPath?: string }): SecretsDatabase {
  const dbPath = opts?.dbPath?.trim() ? path.resolve(opts.dbPath) : resolveSecretsDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { DatabaseSync } = requireNodeSqlite();
  return new DatabaseSync(dbPath);
}

export function initializeSecretsSchema(db: SecretsDatabase): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS secrets_schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Known secrets tracked by the vault
    CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      pattern_kind TEXT NOT NULL,
      pattern_label TEXT NOT NULL,
      pattern_value TEXT NOT NULL,
      encrypted_value TEXT,
      source TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_secrets_source
      ON secrets(source);

    -- Audit log of every secret access
    CREATE TABLE IF NOT EXISTS secret_access_log (
      id TEXT PRIMARY KEY,
      timestamp_ms INTEGER NOT NULL,
      secret_name TEXT NOT NULL,
      agent_id TEXT,
      task_id TEXT,
      action TEXT NOT NULL,
      context TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_secret_access_log_time
      ON secret_access_log(timestamp_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_secret_access_log_agent
      ON secret_access_log(agent_id, timestamp_ms DESC);
  `);

  db.prepare(
    `INSERT INTO secrets_schema_meta(key, value)
     VALUES('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(String(SECRETS_SCHEMA_VERSION));
}
