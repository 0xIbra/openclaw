import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTaskService } from "../../tasks/service.js";
import { projectsHandlers } from "./projects.js";

const tempDirs: string[] = [];

async function createFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-projects-method-"));
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

describe("gateway projects handlers", () => {
  it("creates, gets, updates, and archives projects", async () => {
    const fixture = await createFixture();

    await projectsHandlers["projects.create"]({
      params: { name: "Phase 2" },
      respond: fixture.respond,
      context: fixture.context as never,
      client: null,
      req: { type: "req", id: "1", method: "projects.create" },
      isWebchatConnect: () => false,
    });

    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        project: expect.objectContaining({ name: "Phase 2" }),
      }),
      undefined,
    );
    expect(fixture.broadcasts[0]?.event).toBe("projects.changed");

    const projectId = (
      fixture.respond.mock.calls[0]?.[1] as { project?: { id?: string } } | undefined
    )?.project?.id;
    expect(projectId).toBeTruthy();

    fixture.respond.mockClear();
    await projectsHandlers["projects.get"]({
      params: { id: projectId },
      respond: fixture.respond,
      context: fixture.context as never,
      client: null,
      req: { type: "req", id: "2", method: "projects.get" },
      isWebchatConnect: () => false,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ project: expect.objectContaining({ id: projectId }) }),
      undefined,
    );

    fixture.respond.mockClear();
    await projectsHandlers["projects.update"]({
      params: { id: projectId, description: "task engine" },
      respond: fixture.respond,
      context: fixture.context as never,
      client: null,
      req: { type: "req", id: "3", method: "projects.update" },
      isWebchatConnect: () => false,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        project: expect.objectContaining({ description: "task engine" }),
      }),
      undefined,
    );

    fixture.respond.mockClear();
    await projectsHandlers["projects.archive"]({
      params: { id: projectId },
      respond: fixture.respond,
      context: fixture.context as never,
      client: null,
      req: { type: "req", id: "4", method: "projects.archive" },
      isWebchatConnect: () => false,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        project: expect.objectContaining({ archivedAtMs: expect.any(Number) }),
      }),
      undefined,
    );

    fixture.taskService.close();
  });

  it("returns validation error for invalid create payload", async () => {
    const fixture = await createFixture();

    await projectsHandlers["projects.create"]({
      params: { description: "missing name" },
      respond: fixture.respond,
      context: fixture.context as never,
      client: null,
      req: { type: "req", id: "5", method: "projects.create" },
      isWebchatConnect: () => false,
    });

    expect(fixture.respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: expect.stringContaining("invalid projects.create params"),
      }),
    );

    fixture.taskService.close();
  });
});
