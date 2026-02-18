import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getTaskSchemaVersion,
  initializeTaskSchema,
  openTaskDatabase,
  setTaskSchemaVersion,
} from "./sqlite.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-migration-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

function createV1Fixture(dbPath: string) {
  const db = openTaskDatabase({ dbPath });
  db.exec(`
    PRAGMA foreign_keys = ON;

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
      completed_at_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      depends_on_task_id TEXT NOT NULL,
      PRIMARY KEY(task_id, depends_on_task_id)
    );

    CREATE TABLE IF NOT EXISTS task_attempts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      ended_at_ms INTEGER,
      agent_id TEXT,
      notes TEXT
    );
  `);

  setTaskSchemaVersion(db, 1);

  db.prepare(
    `INSERT INTO projects (id, name, description, repo_root, created_at_ms, updated_at_ms, archived_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run("project-1", "Gateway", "Gateway project", "/repo/gateway", 1000, 2000);

  db.prepare(
    `INSERT INTO tasks (
      id,
      project_id,
      title,
      description,
      type,
      priority,
      complexity,
      status,
      parent_task_id,
      assigned_agent_id,
      max_attempts,
      attempt_count,
      relevant_paths_json,
      tags_json,
      created_by,
      created_at_ms,
      updated_at_ms,
      started_at_ms,
      completed_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "task-1",
    "project-1",
    "Build board",
    "Implement board tab",
    "feature",
    "high",
    null,
    "running",
    null,
    "ares",
    3,
    1,
    "[]",
    '["ui"]',
    "human",
    3000,
    4000,
    3500,
    null,
  );

  db.prepare(
    `INSERT INTO task_attempts (
      id,
      task_id,
      status,
      started_at_ms,
      ended_at_ms,
      agent_id,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run("attempt-1", "task-1", "failed", 5000, 5500, "ares", "command failed");

  db.close();
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task sqlite schema migration", () => {
  it("migrates v1 DB to v2 without losing task/project data", async () => {
    const dbPath = await createTempDbPath();
    createV1Fixture(dbPath);

    const db = openTaskDatabase({ dbPath });
    initializeTaskSchema(db);

    expect(getTaskSchemaVersion(db)).toBe(2);

    const projectCount = db.prepare(`SELECT COUNT(*) as count FROM projects`).get() as {
      count: number;
    };
    const taskCount = db.prepare(`SELECT COUNT(*) as count FROM tasks`).get() as { count: number };
    expect(projectCount.count).toBe(1);
    expect(taskCount.count).toBe(1);

    const taskRow = db
      .prepare(`SELECT id, project_id, team_id, current_attempt_id FROM tasks WHERE id = ? LIMIT 1`)
      .get("task-1") as
      | {
          id: string;
          project_id: string;
          team_id: string | null;
          current_attempt_id: string | null;
        }
      | undefined;
    expect(taskRow).toEqual({
      id: "task-1",
      project_id: "project-1",
      team_id: null,
      current_attempt_id: null,
    });

    const repoRows = db
      .prepare(`SELECT project_id, repo_key, role, repo_root, is_primary FROM project_repos`)
      .all() as Array<{
      project_id: string;
      repo_key: string;
      role: string;
      repo_root: string;
      is_primary: number;
    }>;
    expect(repoRows).toHaveLength(1);
    expect(repoRows[0]).toMatchObject({
      project_id: "project-1",
      repo_key: "default",
      role: "primary",
      repo_root: "/repo/gateway",
      is_primary: 1,
    });

    const attempt = db
      .prepare(
        `SELECT
          summary,
          command_outcome_json,
          test_outcome_json,
          changed_files_json,
          metrics_json,
          created_at_ms,
          updated_at_ms
         FROM task_attempts
         WHERE id = ?
         LIMIT 1`,
      )
      .get("attempt-1") as
      | {
          summary: string | null;
          command_outcome_json: string;
          test_outcome_json: string;
          changed_files_json: string;
          metrics_json: string;
          created_at_ms: number | null;
          updated_at_ms: number | null;
        }
      | undefined;

    expect(attempt?.summary).toBe("command failed");
    expect(attempt?.command_outcome_json).toBe("{}");
    expect(attempt?.test_outcome_json).toBe("{}");
    expect(attempt?.changed_files_json).toBe("[]");
    expect(attempt?.metrics_json).toBe("{}");
    expect(attempt?.created_at_ms).toBe(5000);
    expect(attempt?.updated_at_ms).toBe(5500);

    db.close();
  });

  it("is idempotent when migration runs multiple times", async () => {
    const dbPath = await createTempDbPath();
    createV1Fixture(dbPath);

    const db = openTaskDatabase({ dbPath });
    initializeTaskSchema(db);
    initializeTaskSchema(db);

    const repoCount = db.prepare(`SELECT COUNT(*) as count FROM project_repos`).get() as {
      count: number;
    };
    expect(repoCount.count).toBe(1);

    const claimTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_claims' LIMIT 1`,
      )
      .get() as { name?: string } | undefined;
    expect(claimTable?.name).toBe("task_claims");

    db.close();
  });

  it("promotes existing default repo row during backfill instead of inserting duplicates", async () => {
    const dbPath = await createTempDbPath();
    createV1Fixture(dbPath);

    const seeded = openTaskDatabase({ dbPath });
    seeded.exec(`
      CREATE TABLE IF NOT EXISTS project_repos (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        repo_key TEXT NOT NULL,
        role TEXT NOT NULL,
        repo_root TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        branch_prefix TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
    `);
    seeded
      .prepare(
        `INSERT INTO project_repos (
          id,
          project_id,
          repo_key,
          role,
          repo_root,
          is_primary,
          branch_prefix,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "repo-default",
        "project-1",
        "default",
        "service",
        "/repo/old-path",
        0,
        null,
        1000,
        2000,
      );
    setTaskSchemaVersion(seeded, 1);
    seeded.close();

    const db = openTaskDatabase({ dbPath });
    initializeTaskSchema(db);

    const repoRows = db
      .prepare(`SELECT id, repo_key, role, repo_root, is_primary FROM project_repos`)
      .all() as Array<{
      id: string;
      repo_key: string;
      role: string;
      repo_root: string;
      is_primary: number;
    }>;
    expect(repoRows).toHaveLength(1);
    expect(repoRows[0]).toEqual({
      id: "repo-default",
      repo_key: "default",
      role: "primary",
      repo_root: "/repo/gateway",
      is_primary: 1,
    });

    db.close();
  });
});
