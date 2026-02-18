import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandler } from "./types.js";
import { createTaskService } from "../../tasks/service.js";
import { projectsHandlers } from "./projects.js";
import { tasksHandlers } from "./tasks.js";

const tempDirs: string[] = [];

async function createFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tasks-runtime-method-"));
  tempDirs.push(dir);
  const taskService = createTaskService({ dbPath: path.join(dir, "tasks.sqlite") });
  const broadcasts: Array<{ event: string; payload: unknown }> = [];
  const context = {
    taskService,
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
  context: {
    taskService: ReturnType<typeof createTaskService>;
    broadcast: (event: string, payload: unknown) => void;
  };
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

describe("gateway tasks runtime handlers", () => {
  it("claims assigned tasks and emits claimed event", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: projectsHandlers["projects.create"],
      method: "projects.create",
      payload: { name: "Runtime" },
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
        title: "runtime claim",
        description: "claim assigned task",
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

    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        task: expect.objectContaining({ id: taskId }),
        claim: expect.objectContaining({ taskId, agentId: "agent-a" }),
      }),
      undefined,
    );
    expect(fixture.broadcasts.some((entry) => entry.event === "tasks.claimed")).toBe(true);

    fixture.taskService.close();
  });

  it("runs attempt lifecycle and requeue runtime methods", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: projectsHandlers["projects.create"],
      method: "projects.create",
      payload: { name: "Attempts" },
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
        title: "runtime attempt",
        description: "attempt api coverage",
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
    const attemptId = (
      fixture.respond.mock.calls[0]?.[1] as { attempt?: { id?: string } } | undefined
    )?.attempt?.id as string;
    expect(attemptId).toBeTruthy();

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.attemptFail"],
      method: "tasks.attemptFail",
      payload: {
        taskId,
        claimId: claim.id,
        attemptId,
        agentId: "agent-a",
        leaseToken: claim.leaseToken,
        errorText: "failed test",
      },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        task: expect.objectContaining({ status: "failed" }),
        retryEligible: true,
      }),
      undefined,
    );
    expect(fixture.broadcasts.some((entry) => entry.event === "tasks.attempt.changed")).toBe(true);

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.requeue"],
      method: "tasks.requeue",
      payload: { taskId, assignedAgentId: "agent-a" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        task: expect.objectContaining({ status: "assigned", assignedAgentId: "agent-a" }),
      }),
      undefined,
    );

    fixture.taskService.close();
  });
});
