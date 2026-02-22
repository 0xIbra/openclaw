import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { v4 as uuidv4 } from "uuid";
import type {
  Agent,
  AgentRow,
  AgentStatus,
  AgentType,
  AgentAuth,
  Message,
  MessageDirection,
  MessageRow,
  Task,
  TaskRow,
  TaskStatus,
} from "./types.ts";

// ─── Database path ────────────────────────────────────────────────────────────

const dataDir = process.env.BLACKBOX_DATA_DIR ?? path.join(os.homedir(), ".blackbox");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "blackbox.sqlite");

// ─── Init ─────────────────────────────────────────────────────────────────────

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(dbPath);
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      type         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'offline',
      workspace_dir TEXT NOT NULL,
      auth_json    TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id           TEXT PRIMARY KEY,
      agent_id     TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
      created_at   INTEGER NOT NULL,
      started_at   INTEGER,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id        TEXT PRIMARY KEY,
      agent_id  TEXT NOT NULL,
      direction TEXT NOT NULL,
      content   TEXT NOT NULL,
      ts        INTEGER NOT NULL
    );
  `);
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AgentType,
    status: row.status as AgentStatus,
    workspaceDir: row.workspace_dir,
    auth: JSON.parse(row.auth_json) as AgentAuth,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    agentId: row.agent_id,
    direction: row.direction as MessageDirection,
    content: row.content,
    ts: row.ts,
  };
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export function getAgents(): Agent[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM agents ORDER BY created_at ASC").all() as AgentRow[];
  return rows.map(rowToAgent);
}

export function getAgent(id: string): Agent {
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
  if (!row) {
    throw new Error(`Agent not found: ${id}`);
  }
  return rowToAgent(row);
}

export function createAgent(params: {
  name: string;
  type: AgentType;
  workspaceDir?: string;
  auth: AgentAuth;
}): Agent {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  const workspaceDir = params.workspaceDir ?? path.join(dataDir, "agents", params.name);
  db.prepare(
    `INSERT INTO agents (id, name, type, status, workspace_dir, auth_json, created_at, updated_at)
     VALUES (?, ?, ?, 'offline', ?, ?, ?, ?)`,
  ).run(id, params.name, params.type, workspaceDir, JSON.stringify(params.auth), now, now);
  return getAgent(id);
}

export function updateAgent(
  id: string,
  fields: Partial<{
    name: string;
    type: AgentType;
    status: AgentStatus;
    workspaceDir: string;
    auth: AgentAuth;
  }>,
): Agent {
  const db = getDb();
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (fields.name !== undefined) {
    sets.push("name = ?");
    values.push(fields.name);
  }
  if (fields.type !== undefined) {
    sets.push("type = ?");
    values.push(fields.type);
  }
  if (fields.status !== undefined) {
    sets.push("status = ?");
    values.push(fields.status);
  }
  if (fields.workspaceDir !== undefined) {
    sets.push("workspace_dir = ?");
    values.push(fields.workspaceDir);
  }
  if (fields.auth !== undefined) {
    sets.push("auth_json = ?");
    values.push(JSON.stringify(fields.auth));
  }

  values.push(id);
  db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getAgent(id);
}

export function deleteAgent(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  db.prepare("DELETE FROM tasks WHERE agent_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE agent_id = ?").run(id);
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function getTasks(agentId?: string): Task[] {
  const db = getDb();
  const rows = agentId
    ? (db
        .prepare("SELECT * FROM tasks WHERE agent_id = ? ORDER BY created_at ASC")
        .all(agentId) as TaskRow[])
    : (db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all() as TaskRow[]);
  return rows.map(rowToTask);
}

export function getTask(id: string): Task {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  if (!row) {
    throw new Error(`Task not found: ${id}`);
  }
  return rowToTask(row);
}

export function createTask(params: { agentId: string; title: string; description: string }): Task {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();
  db.prepare(
    `INSERT INTO tasks (id, agent_id, title, description, status, created_at, started_at, completed_at)
     VALUES (?, ?, ?, ?, 'queued', ?, NULL, NULL)`,
  ).run(id, params.agentId, params.title, params.description, now);
  return getTask(id);
}

export function updateTask(
  id: string,
  fields: Partial<{
    status: TaskStatus;
    startedAt: number | null;
    completedAt: number | null;
  }>,
): Task {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.status !== undefined) {
    sets.push("status = ?");
    values.push(fields.status);
  }
  if (fields.startedAt !== undefined) {
    sets.push("started_at = ?");
    values.push(fields.startedAt);
  }
  if (fields.completedAt !== undefined) {
    sets.push("completed_at = ?");
    values.push(fields.completedAt);
  }

  if (sets.length === 0) {
    return getTask(id);
  }
  values.push(id);
  db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getTask(id);
}

export function deleteTask(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function getMessages(agentId: string, limit = 200): Message[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages WHERE agent_id = ? ORDER BY ts ASC LIMIT ?")
    .all(agentId, limit) as MessageRow[];
  return rows.map(rowToMessage);
}

export function createMessage(params: {
  agentId: string;
  direction: MessageDirection;
  content: string;
}): Message {
  const db = getDb();
  const id = uuidv4();
  const ts = Date.now();
  db.prepare(
    `INSERT INTO messages (id, agent_id, direction, content, ts)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, params.agentId, params.direction, params.content, ts);
  return {
    id,
    agentId: params.agentId,
    direction: params.direction,
    content: params.content,
    ts,
  };
}
