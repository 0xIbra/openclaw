/**
 * Secret Audit Logger — records every secret access event (SPEC §4.7.8).
 *
 * Every scrub, inject, block, or detect action is logged so the human
 * can review: `openclaw secrets audit`.
 */

import { randomUUID } from "node:crypto";
import type { SecretAccessLog, SecretAction, SecretContext } from "./types.js";
import { initializeSecretsSchema, openSecretsDatabase, type SecretsDatabase } from "./sqlite.js";

// ── SQLite row shape ────────────────────────────────────────────────────

type AuditRow = {
  id: string;
  timestamp_ms: number;
  secret_name: string;
  agent_id: string | null;
  task_id: string | null;
  action: string;
  context: string;
};

function mapRow(row: AuditRow): SecretAccessLog {
  return {
    id: row.id,
    timestampMs: row.timestamp_ms,
    secretName: row.secret_name,
    agentId: row.agent_id,
    taskId: row.task_id,
    action: row.action as SecretAction,
    context: row.context as SecretContext,
  };
}

// ── Audit Logger ────────────────────────────────────────────────────────

export type SecretAuditLogger = ReturnType<typeof createSecretAuditLogger>;

export function createSecretAuditLogger(opts?: { db?: SecretsDatabase; dbPath?: string }) {
  const db = opts?.db ?? openSecretsDatabase({ dbPath: opts?.dbPath });
  const ownsDb = !opts?.db;
  if (!opts?.db) {
    initializeSecretsSchema(db);
  }

  const insertStmt = db.prepare(
    `INSERT INTO secret_access_log (id, timestamp_ms, secret_name, agent_id, task_id, action, context)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const listStmt = db.prepare(`SELECT * FROM secret_access_log ORDER BY timestamp_ms DESC LIMIT ?`);

  const listByAgentStmt = db.prepare(
    `SELECT * FROM secret_access_log WHERE agent_id = ? ORDER BY timestamp_ms DESC LIMIT ?`,
  );

  const listByActionStmt = db.prepare(
    `SELECT * FROM secret_access_log WHERE action = ? ORDER BY timestamp_ms DESC LIMIT ?`,
  );

  /**
   * Log a secret access event.
   */
  function log(params: {
    secretName: string;
    agentId?: string | null;
    taskId?: string | null;
    action: SecretAction;
    context: SecretContext;
  }): SecretAccessLog {
    const id = randomUUID();
    const now = Date.now();
    insertStmt.run(
      id,
      now,
      params.secretName,
      params.agentId ?? null,
      params.taskId ?? null,
      params.action,
      params.context,
    );
    return {
      id,
      timestampMs: now,
      secretName: params.secretName,
      agentId: params.agentId ?? null,
      taskId: params.taskId ?? null,
      action: params.action,
      context: params.context,
    };
  }

  /**
   * Query the audit log.  Returns most recent entries first.
   */
  function query(opts?: {
    agentId?: string;
    action?: SecretAction;
    limit?: number;
  }): SecretAccessLog[] {
    const limit = opts?.limit ?? 100;

    if (opts?.agentId) {
      return (listByAgentStmt.all(opts.agentId, limit) as AuditRow[]).map(mapRow);
    }
    if (opts?.action) {
      return (listByActionStmt.all(opts.action, limit) as AuditRow[]).map(mapRow);
    }
    return (listStmt.all(limit) as AuditRow[]).map(mapRow);
  }

  function close(): void {
    if (ownsDb) {
      db.close();
    }
  }

  return { log, query, close };
}
