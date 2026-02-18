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

export type TaskType = (typeof TASK_TYPE_VALUES)[number];
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];
export type TaskComplexity = (typeof TASK_COMPLEXITY_VALUES)[number];
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];
export type TaskBoardStatus = (typeof TASK_BOARD_STATUS_VALUES)[number];

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
