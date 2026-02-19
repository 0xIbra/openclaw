import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { createTaskDecomposer } from "../../tasks/runtime/decomposer.js";
import { TaskServiceError } from "../../tasks/service.js";
import {
  ErrorCodes,
  errorShape,
  validateTasksAttemptsListParams,
  validateTasksDecomposeParams,
  validateTasksAttemptFailParams,
  validateTasksAttemptFinishParams,
  validateTasksAttemptStartParams,
  validateTasksClaimNextParams,
  validateTasksCreateParams,
  validateTasksForceFailActiveParams,
  validateTasksGetParams,
  validateTasksLeaseHeartbeatParams,
  validateTasksListParams,
  validateTasksRuntimeAgentControlParams,
  validateTasksRuntimeStatusParams,
  validateTasksReviewDecideParams,
  validateTasksReviewListPendingParams,
  validateTasksRequeueParams,
  validateTasksTransitionParams,
  validateTasksUpdateParams,
} from "../protocol/index.js";
import { assertValidParams } from "./validation.js";

function toGatewayTaskError(err: unknown) {
  if (err instanceof TaskServiceError) {
    const message = err.message || "tasks request failed";
    return errorShape(ErrorCodes.INVALID_REQUEST, message, { details: err.details });
  }
  return errorShape(ErrorCodes.INVALID_REQUEST, String(err));
}

