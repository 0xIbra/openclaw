import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskExecutor } from "./types.js";
import { createTaskService } from "../service.js";
import { createTaskWorker } from "./worker.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-worker-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task worker", () => {
  it("claims assigned tasks and finishes attempt lifecycle", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const project = service.createProject({ name: "Worker Success" });
    const task = service.createTask({
      projectId: project.id,
      title: "implement worker loop",
      description: "complete assigned task",
      type: "feature",
      status: "backlog",
      maxAttempts: 2,
    });
    service.transitionTask({ id: task.id, toStatus: "assigned", assignedAgentId: "agent-a" });

    const executor: TaskExecutor = {
      execute: async () => ({
        status: "success",
        summary: "Worker completed implementation",
        changedFiles: ["src/tasks/runtime/worker.ts"],
        commandOutcome: { commands: 2 },
        testOutcome: { passed: 3, failed: 0 },
        metrics: { durationMs: 25 },
        session: { backend: "embedded", id: "session-success" },
      }),
    };

    const worker = createTaskWorker({
      taskService: service,
      executor,
      agentId: "agent-a",
      teamIds: ["team-1"],
      idlePollMs: 10,
      heartbeatIntervalMs: 20,
      leaseDurationMs: 500,
      maxBackoffMs: 200,
    });

    worker.start();
    await waitFor(() => service.getTask(task.id)?.status === "review");
    await worker.stop();

    const updatedTask = service.getTask(task.id);
    expect(updatedTask?.attemptCount).toBe(1);
    expect(updatedTask?.status).toBe("review");

    const attempts = service.listTaskAttempts(task.id, 5);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: "completed",
      summary: "Worker completed implementation",
      sessionBackend: "embedded",
      sessionId: "session-success",
      changedFiles: ["src/tasks/runtime/worker.ts"],
    });
    expect(typeof attempts[0]?.metrics.workerCheckpointAtMs).toBe("number");

    service.close();
  });

  it("fails and requeues retry-eligible tasks until a later attempt succeeds", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const project = service.createProject({ name: "Worker Retry" });
    const task = service.createTask({
      projectId: project.id,
      title: "retry task",
      description: "fail first, then pass",
      type: "bugfix",
      status: "backlog",
      maxAttempts: 2,
    });
    service.transitionTask({ id: task.id, toStatus: "assigned", assignedAgentId: "agent-a" });

    let calls = 0;
    const executor: TaskExecutor = {
      execute: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            status: "failed",
            summary: "First attempt failed",
            errorText: "transient failure",
            metrics: { run: 1 },
          };
        }
        return {
          status: "success",
          summary: "Second attempt passed",
          metrics: { run: 2 },
        };
      },
    };

    const worker = createTaskWorker({
      taskService: service,
      executor,
      agentId: "agent-a",
      teamIds: ["team-1"],
      idlePollMs: 10,
      heartbeatIntervalMs: 20,
      leaseDurationMs: 500,
      maxBackoffMs: 200,
    });

    worker.start();
    await waitFor(() => service.getTask(task.id)?.status === "review");
    await worker.stop();

    const updatedTask = service.getTask(task.id);
    expect(updatedTask?.attemptCount).toBe(2);
    expect(updatedTask?.status).toBe("review");
    expect(calls).toBeGreaterThanOrEqual(2);

    const attempts = service.listTaskAttempts(task.id, 10);
    const attemptStatuses = attempts.map((attempt) => attempt.status).toSorted();
    expect(attemptStatuses).toEqual(["completed", "failed"]);

    service.close();
  });

  it("updates heartbeat timestamp while task execution is in progress", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const project = service.createProject({ name: "Worker Heartbeat" });
    const task = service.createTask({
      projectId: project.id,
      title: "slow task",
      description: "check heartbeats",
      type: "feature",
      status: "backlog",
    });
    service.transitionTask({ id: task.id, toStatus: "assigned", assignedAgentId: "agent-a" });

    const executor: TaskExecutor = {
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 220));
        return {
          status: "success",
          summary: "slow task completed",
        };
      },
    };

    const worker = createTaskWorker({
      taskService: service,
      executor,
      agentId: "agent-a",
      teamIds: ["team-1"],
      idlePollMs: 10,
      heartbeatIntervalMs: 40,
      leaseDurationMs: 500,
      maxBackoffMs: 200,
    });

    worker.start();
    await waitFor(() => worker.getStatus().state === "running");
    const firstHeartbeat = worker.getStatus().lastHeartbeatAtMs ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 140));
    const secondHeartbeat = worker.getStatus().lastHeartbeatAtMs ?? 0;
    expect(secondHeartbeat).toBeGreaterThanOrEqual(firstHeartbeat);

    await waitFor(() => service.getTask(task.id)?.status === "review");
    await worker.stop();
    service.close();
  });
});
