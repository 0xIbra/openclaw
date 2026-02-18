import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

export type TaskDatabase = DatabaseSync;

export const TASK_SCHEMA_VERSION = 1;

export function resolveTasksDbPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "tasks", "tasks.sqlite");
}

export function openTaskDatabase(opts?: { dbPath?: string }): TaskDatabase {
  const dbPath = opts?.dbPath?.trim() ? path.resolve(opts.dbPath) : resolveTasksDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { DatabaseSync } = requireNodeSqlite();
  return new DatabaseSync(dbPath);
}

export function initializeTaskSchema(db: TaskDatabase): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      repo_root TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      archived_at_ms INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name_active
      ON projects(name)
      WHERE archived_at_ms IS NULL;

    CREATE INDEX IF NOT EXISTS idx_projects_name_archived
      ON projects(name, archived_at_ms);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      complexity TEXT,
      status TEXT NOT NULL,
      parent_task_id TEXT,
      assigned_agent_id TEXT,
      max_attempts INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL,
      relevant_paths_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      started_at_ms INTEGER,
      completed_at_ms INTEGER,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project_status_updated
      ON tasks(project_id, status, updated_at_ms);

    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
      ON tasks(assigned_agent_id, status);

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      depends_on_task_id TEXT NOT NULL,
      PRIMARY KEY(task_id, depends_on_task_id),
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_attempts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      ended_at_ms INTEGER,
      agent_id TEXT,
      notes TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  db.prepare(
    `INSERT INTO task_schema_meta(key, value)
     VALUES('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(String(TASK_SCHEMA_VERSION));
}
