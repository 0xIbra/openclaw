import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskLead, TaskLeadOptions } from "./types.js";
import { createTaskService } from "../service.js";
import { createTaskLeadSupervisor } from "./lead-supervisor.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-lead-supervisor-"));
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

describe("task lead supervisor", () => {
  it("starts/stops leads based on active team leads", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({ name: "Morpheus", leadAgentId: "lead-agent" });

    const startedTeams: string[] = [];
    const stoppedTeams: string[] = [];
    const leadsByTeam = new Map<string, { running: boolean; options: TaskLeadOptions }>();
    const createLead = (options: TaskLeadOptions): TaskLead => {
      leadsByTeam.set(options.teamId, { running: false, options });
      return {
        start: () => {
          const lead = leadsByTeam.get(options.teamId);
          if (lead) {
            lead.running = true;
          }
          startedTeams.push(options.teamId);
        },
        stop: async () => {
          const lead = leadsByTeam.get(options.teamId);
          if (lead) {
            lead.running = false;
          }
          stoppedTeams.push(options.teamId);
        },
        getStatus: () => ({
          teamId: options.teamId,
          teamName: options.teamName,
          leadAgentId: options.leadAgentId,
          state: leadsByTeam.get(options.teamId)?.running ? "idle" : "paused",
          lastError: null,
          lastPolledAtMs: null,
          waitingQuestionCount: 0,
          updatedAtMs: Date.now(),
        }),
      };
    };

    const supervisor = createTaskLeadSupervisor({
      taskService: service,
      createLead,
      reconcileIntervalMs: 50,
    });
    supervisor.start();

    await waitFor(() => startedTeams.includes(team.id));
    expect(supervisor.getLeadStatuses().map((entry) => entry.teamId)).toEqual([team.id]);

    service.archiveTeam(team.id);
    await supervisor.reconcileNow();
    await waitFor(() => supervisor.getLeadStatuses().length === 0);

    await supervisor.stop();
    expect(stoppedTeams).toContain(team.id);
    service.close();
  });
});
