import { Type } from "@sinclair/typebox";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

const TASKS_ACTIONS = [
  "list",
  "create",
  "get",
  "update",
  "transition",
  "decompose",
  "reviewListPending",
  "reviewDecide",
  "askQuestion",
  "publishMessage",
] as const;
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
const REVIEW_DECISIONS = ["approve", "reject"] as const;

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
  decision: optionalStringEnum(REVIEW_DECISIONS),
  actor: Type.Optional(Type.String()),
  reason: Type.Optional(Type.String()),
  parentTaskId: Type.Optional(Type.String()),
  dependsOnTaskIds: Type.Optional(Type.Array(Type.String())),
  force: Type.Optional(Type.Boolean()),
  requestedBy: Type.Optional(Type.String()),
  planSummary: Type.Optional(Type.String()),
  planChildren: Type.Optional(
    Type.Array(
      Type.Object(
        {
          localId: Type.String(),
          title: Type.String(),
          description: Type.String(),
          type: optionalStringEnum(TASK_TYPES),
          priority: optionalStringEnum(TASK_PRIORITIES),
          dependsOnLocalIds: Type.Optional(Type.Array(Type.String())),
          tags: Type.Optional(Type.Array(Type.String())),
          relevantPaths: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
    ),
  ),
  assignedAgentId: Type.Optional(Type.String()),
  maxAttempts: Type.Optional(Type.Number()),
  relevantPaths: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  createdBy: Type.Optional(Type.String()),
  includeArchivedProjects: Type.Optional(Type.Boolean()),
  query: Type.Optional(Type.String()),
  tag: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
  // Bus message fields (for askQuestion / publishMessage)
  senderAgentId: Type.Optional(Type.String()),
  receiverAgentId: Type.Optional(Type.String()),
  taskId: Type.Optional(Type.String()),
  messageType: Type.Optional(Type.String()),
  subject: Type.Optional(Type.String()),
  body: Type.Optional(Type.String()),
});

export function createTasksTool(): AnyAgentTool {
  return {
    label: "Tasks",
    name: "tasks",
    description:
      "List/create/get/update/transition tasks inside projects. Use askQuestion(senderAgentId, receiverAgentId, body, taskId?) to send a question to your team lead. Use publishMessage(senderAgentId, receiverAgentId, messageType, body) to send arbitrary bus messages.",
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
            teamId: readStringParam(params, "teamId") || undefined,
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
          teamId: readStringParam(params, "teamId") || undefined,
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

      if (action === "decompose") {
        const id = readStringParam(params, "id", { required: true });
        const rawChildren = Array.isArray(params.planChildren) ? params.planChildren : [];
        const children = rawChildren
          .map((entry, index) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
              return null;
            }
            const value = entry as Record<string, unknown>;
            const localId =
              (typeof value.localId === "string" ? value.localId.trim() : "") || `s${index + 1}`;
            const title = typeof value.title === "string" ? value.title.trim() : "";
            const description =
              typeof value.description === "string" ? value.description.trim() : "";
            const type = typeof value.type === "string" ? value.type.trim() : "feature";
            const priority = typeof value.priority === "string" ? value.priority.trim() : "medium";
            const dependsOnLocalIds = Array.isArray(value.dependsOnLocalIds)
              ? value.dependsOnLocalIds
                  .map((dep) => (typeof dep === "string" ? dep.trim() : ""))
                  .filter(Boolean)
              : [];
            const tags = Array.isArray(value.tags)
              ? value.tags.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean)
              : [];
            const relevantPaths = Array.isArray(value.relevantPaths)
              ? value.relevantPaths
                  .map((pathValue) => (typeof pathValue === "string" ? pathValue.trim() : ""))
                  .filter(Boolean)
              : [];
            if (!title || !description) {
              return null;
            }
            return {
              localId,
              title,
              description,
              type,
              priority,
              dependsOnLocalIds,
              tags: tags.length > 0 ? tags : undefined,
              relevantPaths: relevantPaths.length > 0 ? relevantPaths : undefined,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry != null);
        const hasPlan = children.length > 0;
        return jsonResult(
          await callGatewayTool("tasks.decompose", gatewayOpts, {
            taskId: id,
            force: params.force === true ? true : undefined,
            requestedBy: readStringParam(params, "requestedBy") || undefined,
            plan: hasPlan
              ? {
                  summary: readStringParam(params, "planSummary", { trim: false }) || undefined,
                  children,
                }
              : undefined,
          }),
        );
      }

      if (action === "reviewListPending") {
        return jsonResult(
          await callGatewayTool("tasks.review.listPending", gatewayOpts, {
            teamId: readStringParam(params, "teamId") || undefined,
            projectId: readStringParam(params, "projectId") || undefined,
            limit: typeof params.limit === "number" ? Math.floor(params.limit) : undefined,
          }),
        );
      }

      if (action === "reviewDecide") {
        const id = readStringParam(params, "id", { required: true });
        const decision = readStringParam(params, "decision", { required: true });
        const actor = readStringParam(params, "actor", { required: true });
        return jsonResult(
          await callGatewayTool("tasks.review.decide", gatewayOpts, {
            taskId: id,
            decision,
            actor,
            reason: readStringParam(params, "reason", { trim: false }) || undefined,
          }),
        );
      }

      if (action === "askQuestion") {
        const senderAgentId = readStringParam(params, "senderAgentId", { required: true });
        const receiverAgentId = readStringParam(params, "receiverAgentId", { required: true });
        const body = readStringParam(params, "body", { required: true });
        return jsonResult(
          await callGatewayTool("bus.publish", gatewayOpts, {
            senderAgentId,
            receiverAgentId,
            taskId: readStringParam(params, "taskId") || undefined,
            messageType: "question",
            subject: readStringParam(params, "subject") || "question",
            body,
          }),
        );
      }

      if (action === "publishMessage") {
        const senderAgentId = readStringParam(params, "senderAgentId", { required: true });
        const receiverAgentId = readStringParam(params, "receiverAgentId", { required: true });
        const messageType = readStringParam(params, "messageType", { required: true });
        const body = readStringParam(params, "body", { required: true });
        return jsonResult(
          await callGatewayTool("bus.publish", gatewayOpts, {
            senderAgentId,
            receiverAgentId,
            taskId: readStringParam(params, "taskId") || undefined,
            messageType,
            subject: readStringParam(params, "subject") || undefined,
            body,
          }),
        );
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
