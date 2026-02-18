import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskLeadSupervisor, TaskRuntimeSupervisor } from "../../tasks/runtime/types.js";
import type { GatewayRequestHandler } from "./types.js";
import { createTaskService } from "../../tasks/service.js";
import { projectsHandlers } from "./projects.js";
import { tasksHandlers } from "./tasks.js";

const tempDirs: string[] = [];

async function createFixture(overrides?: {
  taskRuntimeSupervisor?: TaskRuntimeSupervisor | null;
  taskLeadSupervisor?: TaskLeadSupervisor | null;
}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tasks-operator-method-"));
  tempDirs.push(dir);
  const taskService = createTaskService({ dbPath: path.join(dir, "tasks.sqlite") });
  const broadcasts: Array<{ event: string; payload: unknown }> = [];
  const context = {
    taskService,
    taskRuntimeSupervisor: overrides?.taskRuntimeSupervisor ?? null,
    taskLeadSupervisor: overrides?.taskLeadSupervisor ?? null,
    broadcast: (event: string, payload: unknown) => {
      broadcasts.push({ event, payload });
    },
  };
  const respond = vi.fn();
  return { context, respond, broadcasts, taskService };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function callMethod(params: {
  handler: GatewayRequestHandler;
  method: string;
  payload: Record<string, unknown>;
  respond: ReturnType<typeof vi.fn>;
  context: Record<string, unknown>;
}) {
  return Promise.resolve(
    params.handler({
      params: params.payload,
      respond: params.respond,
      context: params.context as never,
      client: null,
      req: { type: "req", id: params.method, method: params.method },
      isWebchatConnect: () => false,
    }),
  );
}

describe("gateway tasks operator handlers", () => {
  it("force-fails a running task and returns attempts history", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: projectsHandlers["projects.create"],
      method: "projects.create",
      payload: { name: "Operator" },
      respond: fixture.respond,
      context: fixture.context,
    });
    const projectId = (
      fixture.respond.mock.calls[0]?.[1] as { project?: { id?: string } } | undefined
    )?.project?.id as string;

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.create"],
      method: "tasks.create",
      payload: {
        projectId,
        title: "operator force fail",
        description: "operator path",
        type: "feature",
      },
      respond: fixture.respond,
      context: fixture.context,
    });
    const taskId = (fixture.respond.mock.calls[0]?.[1] as { task?: { id?: string } } | undefined)
      ?.task?.id as string;

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.transition"],
      method: "tasks.transition",
      payload: { id: taskId, toStatus: "backlog" },
      respond: fixture.respond,
      context: fixture.context,
    });
    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.transition"],
      method: "tasks.transition",
      payload: { id: taskId, toStatus: "assigned", assignedAgentId: "agent-a" },
      respond: fixture.respond,
      context: fixture.context,
    });
    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.claimNext"],
      method: "tasks.claimNext",
      payload: { agentId: "agent-a" },
      respond: fixture.respond,
      context: fixture.context,
    });
    const claim = (
      fixture.respond.mock.calls[0]?.[1] as
        | { claim?: { id?: string; leaseToken?: string } }
        | undefined
    )?.claim as { id: string; leaseToken: string };

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.attemptStart"],
      method: "tasks.attemptStart",
      payload: {
        taskId,
        claimId: claim.id,
        agentId: "agent-a",
        leaseToken: claim.leaseToken,
      },
      respond: fixture.respond,
      context: fixture.context,
    });

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.forceFailActive"],
      method: "tasks.forceFailActive",
      payload: { taskId, actor: "operator", reason: "manual stop" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        task: expect.objectContaining({ status: "failed" }),
        attempt: expect.objectContaining({ status: "failed", errorText: "manual stop" }),
      }),
      undefined,
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.attempts.list"],
      method: "tasks.attempts.list",
      payload: { taskId },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        attempts: expect.arrayContaining([expect.objectContaining({ taskId, status: "failed" })]),
      }),
      undefined,
    );

    fixture.taskService.close();
  });

  it("returns runtime status and controls worker lifecycle", async () => {
    const pauseAgent = vi.fn(async () => ({
      agentId: "worker-a",
      teamIds: ["team-1"],
      state: "paused",
      currentTaskId: null,
      lastHeartbeatAtMs: null,
      errorStreak: 0,
      lastError: null,
      updatedAtMs: Date.now(),
    }));
    const resumeAgent = vi.fn(async () => ({
      agentId: "worker-a",
      teamIds: ["team-1"],
      state: "idle",
      currentTaskId: null,
      lastHeartbeatAtMs: null,
      errorStreak: 0,
      lastError: null,
      updatedAtMs: Date.now(),
    }));
    const restartAgent = vi.fn(async () => ({
      agentId: "worker-a",
      teamIds: ["team-1"],
      state: "idle",
      currentTaskId: null,
      lastHeartbeatAtMs: null,
      errorStreak: 0,
      lastError: null,
      updatedAtMs: Date.now(),
    }));
    const taskRuntimeSupervisor = {
      start: () => undefined,
      stop: async () => undefined,
      getWorkerStatuses: () => [
        {
          agentId: "worker-a",
          teamIds: ["team-1"],
          state: "idle",
          currentTaskId: null,
          lastHeartbeatAtMs: null,
          errorStreak: 0,
          lastError: null,
          updatedAtMs: Date.now(),
        },
      ],
      reconcileNow: async () => undefined,
      pauseAgent,
      resumeAgent,
      restartAgent,
    } satisfies TaskRuntimeSupervisor;
    const taskLeadSupervisor = {
      start: () => undefined,
      stop: async () => undefined,
      getLeadStatuses: () => [],
      reconcileNow: async () => undefined,
    } satisfies TaskLeadSupervisor;
    const fixture = await createFixture({ taskRuntimeSupervisor, taskLeadSupervisor });
    const team = fixture.taskService.createTeam({
      name: "Morpheus",
      leadAgentId: "lead-a",
    });
    fixture.taskService.upsertTeamMember({ teamId: team.id, agentId: "worker-a", role: "member" });

    await callMethod({
      handler: tasksHandlers["tasks.runtime.status"],
      method: "tasks.runtime.status",
      payload: {},
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        workers: expect.arrayContaining([expect.objectContaining({ agentId: "worker-a" })]),
        teams: expect.arrayContaining([expect.objectContaining({ teamId: team.id })]),
      }),
      undefined,
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.runtime.pauseAgent"],
      method: "tasks.runtime.pauseAgent",
      payload: { agentId: "worker-a" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(pauseAgent).toHaveBeenCalledWith("worker-a");

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.runtime.resumeAgent"],
      method: "tasks.runtime.resumeAgent",
      payload: { agentId: "worker-a" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(resumeAgent).toHaveBeenCalledWith("worker-a");

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.runtime.restartAgent"],
      method: "tasks.runtime.restartAgent",
      payload: { agentId: "worker-a" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(restartAgent).toHaveBeenCalledWith("worker-a");

    fixture.taskService.close();
  });
});
