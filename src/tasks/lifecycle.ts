import type { TaskStatus } from "./types.js";

const TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  created: new Set(["backlog"]),
  backlog: new Set(["assigned", "blocked", "failed"]),
  assigned: new Set(["running", "backlog", "blocked", "failed"]),
  running: new Set(["review", "blocked", "failed"]),
  review: new Set(["done", "backlog", "failed"]),
  blocked: new Set(["backlog"]),
  failed: new Set(["backlog"]),
  done: new Set(["done"]),
};

const ASSIGNEE_REQUIRED_STATUSES = new Set<TaskStatus>(["assigned", "running"]);
const DEPENDENCY_REQUIRED_STATUSES = new Set<TaskStatus>(["assigned", "running", "review", "done"]);

export type TaskTransitionValidationInput = {
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  assignedAgentId: string | null;
  hasIncompleteDependencies: boolean;
};

export type TaskTransitionValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_transition" | "assignee_required" | "dependencies_blocked";
      message: string;
    };

export function canTransitionTaskStatus(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
  return TRANSITIONS[fromStatus].has(toStatus);
}

export function validateTaskTransition(
  input: TaskTransitionValidationInput,
): TaskTransitionValidationResult {
  if (!canTransitionTaskStatus(input.fromStatus, input.toStatus)) {
    return {
      ok: false,
      reason: "invalid_transition",
      message: `invalid status transition: ${input.fromStatus} -> ${input.toStatus}`,
    };
  }

  if (
    ASSIGNEE_REQUIRED_STATUSES.has(input.toStatus) &&
    (!input.assignedAgentId || !input.assignedAgentId.trim())
  ) {
    return {
      ok: false,
      reason: "assignee_required",
      message: `status '${input.toStatus}' requires assignedAgentId`,
    };
  }

  if (DEPENDENCY_REQUIRED_STATUSES.has(input.toStatus) && input.hasIncompleteDependencies) {
    return {
      ok: false,
      reason: "dependencies_blocked",
      message: `status '${input.toStatus}' requires all dependencies to be done`,
    };
  }

  return { ok: true };
}
