import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskService } from "./service.js";
import {
  getTaskSchemaVersion,
  initializeTaskSchema,
  openTaskDatabase,
  setTaskSchemaVersion,
} from "./sqlite.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-v4-migration-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task sqlite v4 migration", () => {
  it("migrates v3 fixture to v4 with additive orchestration columns/tables", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const project = service.createProject({ name: "Phase 4" });
    const task = service.createTask({
      projectId: project.id,
      title: "seed rows",
      description: "verify additive migration",
      type: "feature",
      status: "backlog",
    });
    const publish = service.publishBusMessage({
      senderAgentId: "agent-a",
      receiverAgentId: "agent-b",
      taskId: task.id,
      messageType: "info",
      body: "hello",
    });
    service.close();

    const downgraded = openTaskDatabase({ dbPath });
    downgraded.exec(`
      DROP TABLE IF EXISTS task_question_threads;
    `);
    downgraded.exec(`
      CREATE TABLE IF NOT EXISTS task_question_threads_backup (
        id TEXT PRIMARY KEY
      );
    `);
    downgraded.exec(`DROP TABLE task_question_threads_backup;`);
    setTaskSchemaVersion(downgraded, 3);
    downgraded.close();

    const db = openTaskDatabase({ dbPath });
    initializeTaskSchema(db);

    expect(getTaskSchemaVersion(db)).toBe(6);

    const questionThreadsTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_question_threads' LIMIT 1`,
      )
      .get() as { name?: string } | undefined;
    expect(questionThreadsTable?.name).toBe("task_question_threads");

    const busColumns = db.prepare(`PRAGMA table_info(task_bus_messages)`).all() as Array<{
      name?: string;
    }>;
    const busColumnNames = new Set(busColumns.map((column) => column.name ?? ""));
    expect(busColumnNames.has("correlation_id")).toBe(true);
    expect(busColumnNames.has("reply_to_message_id")).toBe(true);

    const preserved = db
      .prepare(`SELECT id, task_id FROM task_bus_messages WHERE id = ? LIMIT 1`)
      .get(publish.messageId) as { id?: string; task_id?: string } | undefined;
    expect(preserved?.id).toBe(publish.messageId);
    expect(preserved?.task_id).toBe(task.id);

    initializeTaskSchema(db);
    expect(getTaskSchemaVersion(db)).toBe(6);

    db.close();
  });
});
