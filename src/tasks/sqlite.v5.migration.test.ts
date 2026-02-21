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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-v5-migration-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task sqlite v5 migration", () => {
  it("migrates v4 fixture to v5 with decomposition and review durability tables", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({ name: "Phase 8", leadAgentId: "lead-agent" });
    const project = service.createProject({ name: "Phase 8 Project" });
    const task = service.createTask({
      projectId: project.id,
      teamId: team.id,
      title: "parent",
      description: "verify migration",
      type: "feature",
      status: "backlog",
    });
    service.close();

    const downgraded = openTaskDatabase({ dbPath });
    downgraded.exec(`
      DROP TABLE IF EXISTS task_decomposition_runs;
      DROP TABLE IF EXISTS task_review_records;
    `);
    setTaskSchemaVersion(downgraded, 4);
    downgraded.close();

    const db = openTaskDatabase({ dbPath });
    initializeTaskSchema(db);

    expect(getTaskSchemaVersion(db)).toBe(6);

    const decompositionTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_decomposition_runs' LIMIT 1`,
      )
      .get() as { name?: string } | undefined;
    expect(decompositionTable?.name).toBe("task_decomposition_runs");

    const reviewTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_review_records' LIMIT 1`,
      )
      .get() as { name?: string } | undefined;
    expect(reviewTable?.name).toBe("task_review_records");

    const preservedTask = db
      .prepare(`SELECT id, project_id, team_id FROM tasks WHERE id = ? LIMIT 1`)
      .get(task.id) as { id?: string; project_id?: string; team_id?: string | null } | undefined;
    expect(preservedTask).toEqual({
      id: task.id,
      project_id: project.id,
      team_id: team.id,
    });

    const indexNames = new Set(
      (
        db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('task_decomposition_runs', 'task_review_records')`,
          )
          .all() as Array<{ name?: string }>
      )
        .map((row) => row.name ?? "")
        .filter(Boolean),
    );
    expect(indexNames.has("idx_task_decomposition_runs_parent_created")).toBe(true);
    expect(indexNames.has("idx_task_review_records_status_updated")).toBe(true);

    initializeTaskSchema(db);
    expect(getTaskSchemaVersion(db)).toBe(6);

    db.close();
  });
});
