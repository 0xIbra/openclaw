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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-v3-migration-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task sqlite v3 migration", () => {
  it("migrates v2 fixture to v3 and preserves existing rows", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const project = service.createProject({ name: "Phase 3" });
    const task = service.createTask({
      projectId: project.id,
      title: "wire runtime apis",
      description: "phase 3 runtime rpcs",
      type: "feature",
      status: "backlog",
    });
    service.close();

    const downgraded = openTaskDatabase({ dbPath });
    downgraded.exec(`DROP TABLE IF EXISTS task_bus_messages;`);
    setTaskSchemaVersion(downgraded, 2);
    downgraded.close();

    const db = openTaskDatabase({ dbPath });
    initializeTaskSchema(db);

    expect(getTaskSchemaVersion(db)).toBe(3);
    const busTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_bus_messages' LIMIT 1`,
      )
      .get() as { name?: string } | undefined;
    expect(busTable?.name).toBe("task_bus_messages");

    const projectCount = db.prepare(`SELECT COUNT(*) as count FROM projects`).get() as {
      count: number;
    };
    const taskRow = db
      .prepare(`SELECT id, project_id FROM tasks WHERE id = ? LIMIT 1`)
      .get(task.id) as { id: string; project_id: string } | undefined;
    expect(projectCount.count).toBe(1);
    expect(taskRow).toEqual({ id: task.id, project_id: project.id });

    initializeTaskSchema(db);
    expect(getTaskSchemaVersion(db)).toBe(3);

    db.close();
  });
});