export const tasksHandlers: GatewayRequestHandlers = {
  "tasks.list": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksListParams, "tasks.list", respond)) {
      return;
    }
    const tasks = context.taskService.listTasks(params);
    respond(true, { tasks }, undefined);
  },
  "tasks.create": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksCreateParams, "tasks.create", respond)) {
      return;
    }
    try {
      const task = context.taskService.createTask(params);
      context.broadcast("tasks.changed", { reason: "created", task });
      respond(true, { task }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.get": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksGetParams, "tasks.get", respond)) {
      return;
    }
    const p = params as { id: string };
    const task = context.taskService.getTask(p.id);
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `task not found: ${p.id}`));
      return;
    }
    respond(true, { task }, undefined);
  },
  "tasks.update": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksUpdateParams, "tasks.update", respond)) {
      return;
    }
    try {
      const task = context.taskService.updateTask(params);
      context.broadcast("tasks.changed", { reason: "updated", task });
      respond(true, { task }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.transition": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksTransitionParams, "tasks.transition", respond)) {
      return;
    }
    try {
      const task = context.taskService.transitionTask(params);
      context.broadcast("tasks.changed", { reason: "transitioned", task });
      respond(true, { task }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.claimNext": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksClaimNextParams, "tasks.claimNext", respond)) {
      return;
    }
    try {
      const result = context.taskService.claimNextTask(params);
      if (!result) {
        respond(true, { task: null, claim: null }, undefined);
        return;
      }
      context.broadcast("tasks.changed", { reason: "updated", task: result.task });
      context.broadcast("tasks.claimed", {
        reason: "claimed",
        task: result.task,
        claim: result.claim,
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.leaseHeartbeat": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTasksLeaseHeartbeatParams, "tasks.leaseHeartbeat", respond)
    ) {
      return;
    }
    try {
      const result = context.taskService.leaseHeartbeat(params);
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.attemptStart": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTasksAttemptStartParams, "tasks.attemptStart", respond)
    ) {
      return;
    }
    try {
      const result = context.taskService.startAttempt(params);
      context.broadcast("tasks.changed", { reason: "transitioned", task: result.task });
      context.broadcast("tasks.attempt.changed", {
        taskId: result.task.id,
        attempt: result.attempt,
        reason: "started",
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.attemptFinish": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTasksAttemptFinishParams, "tasks.attemptFinish", respond)
    ) {
      return;
    }
    try {
      const result = context.taskService.finishAttempt(params);
      context.broadcast("tasks.changed", { reason: "transitioned", task: result.task });
      context.broadcast("tasks.attempt.changed", {
        taskId: result.task.id,
        attempt: result.attempt,
        reason: "finished",
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.attemptFail": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksAttemptFailParams, "tasks.attemptFail", respond)) {
      return;
    }
    try {
      const result = context.taskService.failAttempt(params);
      context.broadcast("tasks.changed", { reason: "transitioned", task: result.task });
      context.broadcast("tasks.attempt.changed", {
        taskId: result.task.id,
        attempt: result.attempt,
        reason: "failed",
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.requeue": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksRequeueParams, "tasks.requeue", respond)) {
      return;
    }
    try {
      const result = context.taskService.requeueTask(params);
      context.broadcast("tasks.changed", { reason: "transitioned", task: result.task });
      const latestAttempt = context.taskService.listTaskAttempts(result.task.id, 1)[0];
      if (latestAttempt) {
        context.broadcast("tasks.attempt.changed", {
          taskId: result.task.id,
          attempt: latestAttempt,
          reason: "requeued",
        });
      }
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.attempts.list": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTasksAttemptsListParams, "tasks.attempts.list", respond)
    ) {
      return;
    }
    try {
      const p = params as { taskId: string; limit?: number };
      const attempts = context.taskService.listTaskAttempts(p.taskId, p.limit ?? 50);
      respond(true, { attempts }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.decompose": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTasksDecomposeParams, "tasks.decompose", respond)) {
      return;
    }
    const run = async () => {
      const input = params as {
        taskId: string;
        force?: boolean;
        requestedBy?: string;
        plan?: {
          summary?: string | null;
          children: Array<{
            localId: string;
            title: string;
            description: string;
            type: "feature" | "bugfix" | "refactor" | "test" | "review" | "research" | "devops";
            priority: "critical" | "high" | "medium" | "low";
            dependsOnLocalIds: string[];
            tags?: string[];
            relevantPaths?: string[];
          }>;
        };
      };
      const parentTask = context.taskService.getTask(input.taskId);
      if (!parentTask) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `task not found: ${input.taskId}`),
        );
        return;
      }
      const teamId = parentTask.teamId;
      if (!teamId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `task has no team assignment: ${input.taskId}`),
        );
        return;
      }
      const team = context.taskService.getTeam(teamId);
      const leadAgentId = team?.leadAgentId?.trim();
      if (!team || !leadAgentId) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `team lead not configured for task team: ${teamId}`,
          ),
        );
        return;
      }
      let plan = input.plan;
      let plannerBackend: string | null = null;
      let plannerSessionId: string | null = null;
      if (!plan) {
        const decomposer = createTaskDecomposer({ config: loadConfig() });
        const generated = await decomposer.decompose({
          leadAgentId,
          teamId,
          task: parentTask,
        });
        plan = generated.plan;
        plannerBackend = generated.plannerBackend ?? null;
        plannerSessionId = generated.plannerSessionId ?? null;
      } else {
        plannerBackend = "manual";
      }
      const result = context.taskService.decomposeTask({
        parentTaskId: parentTask.id,
        teamId,
        leadAgentId,
        requestedBy: input.requestedBy,
        force: input.force === true,
        plannerBackend,
        plannerSessionId,
        dedupeKey: `rpc:${parentTask.id}`,
        plan,
      });
      context.broadcast("tasks.changed", { reason: "updated", task: result.parentTask });
      for (const child of result.children) {
        context.broadcast("tasks.changed", { reason: "created", task: child });
      }
      context.broadcast("tasks.decomposition.changed", {
        reason: result.deduped ? "updated" : "created",
        parentTask: result.parentTask,
        children: result.children,
        decompositionRun: result.decompositionRun,
        deduped: result.deduped,
      });
      respond(true, result, undefined);
    };
    void run().catch((err) => {
      respond(false, undefined, toGatewayTaskError(err));
    });
  },
  "tasks.review.listPending": ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateTasksReviewListPendingParams,
        "tasks.review.listPending",
        respond,
      )
    ) {
      return;
    }
    try {
      const input = params as { teamId?: string; projectId?: string; limit?: number };
      const items = context.taskService.listPendingTaskReviews({
        teamId: input.teamId,
        projectId: input.projectId,
        limit: input.limit,
      });
      respond(true, { items }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.review.decide": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTasksReviewDecideParams, "tasks.review.decide", respond)
    ) {
      return;
    }
    try {
      const input = params as {
        taskId: string;
        decision: "approve" | "reject";
        actor: string;
        reason?: string;
      };
      const result = context.taskService.decideTaskReview(input);
      context.broadcast("tasks.changed", { reason: "transitioned", task: result.task });
      context.broadcast("tasks.review.changed", {
        reason: result.review.status,
        task: result.task,
        review: result.review,
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.forceFailActive": ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateTasksForceFailActiveParams,
        "tasks.forceFailActive",
        respond,
      )
    ) {
      return;
    }
    try {
      const result = context.taskService.forceFailActiveTask(
        params as { taskId: string; reason: string; actor: string },
      );
      context.broadcast("tasks.changed", { reason: "transitioned", task: result.task });
      context.broadcast("tasks.attempt.changed", {
        taskId: result.task.id,
        attempt: result.attempt,
        reason: "failed",
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "tasks.runtime.status": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTasksRuntimeStatusParams, "tasks.runtime.status", respond)
    ) {
      return;
    }
    const workers = context.taskRuntimeSupervisor?.getWorkerStatuses() ?? [];
    const leads = context.taskLeadSupervisor?.getLeadStatuses() ?? [];
    const teams = context.taskService.listTeams({ includeArchived: false }).map((team) => ({
      teamId: team.id,
      teamName: team.name,
      leadAgentId: team.leadAgentId,
      memberAgentIds: context.taskService
        .listTeamMembers(team.id)
        .map((member) => member.agentId)
        .filter(Boolean),
    }));
    respond(
      true,
      {
        workers,
        leads,
        teams,
        updatedAtMs: Date.now(),
      },
      undefined,
    );
  },
  "tasks.runtime.pauseAgent": async ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateTasksRuntimeAgentControlParams,
        "tasks.runtime.pauseAgent",
        respond,
      )
    ) {
      return;
    }
    if (!context.taskRuntimeSupervisor) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "task runtime supervisor is unavailable"),
      );
      return;
    }
    const worker = await context.taskRuntimeSupervisor.pauseAgent(
      (params as { agentId: string }).agentId,
    );
    respond(true, { worker }, undefined);
  },
  "tasks.runtime.resumeAgent": async ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateTasksRuntimeAgentControlParams,
        "tasks.runtime.resumeAgent",
        respond,
      )
    ) {
      return;
    }
    if (!context.taskRuntimeSupervisor) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "task runtime supervisor is unavailable"),
      );
      return;
    }
    const worker = await context.taskRuntimeSupervisor.resumeAgent(
      (params as { agentId: string }).agentId,
    );
    respond(true, { worker }, undefined);
  },
  "tasks.runtime.restartAgent": async ({ params, respond, context }) => {
    if (
      !assertValidParams(
        params,
        validateTasksRuntimeAgentControlParams,
        "tasks.runtime.restartAgent",
        respond,
      )
    ) {
      return;
    }
    if (!context.taskRuntimeSupervisor) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "task runtime supervisor is unavailable"),
      );
      return;
    }
    const worker = await context.taskRuntimeSupervisor.restartAgent(
      (params as { agentId: string }).agentId,
    );
    respond(true, { worker }, undefined);
  },
};
