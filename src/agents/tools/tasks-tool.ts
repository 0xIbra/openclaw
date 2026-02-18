import { Type } from "@sinclair/typebox";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

const TASKS_ACTIONS = ["list", "create", "get", "update", "transition"] as const;
const TASK_TYPES = [
  "feature",
  "bugfix",
  "refactor",
  "test",
  "review",
  "research",
  "devops",
] as const;
const TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
const TASK_COMPLEXITIES = ["trivial", "small", "medium", "large", "epic"] as const;
const TASK_STATUSES = [
  "created",
  "backlog",
  "assigned",
  "running",
  "review",
  "blocked",
  "failed",
  "done",
] as const;

const TasksToolSchema = Type.Object({
  action: stringEnum(TASKS_ACTIONS),
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  id: Type.Optional(Type.String()),
  projectId: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  type: optionalStringEnum(TASK_TYPES),
  priority: optionalStringEnum(TASK_PRIORITIES),
  complexity: optionalStringEnum(TASK_COMPLEXITIES),
  status: optionalStringEnum(TASK_STATUSES),
  toStatus: optionalStringEnum(TASK_STATUSES),
  parentTaskId: Type.Optional(Type.String()),
  dependsOnTaskIds: Type.Optional(Type.Array(Type.String())),
  assignedAgentId: Type.Optional(Type.String()),
  maxAttempts: Type.Optional(Type.Number()),
  relevantPaths: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  createdBy: Type.Optional(Type.String()),
  includeArchivedProjects: Type.Optional(Type.Boolean()),
  query: Type.Optional(Type.String()),
  tag: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
});

export function createTasksTool(): AnyAgentTool {
  return {
    label: "Tasks",
    name: "tasks",
    description: "List/create/get/update/transition tasks inside projects.",
    parameters: TasksToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts: GatewayCallOptions = {
        gatewayUrl: readStringParam(params, "gatewayUrl", { trim: false }),
        gatewayToken: readStringParam(params, "gatewayToken", { trim: false }),
        timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
      };

      if (action === "list") {
        return jsonResult(
          await callGatewayTool("tasks.list", gatewayOpts, {
            projectId: readStringParam(params, "projectId") || undefined,
            status: readStringParam(params, "status") || undefined,
            assignedAgentId: readStringParam(params, "assignedAgentId") || undefined,
            type: readStringParam(params, "type") || undefined,
            priority: readStringParam(params, "priority") || undefined,
            tag: readStringParam(params, "tag") || undefined,
            query: readStringParam(params, "query", { trim: false }) || undefined,
            limit: typeof params.limit === "number" ? Math.floor(params.limit) : undefined,
            includeArchivedProjects:
              typeof params.includeArchivedProjects === "boolean"
                ? params.includeArchivedProjects
                : undefined,
          }),
        );
      }

      if (action === "create") {
        const projectId = readStringParam(params, "projectId", { required: true });
        const title = readStringParam(params, "title", { required: true });
        const description = readStringParam(params, "description", { required: true });
        const type = readStringParam(params, "type", { required: true });
        return jsonResult(
          await callGatewayTool("tasks.create", gatewayOpts, {
            projectId,
            title,
            description,
            type,
            priority: readStringParam(params, "priority") || undefined,
            complexity: readStringParam(params, "complexity") || undefined,
            status: readStringParam(params, "status") || undefined,
            parentTaskId: readStringParam(params, "parentTaskId") || undefined,
            dependsOnTaskIds: Array.isArray(params.dependsOnTaskIds)
              ? params.dependsOnTaskIds
                  .map((value) => (typeof value === "string" ? value.trim() : ""))
                  .filter(Boolean)
              : undefined,
            assignedAgentId: readStringParam(params, "assignedAgentId") || undefined,
            maxAttempts:
              typeof params.maxAttempts === "number" ? Math.floor(params.maxAttempts) : undefined,
            relevantPaths: Array.isArray(params.relevantPaths)
              ? params.relevantPaths
                  .map((value) => (typeof value === "string" ? value.trim() : ""))
                  .filter(Boolean)
              : undefined,
            tags: Array.isArray(params.tags)
              ? params.tags
                  .map((value) => (typeof value === "string" ? value.trim() : ""))
                  .filter(Boolean)
              : undefined,
            createdBy: readStringParam(params, "createdBy") || undefined,
          }),
        );
      }

      if (action === "get") {
        const id = readStringParam(params, "id", { required: true });
        return jsonResult(await callGatewayTool("tasks.get", gatewayOpts, { id }));
      }

      if (action === "update") {
        const id = readStringParam(params, "id", { required: true });
        const patch = {
          title: readStringParam(params, "title") || undefined,
          description: readStringParam(params, "description") || undefined,
          type: readStringParam(params, "type") || undefined,
          priority: readStringParam(params, "priority") || undefined,
          complexity: readStringParam(params, "complexity") || undefined,
          parentTaskId: readStringParam(params, "parentTaskId"),
          dependsOnTaskIds: Array.isArray(params.dependsOnTaskIds)
            ? params.dependsOnTaskIds
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean)
            : undefined,
          assignedAgentId: readStringParam(params, "assignedAgentId", { trim: false }),
          maxAttempts:
            typeof params.maxAttempts === "number" ? Math.floor(params.maxAttempts) : undefined,
          relevantPaths: Array.isArray(params.relevantPaths)
            ? params.relevantPaths
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean)
            : undefined,
          tags: Array.isArray(params.tags)
            ? params.tags
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter(Boolean)
            : undefined,
        };

        const hasPatch = Object.values(patch).some((value) => value !== undefined);
        if (!hasPatch) {
          throw new Error("update requires at least one task field");
        }

        return jsonResult(await callGatewayTool("tasks.update", gatewayOpts, { id, ...patch }));
      }

      if (action === "transition") {
        const id = readStringParam(params, "id", { required: true });
        const toStatus = readStringParam(params, "toStatus", { required: true });
        return jsonResult(
          await callGatewayTool("tasks.transition", gatewayOpts, {
            id,
            toStatus,
            assignedAgentId: readStringParam(params, "assignedAgentId") || undefined,
          }),
        );
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
