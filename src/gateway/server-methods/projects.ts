import type { GatewayRequestHandlers } from "./types.js";
import { TaskServiceError } from "../../tasks/service.js";
import {
  ErrorCodes,
  errorShape,
  validateProjectsArchiveParams,
  validateProjectsCreateParams,
  validateProjectsGetParams,
  validateProjectsListParams,
  validateProjectsUpdateParams,
} from "../protocol/index.js";
import { assertValidParams } from "./validation.js";

function toGatewayTaskError(err: unknown) {
  if (err instanceof TaskServiceError) {
    const message = err.message || "projects request failed";
    return errorShape(ErrorCodes.INVALID_REQUEST, message, { details: err.details });
  }
  return errorShape(ErrorCodes.INVALID_REQUEST, String(err));
}

export const projectsHandlers: GatewayRequestHandlers = {
  "projects.list": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateProjectsListParams, "projects.list", respond)) {
      return;
    }
    const p = params as { includeArchived?: boolean };
    const projects = context.taskService.listProjects({
      includeArchived: p.includeArchived === true,
    });
    respond(true, { projects }, undefined);
  },
  "projects.create": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateProjectsCreateParams, "projects.create", respond)) {
      return;
    }
    try {
      const project = context.taskService.createProject(params);
      context.broadcast("projects.changed", { reason: "created", project });
      respond(true, { project }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "projects.get": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateProjectsGetParams, "projects.get", respond)) {
      return;
    }
    const p = params as { id: string };
    const project = context.taskService.getProject(p.id);
    if (!project) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `project not found: ${p.id}`),
      );
      return;
    }
    respond(true, { project }, undefined);
  },
  "projects.update": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateProjectsUpdateParams, "projects.update", respond)) {
      return;
    }
    try {
      const project = context.taskService.updateProject(params);
      context.broadcast("projects.changed", { reason: "updated", project });
      respond(true, { project }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "projects.archive": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateProjectsArchiveParams, "projects.archive", respond)) {
      return;
    }
    const p = params as { id: string };
    try {
      const project = context.taskService.archiveProject(p.id);
      context.broadcast("projects.changed", { reason: "archived", project });
      respond(true, { project }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
};
