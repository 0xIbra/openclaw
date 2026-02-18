import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

const PROJECTS_ACTIONS = ["list", "create", "get", "update", "archive"] as const;

const ProjectsToolSchema = Type.Object({
  action: stringEnum(PROJECTS_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  id: Type.Optional(Type.String()),
  includeArchived: Type.Optional(Type.Boolean()),
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  repoRoot: Type.Optional(Type.String()),
});

export function createProjectsTool(): AnyAgentTool {
  return {
    label: "Projects",
    name: "projects",
    description: "List/create/get/update/archive task projects.",
    parameters: ProjectsToolSchema,
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
        return jsonResult(await callGatewayTool("projects.list", gatewayOpts, { includeArchived }));
      }

      if (action === "create") {
        const name = readStringParam(params, "name", { required: true });
        const description = readStringParam(params, "description");
        const repoRoot = readStringParam(params, "repoRoot");
        return jsonResult(
          await callGatewayTool("projects.create", gatewayOpts, {
            name,
            description: description || undefined,
            repoRoot: repoRoot || undefined,
          }),
        );
      }

      if (action === "get") {
        const id = readStringParam(params, "id", { required: true });
        return jsonResult(await callGatewayTool("projects.get", gatewayOpts, { id }));
      }

      if (action === "update") {
        const id = readStringParam(params, "id", { required: true });
        const name = readStringParam(params, "name");
        const description = readStringParam(params, "description", { trim: false });
        const repoRoot = readStringParam(params, "repoRoot", { trim: false });
        if (!name && description === undefined && repoRoot === undefined) {
          throw new Error("update requires at least one field (name/description/repoRoot)");
        }
        return jsonResult(
          await callGatewayTool("projects.update", gatewayOpts, {
            id,
            ...(name ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(repoRoot !== undefined ? { repoRoot } : {}),
          }),
        );
      }

      if (action === "archive") {
        const id = readStringParam(params, "id", { required: true });
        return jsonResult(await callGatewayTool("projects.archive", gatewayOpts, { id }));
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
