import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

import { createTeamsTool } from "./teams-tool.js";

describe("teams tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true });
  });

  it("maps CRUD actions and member actions to gateway methods", async () => {
    const tool = createTeamsTool();

    await tool.execute("call-list", { action: "list", includeArchived: true });
    await tool.execute("call-create", { action: "create", name: "Morpheus" });
    await tool.execute("call-get", { action: "get", id: "team-1" });
    await tool.execute("call-get-by-name", { action: "getByName", name: "Morpheus" });
    await tool.execute("call-update", { action: "update", id: "team-1", description: "updated" });
    await tool.execute("call-delete", { action: "delete", id: "team-1" });
    await tool.execute("call-add", {
      action: "addMember",
      teamId: "team-1",
      agentId: "agent-a",
      role: "member",
    });
    await tool.execute("call-remove", {
      action: "removeMember",
      teamId: "team-1",
      agentId: "agent-a",
    });

    expect(callGatewayMock.mock.calls[0]?.[0]).toMatchObject({
      method: "teams.list",
      params: { includeArchived: true },
    });
    expect(callGatewayMock.mock.calls[1]?.[0]).toMatchObject({
      method: "teams.create",
      params: { name: "Morpheus" },
    });
    expect(callGatewayMock.mock.calls[2]?.[0]).toMatchObject({
      method: "teams.get",
      params: { id: "team-1" },
    });
    expect(callGatewayMock.mock.calls[3]?.[0]).toMatchObject({
      method: "teams.getByName",
      params: { name: "Morpheus" },
    });
    expect(callGatewayMock.mock.calls[4]?.[0]).toMatchObject({
      method: "teams.update",
      params: { id: "team-1", description: "updated" },
    });
    expect(callGatewayMock.mock.calls[5]?.[0]).toMatchObject({
      method: "teams.delete",
      params: { id: "team-1" },
    });
    expect(callGatewayMock.mock.calls[6]?.[0]).toMatchObject({
      method: "teams.members.add",
      params: { teamId: "team-1", agentId: "agent-a", role: "member" },
    });
    expect(callGatewayMock.mock.calls[7]?.[0]).toMatchObject({
      method: "teams.members.remove",
      params: { teamId: "team-1", agentId: "agent-a" },
    });
  });

  it("requires a patch field for update", async () => {
    const tool = createTeamsTool();

    await expect(tool.execute("call-update", { action: "update", id: "team-1" })).rejects.toThrow(
      "update requires at least one field",
    );
  });
});
