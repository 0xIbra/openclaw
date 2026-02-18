import type { GatewayRequestHandlers } from "./types.js";
import { TaskServiceError } from "../../tasks/service.js";
import {
  ErrorCodes,
  errorShape,
  validateTasksAttemptFailParams,
  validateTasksAttemptFinishParams,
  validateTasksAttemptStartParams,
  validateTasksClaimNextParams,
  validateTasksCreateParams,
  validateTasksGetParams,
  validateTasksLeaseHeartbeatParams,
  validateTasksListParams,
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
};
