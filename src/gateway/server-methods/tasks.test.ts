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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-tasks-method-"));
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

describe("gateway tasks handlers", () => {
  it("creates and lists tasks", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: projectsHandlers["projects.create"],
      method: "projects.create",
      payload: { name: "Phase 2" },
      respond: fixture.respond,
      context: fixture.context,
    });
    const projectId = (
      fixture.respond.mock.calls[0]?.[1] as { project?: { id?: string } } | undefined
    )?.project?.id;
    expect(projectId).toBeTruthy();

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.create"],
      method: "tasks.create",
      payload: {
        projectId,
        title: "Build board",
        description: "Create a board tab",
        type: "feature",
      },
      respond: fixture.respond,
      context: fixture.context,
    });

    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        task: expect.objectContaining({ title: "Build board" }),
      }),
      undefined,
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.list"],
      method: "tasks.list",
      payload: { projectId },
      respond: fixture.respond,
      context: fixture.context,
    });

    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ projectId, title: "Build board" }),
        ]),
      }),
      undefined,
    );

    fixture.taskService.close();
  });

  it("enforces transition guards", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: projectsHandlers["projects.create"],
      method: "projects.create",
      payload: { name: "Phase 2" },
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
        title: "Build board",
        description: "Create a board tab",
        type: "feature",
      },
      respond: fixture.respond,
      context: fixture.context,
    });
    const taskId = (fixture.respond.mock.calls[0]?.[1] as { task?: { id?: string } } | undefined)
      ?.task?.id as string;

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
      payload: { id: taskId, toStatus: "assigned" },
      respond: fixture.respond,
      context: fixture.context,
    });

    expect(fixture.respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("requires assignedAgentId"),
      }),
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: tasksHandlers["tasks.transition"],
      method: "tasks.transition",
      payload: { id: taskId, toStatus: "assigned", assignedAgentId: "zed" },
      respond: fixture.respond,
      context: fixture.context,
    });

    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        task: expect.objectContaining({ status: "assigned", assignedAgentId: "zed" }),
      }),
      undefined,
    );

    fixture.taskService.close();
  });
});
