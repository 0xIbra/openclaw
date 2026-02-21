import type { GatewayRequestContext, GatewayRequestHandlers } from "./types.js";
import { TaskServiceError } from "../../tasks/service.js";
import {
  ErrorCodes,
  errorShape,
  validateTeamsCreateParams,
  validateTeamsDeleteParams,
  validateTeamsGetByNameParams,
  validateTeamsGetParams,
  validateTeamsListParams,
  validateTeamsMembersAddParams,
  validateTeamsMembersRemoveParams,
  validateTeamsUpdateParams,
  validateTeamsUpdateSettingsParams,
} from "../protocol/index.js";
import { assertValidParams } from "./validation.js";

function toGatewayTaskError(err: unknown) {
  if (err instanceof TaskServiceError) {
    const message = err.message || "teams request failed";
    return errorShape(ErrorCodes.INVALID_REQUEST, message, { details: err.details });
  }
  return errorShape(ErrorCodes.INVALID_REQUEST, String(err));
}

function readTeamWithMembers(context: GatewayRequestContext, teamId: string) {
  const team = context.taskService.getTeam(teamId);
  if (!team) {
    return null;
  }
  const members = context.taskService.listTeamMembers(teamId);
  return { team, members };
}

export const teamsHandlers: GatewayRequestHandlers = {
  "teams.list": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamsListParams, "teams.list", respond)) {
      return;
    }
    const teams = context.taskService.listTeams({
      includeArchived: (params as { includeArchived?: boolean }).includeArchived === true,
    });
    respond(true, { teams }, undefined);
  },
  "teams.create": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamsCreateParams, "teams.create", respond)) {
      return;
    }
    try {
      const team = context.taskService.createTeam(params);
      const members = context.taskService.listTeamMembers(team.id);
      context.broadcast("teams.changed", { reason: "created", team, members });
      respond(true, { team, members }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "teams.get": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamsGetParams, "teams.get", respond)) {
      return;
    }
    const teamId = (params as { id: string }).id;
    const result = readTeamWithMembers(context, teamId);
    if (!result) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `team not found: ${teamId}`),
      );
      return;
    }
    respond(true, result, undefined);
  },
  "teams.getByName": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamsGetByNameParams, "teams.getByName", respond)) {
      return;
    }
    try {
      const team = context.taskService.getTeamByName((params as { name: string }).name);
      if (!team) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `team not found: ${(params as { name: string }).name}`,
          ),
        );
        return;
      }
      const members = context.taskService.listTeamMembers(team.id);
      respond(true, { team, members }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "teams.update": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamsUpdateParams, "teams.update", respond)) {
      return;
    }
    try {
      const team = context.taskService.updateTeam(params);
      const members = context.taskService.listTeamMembers(team.id);
      context.broadcast("teams.changed", { reason: "updated", team, members });
      respond(true, { team, members }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "teams.updateSettings": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTeamsUpdateSettingsParams, "teams.updateSettings", respond)
    ) {
      return;
    }
    const p = params as { id: string; settings: Record<string, unknown> };
    try {
      const team = context.taskService.updateTeamSettings(p.id, p.settings);
      const members = context.taskService.listTeamMembers(team.id);
      context.broadcast("teams.changed", { reason: "updated", team, members });
      respond(true, { team, members }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "teams.delete": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamsDeleteParams, "teams.delete", respond)) {
      return;
    }
    const teamId = (params as { id: string }).id;
    try {
      const team = context.taskService.archiveTeam(teamId);
      const members = context.taskService.listTeamMembers(team.id);
      context.broadcast("teams.changed", { reason: "deleted", team, members });
      respond(true, { team, members }, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "teams.members.add": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateTeamsMembersAddParams, "teams.members.add", respond)) {
      return;
    }
    const input = params as { teamId: string; agentId: string; role: "lead" | "member" };
    try {
      context.taskService.upsertTeamMember(input);
      const result = readTeamWithMembers(context, input.teamId);
      if (!result) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `team not found: ${input.teamId}`),
        );
        return;
      }
      context.broadcast("teams.changed", {
        reason: "member_added",
        team: result.team,
        members: result.members,
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
  "teams.members.remove": ({ params, respond, context }) => {
    if (
      !assertValidParams(params, validateTeamsMembersRemoveParams, "teams.members.remove", respond)
    ) {
      return;
    }
    const input = params as { teamId: string; agentId: string };
    try {
      const removed = context.taskService.removeTeamMember(input.teamId, input.agentId);
      if (!removed) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `team member not found: ${input.teamId}/${input.agentId}`,
          ),
        );
        return;
      }
      const result = readTeamWithMembers(context, input.teamId);
      if (!result) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `team not found: ${input.teamId}`),
        );
        return;
      }
      context.broadcast("teams.changed", {
        reason: "member_removed",
        team: result.team,
        members: result.members,
      });
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, toGatewayTaskError(err));
    }
  },
};
