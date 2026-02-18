import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskServiceError, createTaskService } from "./service.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tasks-v2-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task service v2 data plane", () => {
  it("supports team membership roundtrip and role constraints", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });

    const team = service.createTeam({
      name: "Morpheus",
      leadAgentId: "lead-1",
      settings: { dispatch: "auto" },
    });

    let members = service.listTeamMembers(team.id);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ agentId: "lead-1", role: "lead" });

    service.upsertTeamMember({ teamId: team.id, agentId: "agent-2", role: "member" });
    service.upsertTeamMember({ teamId: team.id, agentId: "agent-2", role: "lead" });

    members = service.listTeamMembers(team.id);
    expect(members.find((entry) => entry.agentId === "agent-2")?.role).toBe("lead");
    expect(members.find((entry) => entry.agentId === "lead-1")?.role).toBe("member");

    expect(() =>
      service.upsertTeamMember({
        teamId: team.id,
        agentId: "bad-role",
        role: "owner" as never,
      }),
    ).toThrowError(TaskServiceError);

    service.close();
  });

  it("keeps project repoRoot synchronized with primary project repo", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });

    const project = service.createProject({
      name: "Gateway",
      repoRoot: "/repo/gateway",
    });

    const initialRepos = service.listProjectRepos(project.id);
    expect(initialRepos).toHaveLength(1);
    expect(initialRepos[0]).toMatchObject({
      repoKey: "default",
      repoRoot: "/repo/gateway",
      isPrimary: true,
    });

    service.upsertProjectRepo({
      projectId: project.id,
      repoKey: "frontend",
      role: "frontend",
      repoRoot: "/repo/frontend",
      isPrimary: true,
    });

    const repos = service.listProjectRepos(project.id);
    expect(repos.filter((repo) => repo.isPrimary)).toHaveLength(1);
    expect(repos.find((repo) => repo.isPrimary)?.repoKey).toBe("frontend");

    const primaryRepo = repos.find((repo) => repo.isPrimary);
    expect(primaryRepo).toBeTruthy();
    service.upsertProjectRepo({
      id: primaryRepo?.id,
      projectId: project.id,
      repoKey: "frontend",
      role: "frontend-app",
      repoRoot: "/repo/frontend",
      branchPrefix: "feat/",
    });

    const reposAfterUpdate = service.listProjectRepos(project.id);
    expect(reposAfterUpdate.filter((repo) => repo.isPrimary)).toHaveLength(1);
    expect(reposAfterUpdate.find((repo) => repo.repoKey === "frontend")?.isPrimary).toBe(true);

    const refreshedProject = service.getProject(project.id);
    expect(refreshedProject?.repoRoot).toBe("/repo/frontend");

    service.close();
  });

  it("enforces one active claim per task and persists enriched attempts", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath, now: () => 10_000 });

    const project = service.createProject({ name: "Runtime" });
    const task = service.createTask({
      projectId: project.id,
      title: "Execute worker loop",
      description: "Run worker claim loop",
      type: "feature",
      status: "backlog",
    });

    const firstClaim = service.createTaskClaim({
      taskId: task.id,
      agentId: "agent-1",
      teamId: null,
      leaseToken: "lease-1",
      leaseDurationMs: 45_000,
    });
    expect(firstClaim.state).toBe("active");

    expect(() =>
      service.createTaskClaim({
        taskId: task.id,
        agentId: "agent-2",
        teamId: null,
        leaseToken: "lease-2",
        leaseDurationMs: 45_000,
      }),
    ).toThrowError(TaskServiceError);

    const attempt = service.createTaskAttempt({
      taskId: task.id,
      status: "running",
      claimId: firstClaim.id,
      teamId: null,
      sessionBackend: "kimi-cli",
      sessionId: "session-a",
      summary: "started",
      commandOutcome: { ok: true },
      testOutcome: { passed: 2, failed: 0 },
      changedFiles: ["src/tasks/runtime/worker.ts"],
      metrics: { durationMs: 12 },
    });

    service.updateTaskAttempt({
      id: attempt.id,
      status: "failed",
      errorText: "non-zero exit",
      summary: "retry needed",
      metrics: { durationMs: 15 },
    });

    const attempts = service.listTaskAttempts(task.id);
    expect(attempts[0]).toMatchObject({
      id: attempt.id,
      claimId: firstClaim.id,
      sessionBackend: "kimi-cli",
      sessionId: "session-a",
      summary: "retry needed",
      errorText: "non-zero exit",
      commandOutcome: { ok: true },
      testOutcome: { passed: 2, failed: 0 },
      changedFiles: ["src/tasks/runtime/worker.ts"],
      metrics: { durationMs: 15 },
    });

    const refreshedTask = service.getTask(task.id);
    expect(refreshedTask?.currentAttemptId).toBe(attempt.id);

    service.releaseTaskClaim(firstClaim.id);
    const secondClaim = service.createTaskClaim({
      taskId: task.id,
      agentId: "agent-2",
      teamId: null,
      leaseToken: "lease-2",
      leaseDurationMs: 45_000,
    });
    expect(secondClaim.state).toBe("active");

    service.close();
  });
});
