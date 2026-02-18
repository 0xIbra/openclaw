import type { GatewayRequestHandlers } from "./types.js";
import { TaskServiceError } from "../../tasks/service.js";
import {
  ErrorCodes,
  errorShape,
  validateTasksCreateParams,
  validateTasksGetParams,
  validateTasksListParams,
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
};
