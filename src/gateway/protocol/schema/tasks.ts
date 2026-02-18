import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

const TaskTypeSchema = Type.Union([
  Type.Literal("feature"),
  Type.Literal("bugfix"),
  Type.Literal("refactor"),
  Type.Literal("test"),
  Type.Literal("review"),
  Type.Literal("research"),
  Type.Literal("devops"),
]);

const TaskPrioritySchema = Type.Union([
  Type.Literal("critical"),
  Type.Literal("high"),
  Type.Literal("medium"),
  Type.Literal("low"),
]);

const TaskComplexitySchema = Type.Union([
  Type.Literal("trivial"),
  Type.Literal("small"),
  Type.Literal("medium"),
  Type.Literal("large"),
  Type.Literal("epic"),
]);

export const TaskStatusSchema = Type.Union([
  Type.Literal("created"),
  Type.Literal("backlog"),
  Type.Literal("assigned"),
  Type.Literal("running"),
  Type.Literal("review"),
  Type.Literal("blocked"),
  Type.Literal("failed"),
  Type.Literal("done"),
]);

export const TaskSchema = Type.Object(
  {
    id: NonEmptyString,
    projectId: NonEmptyString,
    title: NonEmptyString,
    description: NonEmptyString,
    type: TaskTypeSchema,
    priority: TaskPrioritySchema,
    complexity: Type.Union([TaskComplexitySchema, Type.Null()]),
    status: TaskStatusSchema,
    parentTaskId: Type.Union([Type.String(), Type.Null()]),
    dependsOnTaskIds: Type.Array(NonEmptyString),
    blockedByTaskIds: Type.Array(NonEmptyString),
    assignedAgentId: Type.Union([Type.String(), Type.Null()]),
    maxAttempts: Type.Integer({ minimum: 1 }),
    attemptCount: Type.Integer({ minimum: 0 }),
    relevantPaths: Type.Array(Type.String()),
    tags: Type.Array(Type.String()),
    createdBy: NonEmptyString,
    createdAtMs: Type.Integer({ minimum: 0 }),
    updatedAtMs: Type.Integer({ minimum: 0 }),
    startedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    completedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const TasksListParamsSchema = Type.Object(
  {
    projectId: Type.Optional(NonEmptyString),
    status: Type.Optional(TaskStatusSchema),
    assignedAgentId: Type.Optional(NonEmptyString),
    type: Type.Optional(TaskTypeSchema),
    priority: Type.Optional(TaskPrioritySchema),
    tag: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
    includeArchivedProjects: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TasksListResultSchema = Type.Object(
  {
    tasks: Type.Array(TaskSchema),
  },
  { additionalProperties: false },
);

export const TasksCreateParamsSchema = Type.Object(
  {
    projectId: NonEmptyString,
    title: NonEmptyString,
    description: NonEmptyString,
    type: TaskTypeSchema,
    priority: Type.Optional(TaskPrioritySchema),
    complexity: Type.Optional(TaskComplexitySchema),
    status: Type.Optional(TaskStatusSchema),
    parentTaskId: Type.Optional(NonEmptyString),
    dependsOnTaskIds: Type.Optional(Type.Array(NonEmptyString)),
    assignedAgentId: Type.Optional(Type.String()),
    maxAttempts: Type.Optional(Type.Integer({ minimum: 1 })),
    relevantPaths: Type.Optional(Type.Array(Type.String())),
    tags: Type.Optional(Type.Array(Type.String())),
    createdBy: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const TasksGetParamsSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TasksUpdateParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    title: Type.Optional(NonEmptyString),
    description: Type.Optional(NonEmptyString),
    type: Type.Optional(TaskTypeSchema),
    priority: Type.Optional(TaskPrioritySchema),
    complexity: Type.Optional(Type.Union([TaskComplexitySchema, Type.Null()])),
    parentTaskId: Type.Optional(Type.Union([NonEmptyString, Type.Null()])),
    dependsOnTaskIds: Type.Optional(Type.Array(NonEmptyString)),
    assignedAgentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    maxAttempts: Type.Optional(Type.Integer({ minimum: 1 })),
    relevantPaths: Type.Optional(Type.Array(Type.String())),
    tags: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

export const TasksTransitionParamsSchema = Type.Object(
  {
    id: NonEmptyString,
    toStatus: TaskStatusSchema,
    assignedAgentId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const TasksChangedEventSchema = Type.Object(
  {
    reason: Type.Union([
      Type.Literal("created"),
      Type.Literal("updated"),
      Type.Literal("transitioned"),
    ]),
    task: TaskSchema,
  },
  { additionalProperties: false },
);
