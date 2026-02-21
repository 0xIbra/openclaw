export type TaskType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "review"
  | "research"
  | "devops";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskComplexity = "trivial" | "small" | "medium" | "large" | "epic";
export type TaskStatus =
  | "created"
  | "backlog"
  | "assigned"
  | "running"
  | "review"
  | "blocked"
  | "failed"
  | "done";

export type TaskDto = {
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
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs: number | null;
  completedAtMs: number | null;
};

export type TaskAttemptDto = {
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

export type TaskDecompositionRunStatus = "planned" | "applied" | "failed" | "superseded";

export type TaskDecompositionRunDto = {
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

export type TaskReviewStatus =
  | "pending_lead"
  | "pending_human"
  | "approved"
  | "rejected"
  | "blocked";

export type TaskReviewDto = {
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

export type TaskPendingReviewItemDto = {
  review: TaskReviewDto;
  task: TaskDto;
};
