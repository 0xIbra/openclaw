import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskService } from "./service.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-runtime-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task service runtime flow", () => {
  it("claims assigned tasks once and rejects duplicate active claim", async () => {
    const dbPath = await createTempDbPath();
    const first = createTaskService({ dbPath });
    const second = createTaskService({ dbPath });

    const project = first.createProject({ name: "Runtime" });
    const task = first.createTask({
      projectId: project.id,
      title: "run worker",
      description: "claim and execute",
      type: "feature",
      status: "backlog",
    });
    first.transitionTask({ id: task.id, toStatus: "assigned", assignedAgentId: "agent-a" });

    const claimOne = first.claimNextTask({ agentId: "agent-a", leaseDurationMs: 45_000 });
    const claimTwo = second.claimNextTask({ agentId: "agent-a", leaseDurationMs: 45_000 });

    expect(claimOne?.task.id).toBe(task.id);
    expect(claimTwo).toBeNull();

    second.close();
    first.close();
  });

  it("extends lease heartbeat and allows reclaim after expiry", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const project = service.createProject({ name: "Lease" });
    const task = service.createTask({
      projectId: project.id,
      title: "heartbeat",
      description: "renew claim lease",
      type: "feature",
      status: "backlog",
    });
    service.transitionTask({ id: task.id, toStatus: "assigned", assignedAgentId: "agent-a" });

    const claimed = service.claimNextTask({ agentId: "agent-a", leaseDurationMs: 20 });
    expect(claimed).toBeTruthy();
    if (!claimed) {
      service.close();
      return;
    }

    const heartbeat = service.leaseHeartbeat({
      claimId: claimed.claim.id,
      agentId: "agent-a",
      leaseToken: claimed.claim.leaseToken,
      leaseDurationMs: 100,
    });
    expect(heartbeat.claim.leaseExpiresAtMs).toBeGreaterThan(claimed.claim.leaseExpiresAtMs);

    const whileActive = service.claimNextTask({ agentId: "agent-a", leaseDurationMs: 45_000 });
    expect(whileActive).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 120));
    const reclaimed = service.claimNextTask({ agentId: "agent-a", leaseDurationMs: 45_000 });
    expect(reclaimed?.task.id).toBe(task.id);

    service.close();
  });

  it("starts, finishes, fails, and requeues attempts with task state updates", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const project = service.createProject({ name: "Attempts" });
    const task = service.createTask({
      projectId: project.id,
      title: "attempt lifecycle",
      description: "track attempts",
      type: "feature",
      status: "backlog",
      maxAttempts: 3,
    });
    service.transitionTask({ id: task.id, toStatus: "assigned", assignedAgentId: "agent-a" });

    const claim = service.claimNextTask({ agentId: "agent-a", leaseDurationMs: 45_000 });
    expect(claim).toBeTruthy();
    if (!claim) {
      service.close();
      return;
    }

    const started = service.startAttempt({
      taskId: task.id,
      claimId: claim.claim.id,
      agentId: "agent-a",
      leaseToken: claim.claim.leaseToken,
      sessionBackend: "kimi-cli",
      sessionId: "session-1",
      summary: "first pass",
    });
    expect(started.attempt.attemptNumber).toBe(1);
    expect(started.task.currentAttemptId).toBe(started.attempt.id);
    expect(started.task.attemptCount).toBe(1);
    expect(started.task.status).toBe("running");

    const finished = service.finishAttempt({
      taskId: task.id,
      claimId: claim.claim.id,
      attemptId: started.attempt.id,
      agentId: "agent-a",
      leaseToken: claim.claim.leaseToken,
      summary: "done",
      changedFiles: ["src/tasks/runtime/worker.ts"],
      testOutcome: { passed: 1, failed: 0 },
    });
    expect(finished.task.status).toBe("review");
    expect(finished.claim.state).toBe("released");

    const retryTask = service.createTask({
      projectId: project.id,
      title: "attempt failure path",
      description: "track failed attempts",
      type: "feature",
      status: "backlog",
      maxAttempts: 3,
    });
    service.transitionTask({ id: retryTask.id, toStatus: "assigned", assignedAgentId: "agent-a" });

    const secondClaim = service.claimNextTask({ agentId: "agent-a", leaseDurationMs: 45_000 });
    expect(secondClaim).toBeTruthy();
    if (!secondClaim) {
      service.close();
      return;
    }

    const secondStart = service.startAttempt({
      taskId: retryTask.id,
      claimId: secondClaim.claim.id,
      agentId: "agent-a",
      leaseToken: secondClaim.claim.leaseToken,
      summary: "retry pass",
    });
    const failed = service.failAttempt({
      taskId: retryTask.id,
      claimId: secondClaim.claim.id,
      attemptId: secondStart.attempt.id,
      agentId: "agent-a",
      leaseToken: secondClaim.claim.leaseToken,
      errorText: "test failure",
    });
    expect(failed.task.status).toBe("failed");
    expect(failed.claim.state).toBe("released");
    expect(failed.retryEligible).toBe(true);
    expect(failed.remainingAttempts).toBe(2);

    const requeuedBacklog = service.requeueTask({ taskId: retryTask.id });
    expect(requeuedBacklog.previousStatus).toBe("failed");
    expect(requeuedBacklog.task.status).toBe("backlog");

    const requeuedAssigned = service.requeueTask({
      taskId: retryTask.id,
      assignedAgentId: "agent-b",
    });
    expect(requeuedAssigned.task.status).toBe("assigned");
    expect(requeuedAssigned.task.assignedAgentId).toBe("agent-b");

    service.close();
  });
});
