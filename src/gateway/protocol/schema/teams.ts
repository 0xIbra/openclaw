import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const TeamRoleSchema = Type.Union([Type.Literal("lead"), Type.Literal("member")]);

export const TeamSchema = Type.Object(
  {
    id: NonEmptyString,
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    leadAgentId: Type.Union([Type.String(), Type.Null()]),
    settings: Type.Record(Type.String(), Type.Unknown()),
    createdAtMs: Type.Integer({ minimum: 0 }),
    updatedAtMs: Type.Integer({ minimum: 0 }),
    archivedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const TeamMemberSchema = Type.Object(
  {
    teamId: NonEmptyString,
    agentId: NonEmptyString,
    role: TeamRoleSchema,
    createdAtMs: Type.Integer({ minimum: 0 }),
    updatedAtMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TeamsListParamsSchema = Type.Object(
  {
    includeArchived: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TeamsListResultSchema = Type.Object(
  {
    teams: Type.Array(TeamSchema),
  },
  { additionalProperties: false },
);

export const TeamsCreateParamsSchema = Type.Object(
  {
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    leadAgentId: Type.Optional(Type.String()),
    settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export const TeamsGetParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TeamsGetByNameParamsSchema = Type.Object(
  {
    name: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TeamsUpdateParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    name: Type.Optional(NonEmptyString),
    description: Type.Optional(Type.String()),
    leadAgentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export const TeamsUpdateSettingsParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    settings: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);

export const TeamsDeleteParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TeamsMembersAddParamsSchema = Type.Object(
  {
    teamId: NonEmptyString,
    agentId: NonEmptyString,
    role: TeamRoleSchema,
  },
  { additionalProperties: false },
);

export const TeamsMembersRemoveParamsSchema = Type.Object(
  {
    teamId: NonEmptyString,
    agentId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TeamWithMembersResultSchema = Type.Object(
  {
    team: TeamSchema,
    members: Type.Array(TeamMemberSchema),
  },
  { additionalProperties: false },
);

export const TeamsChangedEventSchema = Type.Object(
  {
    reason: Type.Union([
      Type.Literal("created"),
      Type.Literal("updated"),
      Type.Literal("deleted"),
      Type.Literal("member_added"),
      Type.Literal("member_removed"),
    ]),
    team: TeamSchema,
    members: Type.Optional(Type.Array(TeamMemberSchema)),
  },
  { additionalProperties: false },
);
