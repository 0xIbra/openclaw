import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskService } from "./service.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tasks-roundtrip-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task service sqlite persistence", () => {
  it("persists projects and tasks across service reopen", async () => {
    const dbPath = await createTempDbPath();
    const first = createTaskService({ dbPath });

    const project = first.createProject({
      name: "Phase 2",
      description: "Task engine slice",
    });
    const task = first.createTask({
      projectId: project.id,
      title: "Create board view",
      description: "Implement board tab in control ui",
      type: "feature",
      priority: "high",
      tags: ["ui", "phase2"],
    });

    first.close();

    const reopened = createTaskService({ dbPath });
    const projects = reopened.listProjects();
    const tasks = reopened.listTasks({ projectId: project.id });

    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe("Phase 2");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe(task.id);
    expect(tasks[0]?.tags).toEqual(["ui", "phase2"]);

    reopened.close();
  });
});
