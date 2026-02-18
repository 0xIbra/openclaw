import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskExecutor, TaskWorker, TaskWorkerOptions } from "./types.js";
import { createTaskService } from "../service.js";
import { createTaskRuntimeSupervisor } from "./supervisor.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-supervisor-"));
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

describe("task runtime supervisor", () => {
  it("starts workers for active team members and stops workers when memberships are removed", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({
      name: "Morpheus",
      leadAgentId: "lead-agent",
    });
    service.upsertTeamMember({ teamId: team.id, agentId: "member-agent", role: "member" });

    const startedAgents: string[] = [];
    const stoppedAgents: string[] = [];
    const workersByAgent = new Map<string, { teamIds: string[]; running: boolean }>();

    const createWorker = (options: TaskWorkerOptions): TaskWorker => {
      workersByAgent.set(options.agentId, {
        teamIds: [...(options.teamIds ?? [])],
        running: false,
      });
      return {
        start: () => {
          const worker = workersByAgent.get(options.agentId);
          if (worker) {
            worker.running = true;
          }
          startedAgents.push(options.agentId);
        },
        stop: async () => {
          const worker = workersByAgent.get(options.agentId);
          if (worker) {
            worker.running = false;
          }
          stoppedAgents.push(options.agentId);
        },
        getStatus: () => ({
          agentId: options.agentId,
          teamIds: [...(workersByAgent.get(options.agentId)?.teamIds ?? [])],
          state: workersByAgent.get(options.agentId)?.running ? "idle" : "paused",
          currentTaskId: null,
          lastHeartbeatAtMs: null,
          errorStreak: 0,
          lastError: null,
          updatedAtMs: Date.now(),
        }),
        setTeamIds: (teamIds: string[]) => {
          const worker = workersByAgent.get(options.agentId);
          if (worker) {
            worker.teamIds = [...teamIds];
          }
        },
      };
    };

    const dummyExecutor: TaskExecutor = {
      execute: async () => ({ status: "success", summary: "ok" }),
    };

    const supervisor = createTaskRuntimeSupervisor({
      taskService: service,
      createExecutor: () => dummyExecutor,
      createWorker,
      reconcileIntervalMs: 50,
    });

    supervisor.start();
    await waitFor(() => startedAgents.includes("member-agent"));
    expect(
      supervisor
        .getWorkerStatuses()
        .map((entry) => entry.agentId)
        .toSorted(),
    ).toEqual(["member-agent"]);

    const paused = await supervisor.pauseAgent("member-agent");
    expect(paused?.state).toBe("paused");
    expect(stoppedAgents).toContain("member-agent");

    const resumed = await supervisor.resumeAgent("member-agent");
    await waitFor(() =>
      supervisor
        .getWorkerStatuses()
        .some((entry) => entry.agentId === "member-agent" && entry.state !== "paused"),
    );
    expect(resumed?.agentId).toBe("member-agent");
    expect(startedAgents.filter((entry) => entry === "member-agent").length).toBeGreaterThan(1);

    const restarted = await supervisor.restartAgent("member-agent");
    expect(restarted?.agentId).toBe("member-agent");
    expect(startedAgents.filter((entry) => entry === "member-agent").length).toBeGreaterThan(2);

    const removed = service.removeTeamMember(team.id, "member-agent");
    expect(removed).toBe(true);
    await supervisor.reconcileNow();
    await waitFor(
      () => !supervisor.getWorkerStatuses().some((entry) => entry.agentId === "member-agent"),
    );

    service.archiveTeam(team.id);
    await supervisor.reconcileNow();
    await waitFor(() => supervisor.getWorkerStatuses().length === 0);

    await supervisor.stop();
    expect(stoppedAgents).toContain("member-agent");
    service.close();
  });
});
