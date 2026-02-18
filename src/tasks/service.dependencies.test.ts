import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskServiceError, createTaskService } from "./service.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tasks-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task service dependency guards", () => {
  it("blocks assigned/running/review/done when dependencies are incomplete", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });

    const project = service.createProject({ name: "Gateway hardening" });
    const dependency = service.createTask({
      projectId: project.id,
      title: "Ship auth migration",
      description: "Complete auth migration",
      type: "feature",
      status: "backlog",
    });

    const task = service.createTask({
      projectId: project.id,
      title: "Add retries",
      description: "Add retry logic to gateway",
      type: "feature",
      dependsOnTaskIds: [dependency.id],
    });

    service.transitionTask({ id: task.id, toStatus: "backlog" });

    expect(() =>
      service.transitionTask({
        id: task.id,
        toStatus: "assigned",
        assignedAgentId: "zed",
      }),
    ).toThrowError(TaskServiceError);

    service.transitionTask({ id: dependency.id, toStatus: "assigned", assignedAgentId: "zed" });
    service.transitionTask({ id: dependency.id, toStatus: "running" });
    service.transitionTask({ id: dependency.id, toStatus: "review" });
    service.transitionTask({ id: dependency.id, toStatus: "done" });

    const transitioned = service.transitionTask({
      id: task.id,
      toStatus: "assigned",
      assignedAgentId: "zed",
    });

    expect(transitioned.status).toBe("assigned");
    expect(transitioned.blockedByTaskIds).toEqual([]);
  });
});
