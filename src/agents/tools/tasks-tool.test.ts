import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

import { createTasksTool } from "./tasks-tool.js";

describe("tasks tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true });
  });

  it("maps list/create/get/transition to gateway methods", async () => {
    const tool = createTasksTool();

    await tool.execute("call-list", {
      action: "list",
      projectId: "proj-1",
      status: "backlog",
      limit: 20,
    });
    await tool.execute("call-create", {
      action: "create",
      projectId: "proj-1",
      title: "Build board",
      description: "Implement board",
      type: "feature",
      tags: ["ui", "phase2"],
    });
    await tool.execute("call-get", { action: "get", id: "task-1" });
    await tool.execute("call-transition", {
      action: "transition",
      id: "task-1",
      toStatus: "assigned",
      assignedAgentId: "zed",
    });

    expect(callGatewayMock.mock.calls[0]?.[0]).toMatchObject({
      method: "tasks.list",
      params: expect.objectContaining({ projectId: "proj-1", status: "backlog", limit: 20 }),
    });
    expect(callGatewayMock.mock.calls[1]?.[0]).toMatchObject({
      method: "tasks.create",
      params: expect.objectContaining({
        projectId: "proj-1",
        title: "Build board",
        description: "Implement board",
        type: "feature",
        tags: ["ui", "phase2"],
      }),
    });
    expect(callGatewayMock.mock.calls[2]?.[0]).toMatchObject({
      method: "tasks.get",
      params: { id: "task-1" },
    });
    expect(callGatewayMock.mock.calls[3]?.[0]).toMatchObject({
      method: "tasks.transition",
      params: { id: "task-1", toStatus: "assigned", assignedAgentId: "zed" },
    });
  });

  it("requires patch fields for update", async () => {
    const tool = createTasksTool();

    await expect(tool.execute("call-update", { action: "update", id: "task-1" })).rejects.toThrow(
      "update requires at least one task field",
    );
  });

  it("maps decomposition and review actions to gateway methods", async () => {
    const tool = createTasksTool();

    await tool.execute("call-decompose-auto", {
      action: "decompose",
      id: "task-parent-auto",
      requestedBy: "ares",
    });
    await tool.execute("call-decompose", {
      action: "decompose",
      id: "task-parent",
      requestedBy: "ares",
      planSummary: "split parent",
      planChildren: [
        {
          localId: "a",
          title: "child-a",
          description: "do a",
          type: "feature",
          priority: "high",
          dependsOnLocalIds: [],
        },
      ],
    });
    await tool.execute("call-review-list", {
      action: "reviewListPending",
      teamId: "team-1",
      limit: 5,
    });
    await tool.execute("call-review-decide", {
      action: "reviewDecide",
      id: "task-parent",
      decision: "approve",
      actor: "control-ui",
      reason: "clean result",
    });

    expect(callGatewayMock.mock.calls[0]?.[0]).toMatchObject({
      method: "tasks.decompose",
      params: expect.objectContaining({
        taskId: "task-parent-auto",
        requestedBy: "ares",
        plan: undefined,
      }),
    });
    expect(callGatewayMock.mock.calls[1]?.[0]).toMatchObject({
      method: "tasks.decompose",
      params: expect.objectContaining({
        taskId: "task-parent",
        requestedBy: "ares",
      }),
    });
    expect(callGatewayMock.mock.calls[2]?.[0]).toMatchObject({
      method: "tasks.review.listPending",
      params: { teamId: "team-1", projectId: undefined, limit: 5 },
    });
    expect(callGatewayMock.mock.calls[3]?.[0]).toMatchObject({
      method: "tasks.review.decide",
      params: {
        taskId: "task-parent",
        decision: "approve",
        actor: "control-ui",
        reason: "clean result",
      },
    });
  });
});
