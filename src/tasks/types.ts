export const TASK_TYPE_VALUES = [
  "feature",
  "bugfix",
  "refactor",
  "test",
  "review",
  "research",
  "devops",
] as const;

export const TASK_PRIORITY_VALUES = ["critical", "high", "medium", "low"] as const;

export const TASK_COMPLEXITY_VALUES = ["trivial", "small", "medium", "large", "epic"] as const;

export const TASK_STATUS_VALUES = [
  "created",
  "backlog",
  "assigned",
  "running",
  "review",
  "blocked",
  "failed",
  "done",
] as const;

export const TASK_BOARD_STATUS_VALUES = [
  "backlog",
  "assigned",
  "running",
  "review",
  "blocked",
  "failed",
  "done",
] as const;

export const TEAM_MEMBER_ROLE_VALUES = ["lead", "member"] as const;
export const TASK_CLAIM_STATE_VALUES = ["active", "released", "expired"] as const;
export const BUS_MESSAGE_STATE_VALUES = [
  "pending",
  "leased",
  "acked",
  "expired",
  "dead_letter",
] as const;
export const TASK_QUESTION_THREAD_STATUS_VALUES = ["open", "answered", "escalated"] as const;
export const TASK_DECOMPOSITION_RUN_STATUS_VALUES = [
  "planned",
  "applied",
  "failed",
  "superseded",
] as const;
export const TASK_REVIEW_STATUS_VALUES = [
  "pending_lead",
  "pending_human",
  "approved",
  "rejected",
  "blocked",
] as const;

export type TaskType = (typeof TASK_TYPE_VALUES)[number];
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];
export type TaskComplexity = (typeof TASK_COMPLEXITY_VALUES)[number];
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];
export type TaskBoardStatus = (typeof TASK_BOARD_STATUS_VALUES)[number];
export type TeamMemberRole = (typeof TEAM_MEMBER_ROLE_VALUES)[number];
export type TaskClaimState = (typeof TASK_CLAIM_STATE_VALUES)[number];
export type BusMessageState = (typeof BUS_MESSAGE_STATE_VALUES)[number];
export type TaskQuestionThreadStatus = (typeof TASK_QUESTION_THREAD_STATUS_VALUES)[number];
export type TaskDecompositionRunStatus = (typeof TASK_DECOMPOSITION_RUN_STATUS_VALUES)[number];
export type TaskReviewStatus = (typeof TASK_REVIEW_STATUS_VALUES)[number];

export type TaskCreatedBy = string;

