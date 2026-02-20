import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../workspace.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

const AGENTS_ACTIONS = ["list", "create", "delete", "update"] as const;

const AgentsToolSchema = Type.Object({
  action: stringEnum(AGENTS_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  // create / update / delete
  agentId: Type.Optional(Type.String()),
  // create
  name: Type.Optional(Type.String()),
  workspace: Type.Optional(Type.String()),
  emoji: Type.Optional(Type.String()),
  // update
  newName: Type.Optional(Type.String()),
  // delete
  deleteFiles: Type.Optional(Type.Boolean()),
});

export function createAgentsTool(): AnyAgentTool {
  return {
    label: "Agents Management",
    name: "agents",
    description:
      "List, create, update, or delete agents. Use this to provision new agents or fully remove existing ones from the system.",
    parameters: AgentsToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts: GatewayCallOptions = {
        gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
        gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
      };

      if (action === "list") {
        return jsonResult(await callGatewayTool("agents.list", gatewayOpts, {}));
      }

      if (action === "create") {
        const name = readStringParam(params, "name", { required: true });
        const agentId = readStringParam(params, "agentId");
        // Derive workspace: use explicit override, or default path based on name slug.
        const slug = (agentId ?? name)
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const workspace =
          readStringParam(params, "workspace") ?? `${DEFAULT_AGENT_WORKSPACE_DIR}-${slug}`;
        const emoji = readStringParam(params, "emoji", { trim: false });
        return jsonResult(
          await callGatewayTool("agents.create", gatewayOpts, {
            name,
            workspace,
            ...(emoji ? { emoji } : {}),
          }),
        );
      }

      if (action === "update") {
        const agentId = readStringParam(params, "agentId", { required: true });
        const newName = readStringParam(params, "newName");
        const workspace = readStringParam(params, "workspace");
        const emoji = readStringParam(params, "emoji", { trim: false });
        if (!newName && !workspace && emoji === undefined) {
          throw new Error("update requires at least one of: newName, workspace, emoji");
        }
        return jsonResult(
          await callGatewayTool("agents.update", gatewayOpts, {
            agentId,
            ...(newName ? { name: newName } : {}),
            ...(workspace ? { workspace } : {}),
            ...(emoji !== undefined ? { emoji } : {}),
          }),
        );
      }

      if (action === "delete") {
        const agentId = readStringParam(params, "agentId", { required: true });
        const deleteFiles = typeof params.deleteFiles === "boolean" ? params.deleteFiles : true;
        return jsonResult(
          await callGatewayTool("agents.delete", gatewayOpts, { agentId, deleteFiles }),
        );
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
