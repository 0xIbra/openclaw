import { Type } from "@sinclair/typebox";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

const TEAM_ACTIONS = [
  "list",
  "create",
  "get",
  "getByName",
  "update",
  "delete",
  "addMember",
  "removeMember",
] as const;
const TEAM_ROLES = ["lead", "member"] as const;

const TeamsToolSchema = Type.Object({
  action: stringEnum(TEAM_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  id: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  includeArchived: Type.Optional(Type.Boolean()),
  leadAgentId: Type.Optional(Type.String()),
  settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  teamId: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  role: optionalStringEnum(TEAM_ROLES),
});

export function createTeamsTool(): AnyAgentTool {
  return {
    label: "Teams",
    name: "teams",
    description: "List/create/get/update/delete teams and manage members.",
    parameters: TeamsToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts: GatewayCallOptions = {
        gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
        gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
        timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
      };

      if (action === "list") {
        const includeArchived =
          typeof params.includeArchived === "boolean" ? params.includeArchived : undefined;
        return jsonResult(await callGatewayTool("teams.list", gatewayOpts, { includeArchived }));
      }

      if (action === "create") {
        const name = readStringParam(params, "name", { required: true });
        const description = readStringParam(params, "description", { trim: false });
        const leadAgentId = readStringParam(params, "leadAgentId", { trim: false });
        const settings =
          params.settings && typeof params.settings === "object" && !Array.isArray(params.settings)
            ? (params.settings as Record<string, unknown>)
            : undefined;
        return jsonResult(
          await callGatewayTool("teams.create", gatewayOpts, {
            name,
            ...(description !== undefined ? { description } : {}),
            ...(leadAgentId !== undefined ? { leadAgentId } : {}),
            ...(settings ? { settings } : {}),
          }),
        );
      }

      if (action === "get") {
        const id = readStringParam(params, "id", { required: true });
        return jsonResult(await callGatewayTool("teams.get", gatewayOpts, { id }));
      }

      if (action === "getByName") {
        const name = readStringParam(params, "name", { required: true });
        return jsonResult(await callGatewayTool("teams.getByName", gatewayOpts, { name }));
      }

      if (action === "update") {
        const id = readStringParam(params, "id", { required: true });
        const name = readStringParam(params, "name");
        const description = readStringParam(params, "description", { trim: false });
        const leadAgentId = readStringParam(params, "leadAgentId", { trim: false });
        const settings =
          params.settings && typeof params.settings === "object" && !Array.isArray(params.settings)
            ? (params.settings as Record<string, unknown>)
            : undefined;
        if (!name && description === undefined && leadAgentId === undefined && !settings) {
          throw new Error(
            "update requires at least one field (name/description/leadAgentId/settings)",
          );
        }
        return jsonResult(
          await callGatewayTool("teams.update", gatewayOpts, {
            id,
            ...(name ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(leadAgentId !== undefined ? { leadAgentId } : {}),
            ...(settings ? { settings } : {}),
          }),
        );
      }

      if (action === "delete") {
        const id = readStringParam(params, "id", { required: true });
        return jsonResult(await callGatewayTool("teams.delete", gatewayOpts, { id }));
      }

      if (action === "addMember") {
        const teamId = readStringParam(params, "teamId", { required: true });
        const agentId = readStringParam(params, "agentId", { required: true });
        const role = readStringParam(params, "role", { required: true });
        return jsonResult(
          await callGatewayTool("teams.members.add", gatewayOpts, { teamId, agentId, role }),
        );
      }

      if (action === "removeMember") {
        const teamId = readStringParam(params, "teamId", { required: true });
        const agentId = readStringParam(params, "agentId", { required: true });
        return jsonResult(
          await callGatewayTool("teams.members.remove", gatewayOpts, { teamId, agentId }),
        );
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
