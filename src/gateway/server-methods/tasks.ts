import type { GatewayRequestHandlers } from "./types.js";
import { TaskServiceError } from "../../tasks/service.js";
import {
  ErrorCodes,
  errorShape,
  validateTasksAttemptsListParams,
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
