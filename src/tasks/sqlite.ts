import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { requireNodeSqlite } from "../memory/sqlite.js";

export type TaskDatabase = DatabaseSync;

export const TASK_SCHEMA_VERSION = 4;

function tableExists(db: TaskDatabase, tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`invalid SQLite identifier: ${identifier}`);
  }
}

export function getTaskSchemaVersion(db: TaskDatabase): number {
  if (!tableExists(db, "task_schema_meta")) {
    return tableExists(db, "tasks") || tableExists(db, "projects") ? 1 : 0;
  }

  const row = db
    .prepare(`SELECT value FROM task_schema_meta WHERE key = 'schema_version' LIMIT 1`)
    .get() as { value?: string } | undefined;
  if (!row?.value) {
    return tableExists(db, "tasks") || tableExists(db, "projects") ? 1 : 0;
  }

  const parsed = Number.parseInt(row.value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 1;
  }
  return parsed;
}

export function setTaskSchemaVersion(db: TaskDatabase, version: number): void {
  db.prepare(
    `INSERT INTO task_schema_meta(key, value)
     VALUES('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(String(version));
}

export function ensureColumn(db: TaskDatabase, table: string, column: string, ddl: string): void {
  assertSafeIdentifier(table);
  assertSafeIdentifier(column);

  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

export function resolveTasksDbPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "tasks", "tasks.sqlite");
}

export function openTaskDatabase(opts?: { dbPath?: string }): TaskDatabase {
  const dbPath = opts?.dbPath?.trim() ? path.resolve(opts.dbPath) : resolveTasksDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const { DatabaseSync } = requireNodeSqlite();
  return new DatabaseSync(dbPath);
}

function initializeBaseSchema(db: TaskDatabase): void {
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
}

function migrateTaskSchemaV1ToV2(db: TaskDatabase): void {
  const nowMs = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        lead_agent_id TEXT,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        archived_at_ms INTEGER
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_active_ci
        ON teams(lower(name))
        WHERE archived_at_ms IS NULL;

      CREATE TABLE IF NOT EXISTS team_members (
        team_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('lead', 'member')),
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(team_id, agent_id),
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_team_members_team_role
        ON team_members(team_id, role);

      CREATE INDEX IF NOT EXISTS idx_team_members_agent_id
        ON team_members(agent_id);

      CREATE TABLE IF NOT EXISTS project_repos (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        repo_key TEXT NOT NULL,
        role TEXT NOT NULL,
        repo_root TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        branch_prefix TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_repos_project_repo_key
        ON project_repos(project_id, repo_key);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_repos_project_repo_root
        ON project_repos(project_id, repo_root);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_repos_single_primary
        ON project_repos(project_id)
        WHERE is_primary = 1;

      CREATE INDEX IF NOT EXISTS idx_project_repos_project_primary
        ON project_repos(project_id, is_primary);

      CREATE TABLE IF NOT EXISTS task_claims (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        team_id TEXT,
        lease_token TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active', 'released', 'expired')),
        leased_at_ms INTEGER NOT NULL,
        heartbeat_at_ms INTEGER NOT NULL,
        lease_expires_at_ms INTEGER NOT NULL,
        released_at_ms INTEGER,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_claims_task_active
        ON task_claims(task_id)
        WHERE state = 'active';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_claims_lease_token
        ON task_claims(lease_token);

      CREATE INDEX IF NOT EXISTS idx_task_claims_lease_expiry_state
        ON task_claims(state, lease_expires_at_ms);
    `);

    ensureColumn(
      db,
      "projects",
      "primary_team_id",
      "primary_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL",
    );

    ensureColumn(db, "tasks", "team_id", "team_id TEXT REFERENCES teams(id) ON DELETE SET NULL");
    ensureColumn(
      db,
      "tasks",
      "current_attempt_id",
      "current_attempt_id TEXT REFERENCES task_attempts(id) ON DELETE SET NULL",
    );
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_team_status
        ON tasks(team_id, status, updated_at_ms);
    `);

    ensureColumn(db, "task_attempts", "attempt_number", "attempt_number INTEGER");
    ensureColumn(
      db,
      "task_attempts",
      "claim_id",
      "claim_id TEXT REFERENCES task_claims(id) ON DELETE SET NULL",
    );
    ensureColumn(
      db,
      "task_attempts",
      "team_id",
      "team_id TEXT REFERENCES teams(id) ON DELETE SET NULL",
    );
    ensureColumn(db, "task_attempts", "session_backend", "session_backend TEXT");
    ensureColumn(db, "task_attempts", "session_id", "session_id TEXT");
    ensureColumn(db, "task_attempts", "summary", "summary TEXT");
    ensureColumn(db, "task_attempts", "error_text", "error_text TEXT");
    ensureColumn(
      db,
      "task_attempts",
      "command_outcome_json",
      "command_outcome_json TEXT NOT NULL DEFAULT '{}'",
    );
    ensureColumn(
      db,
      "task_attempts",
      "test_outcome_json",
      "test_outcome_json TEXT NOT NULL DEFAULT '{}'",
    );
    ensureColumn(
      db,
      "task_attempts",
      "changed_files_json",
      "changed_files_json TEXT NOT NULL DEFAULT '[]'",
    );
    ensureColumn(db, "task_attempts", "metrics_json", "metrics_json TEXT NOT NULL DEFAULT '{}'");
    ensureColumn(db, "task_attempts", "created_at_ms", "created_at_ms INTEGER");
    ensureColumn(db, "task_attempts", "updated_at_ms", "updated_at_ms INTEGER");

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_attempts_task_started
        ON task_attempts(task_id, started_at_ms DESC);

      CREATE INDEX IF NOT EXISTS idx_task_attempts_claim_id
        ON task_attempts(claim_id);
    `);

    db.prepare(
      `UPDATE task_attempts SET summary = notes WHERE summary IS NULL AND notes IS NOT NULL`,
    ).run();

    const attempts = db
      .prepare(
        `SELECT id, task_id
         FROM task_attempts
         ORDER BY task_id ASC, started_at_ms ASC, rowid ASC`,
      )
      .all() as Array<{ id: string; task_id: string }>;
    const setAttemptNumber = db.prepare(
      `UPDATE task_attempts
       SET attempt_number = ?
       WHERE id = ? AND attempt_number IS NULL`,
    );
    let currentTaskId = "";
    let attemptNumber = 0;
    for (const attempt of attempts) {
      if (attempt.task_id !== currentTaskId) {
        currentTaskId = attempt.task_id;
        attemptNumber = 1;
      } else {
        attemptNumber += 1;
      }
      setAttemptNumber.run(attemptNumber, attempt.id);
    }

    db.prepare(
      `UPDATE task_attempts
       SET created_at_ms = COALESCE(created_at_ms, started_at_ms, ?)
       WHERE created_at_ms IS NULL`,
    ).run(nowMs);
    db.prepare(
      `UPDATE task_attempts
       SET updated_at_ms = COALESCE(updated_at_ms, ended_at_ms, started_at_ms, created_at_ms, ?)
       WHERE updated_at_ms IS NULL`,
    ).run(nowMs);

    const projectsWithRoot = db
      .prepare(
        `SELECT id, repo_root, created_at_ms, updated_at_ms
         FROM projects
         WHERE repo_root IS NOT NULL AND trim(repo_root) != ''`,
      )
      .all() as Array<{
      id: string;
      repo_root: string;
      created_at_ms: number;
      updated_at_ms: number;
    }>;

    const findPrimaryRepo = db.prepare(
      `SELECT id
       FROM project_repos
       WHERE project_id = ? AND is_primary = 1
       LIMIT 1`,
    );
    const findRepoByRoot = db.prepare(
      `SELECT id
       FROM project_repos
       WHERE project_id = ? AND repo_root = ?
       LIMIT 1`,
    );
    const findDefaultRepo = db.prepare(
      `SELECT id
       FROM project_repos
       WHERE project_id = ? AND repo_key = 'default'
       LIMIT 1`,
    );
    const clearPrimary = db.prepare(`UPDATE project_repos SET is_primary = 0 WHERE project_id = ?`);
    const promoteRepo = db.prepare(
      `UPDATE project_repos
       SET is_primary = 1, role = 'primary', updated_at_ms = ?
       WHERE id = ?`,
    );
    const promoteDefaultRepo = db.prepare(
      `UPDATE project_repos
       SET role = 'primary', repo_root = ?, is_primary = 1, updated_at_ms = ?
       WHERE id = ?`,
    );
    const insertPrimaryRepo = db.prepare(
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
      ) VALUES (?, ?, ?, 'primary', ?, 1, NULL, ?, ?)`,
    );

    for (const project of projectsWithRoot) {
      const existingPrimary = findPrimaryRepo.get(project.id) as { id?: string } | undefined;
      if (existingPrimary?.id) {
        continue;
      }

      clearPrimary.run(project.id);
      const existingRepo = findRepoByRoot.get(project.id, project.repo_root) as
        | { id?: string }
        | undefined;
      if (existingRepo?.id) {
        promoteRepo.run(project.updated_at_ms ?? nowMs, existingRepo.id);
        continue;
      }

      const existingDefaultRepo = findDefaultRepo.get(project.id) as { id?: string } | undefined;
      if (existingDefaultRepo?.id) {
        promoteDefaultRepo.run(
          project.repo_root,
          project.updated_at_ms ?? nowMs,
          existingDefaultRepo.id,
        );
        continue;
      }

      insertPrimaryRepo.run(
        randomUUID(),
        project.id,
        "default",
        project.repo_root,
        project.created_at_ms ?? nowMs,
        project.updated_at_ms ?? nowMs,
      );
    }

    setTaskSchemaVersion(db, 2);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateTaskSchemaV2ToV3(db: TaskDatabase): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_bus_messages (
        id TEXT PRIMARY KEY,
        sender_agent_id TEXT NOT NULL,
        receiver_agent_id TEXT NOT NULL,
        task_id TEXT,
        message_type TEXT NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        dedupe_key TEXT,
        state TEXT NOT NULL CHECK (state IN ('pending', 'leased', 'acked', 'expired', 'dead_letter')),
        delivery_count INTEGER NOT NULL DEFAULT 0,
        max_deliveries INTEGER NOT NULL DEFAULT 20,
        created_at_ms INTEGER NOT NULL,
        available_at_ms INTEGER NOT NULL,
        leased_at_ms INTEGER,
        lease_expires_at_ms INTEGER,
        acked_at_ms INTEGER,
        expires_at_ms INTEGER,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_bus_receiver_state_available
        ON task_bus_messages(receiver_agent_id, state, available_at_ms);

      CREATE INDEX IF NOT EXISTS idx_task_bus_state_lease_expires
        ON task_bus_messages(state, lease_expires_at_ms);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_bus_receiver_dedupe_active
        ON task_bus_messages(receiver_agent_id, dedupe_key)
        WHERE dedupe_key IS NOT NULL AND state != 'expired';

      CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status_priority_updated
        ON tasks(assigned_agent_id, status, priority, updated_at_ms);

      CREATE INDEX IF NOT EXISTS idx_task_claims_agent_state_lease_expiry
        ON task_claims(agent_id, state, lease_expires_at_ms);

      CREATE INDEX IF NOT EXISTS idx_task_attempts_task_attempt_number
        ON task_attempts(task_id, attempt_number DESC);
    `);

    setTaskSchemaVersion(db, 3);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateTaskSchemaV3ToV4(db: TaskDatabase): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_question_threads (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        task_id TEXT,
        lead_agent_id TEXT NOT NULL,
        requester_agent_id TEXT NOT NULL,
        question_message_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'answered', 'escalated')),
        opened_at_ms INTEGER NOT NULL,
        reminder_due_at_ms INTEGER NOT NULL,
        escalate_due_at_ms INTEGER NOT NULL,
        last_notified_at_ms INTEGER,
        answer_message_id TEXT,
        resolved_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY(question_message_id) REFERENCES task_bus_messages(id) ON DELETE CASCADE,
        FOREIGN KEY(answer_message_id) REFERENCES task_bus_messages(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_question_threads_team_status_due
        ON task_question_threads(team_id, status, reminder_due_at_ms, escalate_due_at_ms);

      CREATE INDEX IF NOT EXISTS idx_task_question_threads_due_reminder
        ON task_question_threads(status, reminder_due_at_ms);

      CREATE INDEX IF NOT EXISTS idx_task_question_threads_due_escalate
        ON task_question_threads(status, escalate_due_at_ms);

      CREATE INDEX IF NOT EXISTS idx_task_question_threads_task
        ON task_question_threads(task_id, status);
    `);

    ensureColumn(db, "task_bus_messages", "correlation_id", "correlation_id TEXT");
    ensureColumn(db, "task_bus_messages", "reply_to_message_id", "reply_to_message_id TEXT");

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_bus_receiver_correlation
        ON task_bus_messages(receiver_agent_id, correlation_id, created_at_ms);

      CREATE INDEX IF NOT EXISTS idx_task_bus_reply_to
        ON task_bus_messages(reply_to_message_id, created_at_ms);
    `);

    setTaskSchemaVersion(db, 4);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function initializeTaskSchema(db: TaskDatabase): void {
  db.exec("PRAGMA foreign_keys = ON;");
  initializeBaseSchema(db);

  const currentVersion = getTaskSchemaVersion(db);
  if (currentVersion <= 0) {
    setTaskSchemaVersion(db, 1);
  }

  const effectiveVersion = getTaskSchemaVersion(db);
  if (effectiveVersion < 2) {
    migrateTaskSchemaV1ToV2(db);
  }
  if (getTaskSchemaVersion(db) < 3) {
    migrateTaskSchemaV2ToV3(db);
  }
  if (getTaskSchemaVersion(db) < 4) {
    migrateTaskSchemaV3ToV4(db);
  }

  if (getTaskSchemaVersion(db) < TASK_SCHEMA_VERSION) {
    setTaskSchemaVersion(db, TASK_SCHEMA_VERSION);
  }
}
