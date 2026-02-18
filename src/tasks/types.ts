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

export type TaskType = (typeof TASK_TYPE_VALUES)[number];
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];
export type TaskComplexity = (typeof TASK_COMPLEXITY_VALUES)[number];
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];
export type TaskBoardStatus = (typeof TASK_BOARD_STATUS_VALUES)[number];
export type TeamMemberRole = (typeof TEAM_MEMBER_ROLE_VALUES)[number];
export type TaskClaimState = (typeof TASK_CLAIM_STATE_VALUES)[number];

export type TaskCreatedBy = string;

export type ProjectRecord = {
  id: string;
  name: string;
  description?: string;
  repoRoot?: string;
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
};

export type ProjectUpdateInput = {
  id: string;
  name?: string;
  description?: string;
  repoRoot?: string;
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

export type TaskCreateInput = {
  projectId: string;
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
