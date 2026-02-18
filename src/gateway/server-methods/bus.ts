import type { GatewayRequestHandlers } from "./types.js";
import { TaskServiceError } from "../../tasks/service.js";
import {
  ErrorCodes,
  errorShape,
  validateBusAckParams,
  validateBusPublishParams,
  validateBusPullParams,
} from "../protocol/index.js";
import { assertValidParams } from "./validation.js";

function toGatewayTaskError(err: unknown) {
  if (err instanceof TaskServiceError) {
    const message = err.message || "bus request failed";
    return errorShape(ErrorCodes.INVALID_REQUEST, message, { details: err.details });
  }
  return errorShape(ErrorCodes.INVALID_REQUEST, String(err));
}

export const busHandlers: GatewayRequestHandlers = {
  "bus.publish": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateBusPublishParams, "bus.publish", respond)) {
      return;
    }
    try {
      const result = context.taskService.publishBusMessage(params);
      const message = context.taskService.getBusMessage(result.messageId);
      if (message) {
        context.broadcast("bus.message", {
          messageId: message.id,
          receiverAgentId: message.receiverAgentId,
          messageType: message.messageType,
          taskId: message.taskId,
          createdAtMs: message.createdAtMs,
          deliveryCount: message.deliveryCount,
        });
      }
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "bus.pull": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateBusPullParams, "bus.pull", respond)) {
      return;
    }
    try {
      const deliveries = context.taskService.pullBusMessages(params);
      respond(true, { deliveries }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "bus.ack": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateBusAckParams, "bus.ack", respond)) {
      return;
    }
    try {
      const message = context.taskService.ackBusMessage(params);
      respond(true, { message }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
};