export type ProjectRecord = {
  id: string;
  name: string;
  description?: string;
  repoRoot?: string;
  buildCmd?: string | null;
  testCmd?: string | null;
  lintCmd?: string | null;
  language?: string | null;
  framework?: string | null;
  indexedAtMs?: number | null;
  indexStatus?: "pending" | "indexing" | "indexed" | "failed" | null;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

export type TeamRecord = {
  id: string;
  name: string;
  description?: string;
  leadAgentId: string | null;
  settings: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

export type TeamMemberRecord = {
  teamId: string;
  agentId: string;
  role: TeamMemberRole;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ProjectRepoRecord = {
  id: string;
  projectId: string;
  repoKey: string;
  role: string;
  repoRoot: string;
  isPrimary: boolean;
  branchPrefix: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type TaskClaimRecord = {
  id: string;
  taskId: string;
  agentId: string;
  teamId: string | null;
  leaseToken: string;
  state: TaskClaimState;
  leasedAtMs: number;
  heartbeatAtMs: number;
  leaseExpiresAtMs: number;
  releasedAtMs: number | null;
};

export type TaskAttemptRecord = {
  id: string;
  taskId: string;
  status: string;
  startedAtMs: number;
  endedAtMs: number | null;
  agentId: string | null;
  notes: string | null;
  attemptNumber: number | null;
  claimId: string | null;
  teamId: string | null;
  sessionBackend: string | null;
  sessionId: string | null;
  summary: string | null;
  errorText: string | null;
  commandOutcome: Record<string, unknown>;
  testOutcome: Record<string, unknown>;
  changedFiles: string[];
  metrics: Record<string, unknown>;
  createdAtMs: number | null;
  updatedAtMs: number | null;
};

export type TaskRecord = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  complexity: TaskComplexity | null;
  status: TaskStatus;
  parentTaskId: string | null;
  dependsOnTaskIds: string[];
  blockedByTaskIds: string[];
  assignedAgentId: string | null;
  teamId: string | null;
  currentAttemptId: string | null;
  maxAttempts: number;
  attemptCount: number;
  relevantPaths: string[];
  tags: string[];
  createdBy: TaskCreatedBy;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs: number | null;
  completedAtMs: number | null;
};

export type ProjectCreateInput = {
  name: string;
  description?: string;
  repoRoot?: string;
  buildCmd?: string | null;
  testCmd?: string | null;
  lintCmd?: string | null;
  language?: string | null;
  framework?: string | null;
};

export type ProjectUpdateInput = {
  id: string;
  name?: string;
  description?: string;
  repoRoot?: string;
  buildCmd?: string | null;
  testCmd?: string | null;
  lintCmd?: string | null;
  language?: string | null;
  framework?: string | null;
  indexStatus?: "pending" | "indexing" | "indexed" | "failed" | null;
};

export type TeamCreateInput = {
  name: string;
  description?: string;
  leadAgentId?: string;
  settings?: Record<string, unknown>;
};

export type TeamUpdateInput = {
  id: string;
  name?: string;
  description?: string;
  leadAgentId?: string | null;
  settings?: Record<string, unknown>;
};

export type TeamListFilters = {
  includeArchived?: boolean;
};

export type TeamMemberUpsertInput = {
  teamId: string;
  agentId: string;
  role: TeamMemberRole;
};

export type ProjectRepoUpsertInput = {
  id?: string;
  projectId: string;
  repoKey: string;
  role: string;
  repoRoot: string;
  isPrimary?: boolean;
  branchPrefix?: string | null;
};

export type TaskAttemptCreateInput = {
  taskId: string;
  status: string;
  startedAtMs?: number;
  endedAtMs?: number | null;
  agentId?: string | null;
  notes?: string | null;
  attemptNumber?: number | null;
  claimId?: string | null;
  teamId?: string | null;
  sessionBackend?: string | null;
  sessionId?: string | null;
  summary?: string | null;
  errorText?: string | null;
  commandOutcome?: Record<string, unknown>;
  testOutcome?: Record<string, unknown>;
  changedFiles?: string[];
  metrics?: Record<string, unknown>;
};

export type TaskAttemptUpdateInput = {
  id: string;
  status?: string;
  endedAtMs?: number | null;
  notes?: string | null;
  summary?: string | null;
  errorText?: string | null;
  commandOutcome?: Record<string, unknown>;
  testOutcome?: Record<string, unknown>;
  changedFiles?: string[];
  metrics?: Record<string, unknown>;
  sessionBackend?: string | null;
  sessionId?: string | null;
};

export type TaskClaimCreateInput = {
  taskId: string;
  agentId: string;
  teamId?: string | null;
  leaseToken: string;
  leaseDurationMs: number;
  nowMs?: number;
};

export type TaskClaimLeaseInput = {
  claimId: string;
  agentId: string;
  leaseToken: string;
  leaseDurationMs: number;
};

export type TaskClaimLeaseResult = {
  task: TaskRecord;
  claim: TaskClaimRecord;
};

export type TaskClaimNextInput = {
  agentId: string;
  teamId?: string | null;
  teamIds?: string[] | null;
  leaseDurationMs?: number;
};

export type TaskAttemptStartInput = {
  taskId: string;
  claimId: string;
  agentId: string;
  leaseToken: string;
  teamId?: string | null;
  sessionBackend?: string | null;
  sessionId?: string | null;
  summary?: string | null;
};

export type TaskAttemptStartResult = {
  task: TaskRecord;
  claim: TaskClaimRecord;
  attempt: TaskAttemptRecord;
};

export type TaskAttemptFinishInput = {
  taskId: string;
  claimId: string;
  attemptId: string;
  agentId: string;
  leaseToken: string;
  summary?: string | null;
  commandOutcome?: Record<string, unknown>;
  testOutcome?: Record<string, unknown>;
  changedFiles?: string[];
  metrics?: Record<string, unknown>;
  notes?: string | null;
};

export type TaskAttemptFinishResult = {
  task: TaskRecord;
  claim: TaskClaimRecord;
  attempt: TaskAttemptRecord;
};

export type TaskAttemptFailInput = {
  taskId: string;
  claimId: string;
  attemptId: string;
  agentId: string;
  leaseToken: string;
  errorText?: string | null;
  summary?: string | null;
  commandOutcome?: Record<string, unknown>;
  testOutcome?: Record<string, unknown>;
  changedFiles?: string[];
  metrics?: Record<string, unknown>;
  notes?: string | null;
};

export type TaskAttemptFailResult = {
  task: TaskRecord;
  claim: TaskClaimRecord;
  attempt: TaskAttemptRecord;
  retryEligible: boolean;
  remainingAttempts: number;
};

export type TaskForceFailActiveInput = {
  taskId: string;
  reason: string;
  actor: string;
};

export type TaskRequeueInput = {
  taskId: string;
  assignedAgentId?: string | null;
};

export type TaskRequeueResult = {
  task: TaskRecord;
  previousStatus: TaskStatus;
};

export type BusMessageRecord = {
  id: string;
  senderAgentId: string;
  receiverAgentId: string;
  taskId: string | null;
  correlationId: string | null;
  replyToMessageId: string | null;
  messageType: string;
  subject: string | null;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  state: BusMessageState;
  deliveryCount: number;
  maxDeliveries: number;
  createdAtMs: number;
  availableAtMs: number;
  leasedAtMs: number | null;
  leaseExpiresAtMs: number | null;
  ackedAtMs: number | null;
  expiresAtMs: number | null;
};

export type BusPublishInput = {
  senderAgentId: string;
  receiverAgentId: string;
  taskId?: string | null;
  correlationId?: string | null;
  replyToMessageId?: string | null;
  messageType: string;
  subject?: string | null;
  body: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  delayMs?: number;
  ttlMs?: number;
  maxDeliveries?: number;
};

export type BusPublishResult = {
  messageId: string;
  deduped: boolean;
};

export type BusPullInput = {
  receiverAgentId: string;
  maxMessages?: number;
  visibilityTimeoutMs?: number;
};

export type BusDeliveryRecord = {
  message: BusMessageRecord;
  ackToken: string;
};

export type BusAckInput = {
  receiverAgentId: string;
  messageId: string;
  ackToken: string;
};

export type TaskQuestionThreadRecord = {
  id: string;
  teamId: string;
  taskId: string | null;
  leadAgentId: string;
  requesterAgentId: string;
  questionMessageId: string;
  status: TaskQuestionThreadStatus;
  openedAtMs: number;
  reminderDueAtMs: number;
  escalateDueAtMs: number;
  lastNotifiedAtMs: number | null;
  answerMessageId: string | null;
  resolvedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type TaskDecompositionPlan = {
  summary?: string | null;
  children: Array<{
    localId: string;
    title: string;
    description: string;
    type: TaskType;
    priority: TaskPriority;
    dependsOnLocalIds: string[];
    tags?: string[];
    relevantPaths?: string[];
  }>;
};

export type TaskDecompositionRunRecord = {
  id: string;
  parentTaskId: string;
  teamId: string | null;
  leadAgentId: string;
  status: TaskDecompositionRunStatus;
  plannerBackend: string | null;
  plannerSessionId: string | null;
  plan: Record<string, unknown>;
  childTaskIds: string[];
  errorText: string | null;
  dedupeKey: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type TaskReviewRecord = {
  id: string;
  taskId: string;
  teamId: string | null;
  leadAgentId: string;
  status: TaskReviewStatus;
  requireHumanApproval: boolean;
  autoApproveOnClean: boolean;
  decisionActor: string | null;
  decisionReason: string | null;
  verdict: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  resolvedAtMs: number | null;
};

export type TaskQuestionThreadOpenInput = {
  teamId: string;
  taskId?: string | null;
  leadAgentId: string;
  requesterAgentId: string;
  questionMessageId: string;
  openedAtMs: number;
  reminderDueAtMs: number;
  escalateDueAtMs: number;
};

export type LeadDelegationDecision = {
  teamId: string | null;
  taskId: string;
  assignedAgentId: string;
  reason: string;
};

export type LeadEscalationRecord = {
  threadId: string;
  teamId: string;
  taskId: string | null;
  leadAgentId: string;
  requesterAgentId: string;
  questionMessageId: string;
  escalatedAtMs: number;
};

export type TaskDecomposeInput = {
  parentTaskId: string;
  teamId?: string | null;
  leadAgentId: string;
  requestedBy?: string | null;
  force?: boolean;
  plannerBackend?: string | null;
  plannerSessionId?: string | null;
  dedupeKey?: string | null;
  plan: TaskDecompositionPlan;
};

export type TaskDecomposeResult = {
  parentTask: TaskRecord;
  children: TaskRecord[];
  decompositionRun: TaskDecompositionRunRecord;
  deduped: boolean;
};

export type TaskPendingReviewRecord = {
  review: TaskReviewRecord;
  task: TaskRecord;
};

export type TaskReviewListFilters = {
  teamId?: string;
  projectId?: string;
  limit?: number;
};

export type TaskReviewCreateOrUpdateInput = {
  taskId: string;
  teamId?: string | null;
  leadAgentId: string;
  status: TaskReviewStatus;
  requireHumanApproval: boolean;
  autoApproveOnClean: boolean;
  decisionActor?: string | null;
  decisionReason?: string | null;
  verdict?: Record<string, unknown>;
  resolvedAtMs?: number | null;
};

export type TaskReviewDecideInput = {
  taskId: string;
  decision: "approve" | "reject";
  actor: string;
  reason?: string | null;
};

export type TaskReviewDecideResult = {
  task: TaskRecord;
  review: TaskReviewRecord;
};

export type TaskCreateInput = {
  projectId: string;
  teamId?: string | null;
  title: string;
  description: string;
  type: TaskType;
  priority?: TaskPriority;
  complexity?: TaskComplexity;
  status?: TaskStatus;
  parentTaskId?: string;
  dependsOnTaskIds?: string[];
  assignedAgentId?: string;
  maxAttempts?: number;
  relevantPaths?: string[];
  tags?: string[];
  createdBy?: TaskCreatedBy;
};

export type TaskUpdateInput = {
  id: string;
  teamId?: string | null;
  title?: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  complexity?: TaskComplexity | null;
  parentTaskId?: string | null;
  dependsOnTaskIds?: string[];
  assignedAgentId?: string | null;
  maxAttempts?: number;
  relevantPaths?: string[];
  tags?: string[];
};

export type TaskTransitionInput = {
  id: string;
  toStatus: TaskStatus;
  assignedAgentId?: string;
};

export type TaskListFilters = {
  projectId?: string;
  status?: TaskStatus;
  assignedAgentId?: string;
  type?: TaskType;
  priority?: TaskPriority;
  tag?: string;
  query?: string;
  limit?: number;
  includeArchivedProjects?: boolean;
};

export type ProjectListFilters = {
  includeArchived?: boolean;
};

export function normalizeTaskBoardStatus(status: TaskStatus): TaskBoardStatus {
  return status === "created" ? "backlog" : status;
}
