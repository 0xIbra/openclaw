import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

import { createProjectsTool } from "./projects-tool.js";

describe("projects tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true });
  });

  it("maps create/get/update/archive actions to gateway methods", async () => {
    const tool = createProjectsTool();

    await tool.execute("call-1", { action: "create", name: "Phase 2" });
    await tool.execute("call-2", { action: "get", id: "p1" });
    await tool.execute("call-3", { action: "update", id: "p1", description: "updated" });
    await tool.execute("call-4", { action: "archive", id: "p1" });

    expect(callGatewayMock.mock.calls[0]?.[0]).toMatchObject({
      method: "projects.create",
      params: { name: "Phase 2", description: undefined, repoRoot: undefined },
    });
    expect(callGatewayMock.mock.calls[1]?.[0]).toMatchObject({
      method: "projects.get",
      params: { id: "p1" },
    });
    expect(callGatewayMock.mock.calls[2]?.[0]).toMatchObject({
      method: "projects.update",
      params: { id: "p1", description: "updated" },
    });
    expect(callGatewayMock.mock.calls[3]?.[0]).toMatchObject({
      method: "projects.archive",
      params: { id: "p1" },
    });
  });

  it("passes includeArchived on list", async () => {
    const tool = createProjectsTool();
    await tool.execute("call-list", { action: "list", includeArchived: true });

    expect(callGatewayMock.mock.calls[0]?.[0]).toMatchObject({
      method: "projects.list",
      params: { includeArchived: true },
    });
  });

  it("requires at least one field for update", async () => {
    const tool = createProjectsTool();

    await expect(tool.execute("call-update", { action: "update", id: "p1" })).rejects.toThrow(
      "update requires at least one field",
    );
  });
});
