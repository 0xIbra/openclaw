import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const ProjectSchema = Type.Object(
  {
    id: NonEmptyString,
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    repoRoot: Type.Optional(Type.String()),
    buildCmd: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    testCmd: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    lintCmd: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    language: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    framework: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    createdAtMs: Type.Integer({ minimum: 0 }),
    updatedAtMs: Type.Integer({ minimum: 0 }),
    archivedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const ProjectsListParamsSchema = Type.Object(
  {
    includeArchived: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const ProjectsListResultSchema = Type.Object(
  {
    projects: Type.Array(ProjectSchema),
  },
  { additionalProperties: false },
);

export const ProjectsCreateParamsSchema = Type.Object(
  {
    name: NonEmptyString,
    description: Type.Optional(Type.String()),
    repoRoot: Type.Optional(Type.String()),
    buildCmd: Type.Optional(Type.String()),
    testCmd: Type.Optional(Type.String()),
    lintCmd: Type.Optional(Type.String()),
    language: Type.Optional(Type.String()),
    framework: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ProjectsGetParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ProjectsUpdateParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    name: Type.Optional(NonEmptyString),
    description: Type.Optional(Type.String()),
    repoRoot: Type.Optional(Type.String()),
    buildCmd: Type.Optional(Type.String()),
    testCmd: Type.Optional(Type.String()),
    lintCmd: Type.Optional(Type.String()),
    language: Type.Optional(Type.String()),
    framework: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ProjectsArchiveParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ProjectsChangedEventSchema = Type.Object(
  {
    reason: Type.Union([
      Type.Literal("created"),
      Type.Literal("updated"),
      Type.Literal("archived"),
    ]),
    project: ProjectSchema,
  },
  { additionalProperties: false },
);
