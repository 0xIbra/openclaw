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
    teamId: Type.Union([Type.String(), Type.Null()]),
    currentAttemptId: Type.Union([Type.String(), Type.Null()]),
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

export const TaskClaimSchema = Type.Object(
  {
    id: NonEmptyString,
    taskId: NonEmptyString,
    agentId: NonEmptyString,
    teamId: Type.Union([Type.String(), Type.Null()]),
    leaseToken: NonEmptyString,
    state: Type.Union([Type.Literal("active"), Type.Literal("released"), Type.Literal("expired")]),
    leasedAtMs: Type.Integer({ minimum: 0 }),
    heartbeatAtMs: Type.Integer({ minimum: 0 }),
    leaseExpiresAtMs: Type.Integer({ minimum: 0 }),
    releasedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const TaskAttemptSchema = Type.Object(
  {
    id: NonEmptyString,
    taskId: NonEmptyString,
    status: NonEmptyString,
    startedAtMs: Type.Integer({ minimum: 0 }),
    endedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    agentId: Type.Union([Type.String(), Type.Null()]),
    notes: Type.Union([Type.String(), Type.Null()]),
    attemptNumber: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    claimId: Type.Union([Type.String(), Type.Null()]),
    teamId: Type.Union([Type.String(), Type.Null()]),
    sessionBackend: Type.Union([Type.String(), Type.Null()]),
    sessionId: Type.Union([Type.String(), Type.Null()]),
    summary: Type.Union([Type.String(), Type.Null()]),
    errorText: Type.Union([Type.String(), Type.Null()]),
    commandOutcome: Type.Record(Type.String(), Type.Unknown()),
    testOutcome: Type.Record(Type.String(), Type.Unknown()),
    changedFiles: Type.Array(Type.String()),
    metrics: Type.Record(Type.String(), Type.Unknown()),
    createdAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    updatedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const TaskDecompositionRunStatusSchema = Type.Union([
  Type.Literal("planned"),
  Type.Literal("applied"),
  Type.Literal("failed"),
  Type.Literal("superseded"),
]);

export const TaskDecompositionRunSchema = Type.Object(
  {
    id: NonEmptyString,
    parentTaskId: NonEmptyString,
    teamId: Type.Union([Type.String(), Type.Null()]),
    leadAgentId: NonEmptyString,
    status: TaskDecompositionRunStatusSchema,
    plannerBackend: Type.Union([Type.String(), Type.Null()]),
    plannerSessionId: Type.Union([Type.String(), Type.Null()]),
    plan: Type.Record(Type.String(), Type.Unknown()),
    childTaskIds: Type.Array(NonEmptyString),
    errorText: Type.Union([Type.String(), Type.Null()]),
    dedupeKey: Type.Union([Type.String(), Type.Null()]),
    createdAtMs: Type.Integer({ minimum: 0 }),
    updatedAtMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TaskReviewStatusSchema = Type.Union([
  Type.Literal("pending_lead"),
  Type.Literal("pending_human"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
  Type.Literal("blocked"),
]);

export const TaskReviewSchema = Type.Object(
  {
    id: NonEmptyString,
    taskId: NonEmptyString,
    teamId: Type.Union([Type.String(), Type.Null()]),
    leadAgentId: NonEmptyString,
    status: TaskReviewStatusSchema,
    requireHumanApproval: Type.Boolean(),
    autoApproveOnClean: Type.Boolean(),
    decisionActor: Type.Union([Type.String(), Type.Null()]),
    decisionReason: Type.Union([Type.String(), Type.Null()]),
    verdict: Type.Record(Type.String(), Type.Unknown()),
    createdAtMs: Type.Integer({ minimum: 0 }),
    updatedAtMs: Type.Integer({ minimum: 0 }),
    resolvedAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
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

export const TasksClaimNextParamsSchema = Type.Object(
  {
    agentId: NonEmptyString,
    teamId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    leaseDurationMs: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export const TasksClaimNextResultSchema = Type.Object(
  {
    task: Type.Union([TaskSchema, Type.Null()]),
    claim: Type.Union([TaskClaimSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const TasksLeaseHeartbeatParamsSchema = Type.Object(
  {
    claimId: NonEmptyString,
    agentId: NonEmptyString,
    leaseToken: NonEmptyString,
    leaseDurationMs: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const TasksLeaseHeartbeatResultSchema = Type.Object(
  {
    task: TaskSchema,
    claim: TaskClaimSchema,
  },
  { additionalProperties: false },
);

export const TasksAttemptStartParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    claimId: NonEmptyString,
    agentId: NonEmptyString,
    leaseToken: NonEmptyString,
    teamId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    sessionBackend: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    sessionId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    summary: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);

export const TasksAttemptStartResultSchema = Type.Object(
  {
    task: TaskSchema,
    claim: TaskClaimSchema,
    attempt: TaskAttemptSchema,
  },
  { additionalProperties: false },
);

export const TasksAttemptFinishParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    claimId: NonEmptyString,
    attemptId: NonEmptyString,
    agentId: NonEmptyString,
    leaseToken: NonEmptyString,
    summary: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    commandOutcome: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    testOutcome: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    changedFiles: Type.Optional(Type.Array(Type.String())),
    metrics: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export const TasksAttemptFinishResultSchema = Type.Object(
  {
    task: TaskSchema,
    claim: TaskClaimSchema,
    attempt: TaskAttemptSchema,
  },
  { additionalProperties: false },
);

export const TasksAttemptFailParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    claimId: NonEmptyString,
    attemptId: NonEmptyString,
    agentId: NonEmptyString,
    leaseToken: NonEmptyString,
    errorText: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    summary: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    notes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    commandOutcome: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    testOutcome: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    changedFiles: Type.Optional(Type.Array(Type.String())),
    metrics: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export const TasksAttemptFailResultSchema = Type.Object(
  {
    task: TaskSchema,
    claim: TaskClaimSchema,
    attempt: TaskAttemptSchema,
    retryEligible: Type.Boolean(),
    remainingAttempts: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TasksRequeueParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    assignedAgentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);

export const TasksRequeueResultSchema = Type.Object(
  {
    task: TaskSchema,
    previousStatus: TaskStatusSchema,
  },
  { additionalProperties: false },
);

export const TasksAttemptsListParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  },
  { additionalProperties: false },
);

export const TasksAttemptsListResultSchema = Type.Object(
  {
    attempts: Type.Array(TaskAttemptSchema),
  },
  { additionalProperties: false },
);

export const TasksForceFailActiveParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    reason: NonEmptyString,
    actor: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TasksForceFailActiveResultSchema = Type.Object(
  {
    task: TaskSchema,
    claim: TaskClaimSchema,
    attempt: TaskAttemptSchema,
    retryEligible: Type.Boolean(),
    remainingAttempts: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TasksDecomposePlanChildSchema = Type.Object(
  {
    localId: NonEmptyString,
    title: NonEmptyString,
    description: NonEmptyString,
    type: TaskTypeSchema,
    priority: TaskPrioritySchema,
    dependsOnLocalIds: Type.Array(NonEmptyString),
    tags: Type.Optional(Type.Array(Type.String())),
    relevantPaths: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

export const TasksDecomposeParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    force: Type.Optional(Type.Boolean()),
    requestedBy: Type.Optional(Type.String()),
    plan: Type.Optional(
      Type.Object(
        {
          summary: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          children: Type.Array(TasksDecomposePlanChildSchema, { minItems: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const TasksDecomposeResultSchema = Type.Object(
  {
    parentTask: TaskSchema,
    children: Type.Array(TaskSchema),
    decompositionRun: TaskDecompositionRunSchema,
    deduped: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const TasksReviewListPendingParamsSchema = Type.Object(
  {
    teamId: Type.Optional(NonEmptyString),
    projectId: Type.Optional(NonEmptyString),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  },
  { additionalProperties: false },
);

export const TasksPendingReviewItemSchema = Type.Object(
  {
    review: TaskReviewSchema,
    task: TaskSchema,
  },
  { additionalProperties: false },
);

export const TasksReviewListPendingResultSchema = Type.Object(
  {
    items: Type.Array(TasksPendingReviewItemSchema),
  },
  { additionalProperties: false },
);

export const TasksReviewDecideParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
    actor: NonEmptyString,
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const TasksReviewDecideResultSchema = Type.Object(
  {
    task: TaskSchema,
    review: TaskReviewSchema,
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

export const TasksClaimedEventSchema = Type.Object(
  {
    reason: Type.Literal("claimed"),
    task: TaskSchema,
    claim: TaskClaimSchema,
  },
  { additionalProperties: false },
);

export const TasksAttemptChangedEventSchema = Type.Object(
  {
    taskId: NonEmptyString,
    reason: Type.Union([
      Type.Literal("started"),
      Type.Literal("finished"),
      Type.Literal("failed"),
      Type.Literal("requeued"),
    ]),
    attempt: TaskAttemptSchema,
  },
  { additionalProperties: false },
);

export const TaskWorkerStateSchema = Type.Union([
  Type.Literal("idle"),
  Type.Literal("claiming"),
  Type.Literal("running"),
  Type.Literal("recovering"),
  Type.Literal("paused"),
  Type.Literal("unhealthy"),
]);

export const TaskWorkerStatusSchema = Type.Object(
  {
    agentId: NonEmptyString,
    teamIds: Type.Array(NonEmptyString),
    state: TaskWorkerStateSchema,
    currentTaskId: Type.Union([Type.String(), Type.Null()]),
    lastHeartbeatAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    errorStreak: Type.Integer({ minimum: 0 }),
    lastError: Type.Union([Type.String(), Type.Null()]),
    updatedAtMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TasksWorkerChangedEventSchema = Type.Object(
  {
    reason: Type.Union([Type.Literal("started"), Type.Literal("status"), Type.Literal("stopped")]),
    worker: TaskWorkerStatusSchema,
  },
  { additionalProperties: false },
);

export const TasksRuntimeStatusParamsSchema = Type.Object({}, { additionalProperties: false });

export const TasksRuntimeAgentControlParamsSchema = Type.Object(
  {
    agentId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const TasksRuntimeAgentControlResultSchema = Type.Object(
  {
    worker: Type.Union([TaskWorkerStatusSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const TaskLeadStateSchema = Type.Union([
  Type.Literal("idle"),
  Type.Literal("processing"),
  Type.Literal("delegating"),
  Type.Literal("waiting"),
  Type.Literal("paused"),
]);

export const TaskLeadStatusSchema = Type.Object(
  {
    teamId: NonEmptyString,
    teamName: NonEmptyString,
    leadAgentId: NonEmptyString,
    state: TaskLeadStateSchema,
    lastError: Type.Union([Type.String(), Type.Null()]),
    lastPolledAtMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    waitingQuestionCount: Type.Integer({ minimum: 0 }),
    updatedAtMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TasksLeadChangedEventSchema = Type.Object(
  {
    reason: Type.Union([
      Type.Literal("started"),
      Type.Literal("status"),
      Type.Literal("stopped"),
      Type.Literal("delegated"),
      Type.Literal("escalated"),
    ]),
    lead: TaskLeadStatusSchema,
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export const TasksEscalatedEventSchema = Type.Object(
  {
    teamId: NonEmptyString,
    leadAgentId: NonEmptyString,
    threadId: NonEmptyString,
    taskId: Type.Union([Type.String(), Type.Null()]),
    requesterAgentId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const TasksDecompositionChangedEventSchema = Type.Object(
  {
    reason: Type.Union([Type.Literal("created"), Type.Literal("updated")]),
    parentTask: TaskSchema,
    children: Type.Array(TaskSchema),
    decompositionRun: TaskDecompositionRunSchema,
    deduped: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TasksReviewChangedEventSchema = Type.Object(
  {
    reason: Type.Union([
      Type.Literal("pending_lead"),
      Type.Literal("pending_human"),
      Type.Literal("approved"),
      Type.Literal("rejected"),
      Type.Literal("blocked"),
    ]),
    task: TaskSchema,
    review: TaskReviewSchema,
  },
  { additionalProperties: false },
);

export const TasksReviewPendingEventSchema = Type.Object(
  {
    reason: Type.Literal("pending_human"),
    task: TaskSchema,
    review: TaskReviewSchema,
  },
  { additionalProperties: false },
);

export const TaskRuntimeTeamSchema = Type.Object(
  {
    teamId: NonEmptyString,
    teamName: NonEmptyString,
    leadAgentId: Type.Union([Type.String(), Type.Null()]),
    memberAgentIds: Type.Array(NonEmptyString),
  },
  { additionalProperties: false },
);

export const TasksRuntimeStatusResultSchema = Type.Object(
  {
    workers: Type.Array(TaskWorkerStatusSchema),
    leads: Type.Array(TaskLeadStatusSchema),
    teams: Type.Array(TaskRuntimeTeamSchema),
    updatedAtMs: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
