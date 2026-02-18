import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandler } from "./types.js";
import { createTaskService } from "../../tasks/service.js";
import { teamsHandlers } from "./teams.js";

const tempDirs: string[] = [];

async function createFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-teams-method-"));
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

describe("gateway teams handlers", () => {
  it("supports CRUD/getByName and member operations", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: teamsHandlers["teams.create"],
      method: "teams.create",
      payload: { name: "Morpheus", leadAgentId: "lead-1" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        team: expect.objectContaining({ name: "Morpheus", leadAgentId: "lead-1" }),
        members: expect.arrayContaining([expect.objectContaining({ agentId: "lead-1" })]),
      }),
      undefined,
    );
    const teamId = (fixture.respond.mock.calls[0]?.[1] as { team?: { id?: string } } | undefined)
      ?.team?.id as string;

    fixture.respond.mockClear();
    await callMethod({
      handler: teamsHandlers["teams.getByName"],
      method: "teams.getByName",
      payload: { name: "morpheus" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ team: expect.objectContaining({ id: teamId }) }),
      undefined,
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: teamsHandlers["teams.members.add"],
      method: "teams.members.add",
      payload: { teamId, agentId: "agent-2", role: "member" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        members: expect.arrayContaining([expect.objectContaining({ agentId: "agent-2" })]),
      }),
      undefined,
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: teamsHandlers["teams.members.remove"],
      method: "teams.members.remove",
      payload: { teamId, agentId: "agent-2" },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        members: expect.not.arrayContaining([expect.objectContaining({ agentId: "agent-2" })]),
      }),
      undefined,
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: teamsHandlers["teams.delete"],
      method: "teams.delete",
      payload: { id: teamId },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        team: expect.objectContaining({ archivedAtMs: expect.any(Number) }),
      }),
      undefined,
    );
    expect(fixture.broadcasts.some((entry) => entry.event === "teams.changed")).toBe(true);

    fixture.taskService.close();
  });
});
