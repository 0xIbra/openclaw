import type {
  ProjectCreateInput,
  ProjectListFilters,
  ProjectRecord,
  ProjectUpdateInput,
  TaskCreateInput,
  TaskListFilters,
  TaskRecord,
  TaskTransitionInput,
  TaskUpdateInput,
} from "./types.js";
import { validateTaskTransition } from "./lifecycle.js";
import { createTaskStore, type TaskStore } from "./store.js";

const DEPENDENCY_GUARDED_STATUSES = new Set<TaskRecord["status"]>([
  "assigned",
  "running",
  "review",
  "done",
]);
const ASSIGNEE_GUARDED_STATUSES = new Set<TaskRecord["status"]>(["assigned", "running"]);

export type TaskServiceErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "invalid_transition";

export class TaskServiceError extends Error {
  constructor(
    readonly code: TaskServiceErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "TaskServiceError";
  }
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalNullableString(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      continue;
    }
    deduped.add(trimmed);
  }
  return [...deduped];
}

function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TaskServiceError("invalid_input", `${fieldName} is required`);
  }
  return trimmed;
}

export class TaskService {
  constructor(
    private readonly store: TaskStore,
    private readonly now: () => number,
  ) {}

  close() {
    this.store.close();
  }

  listProjects(filters?: ProjectListFilters): ProjectRecord[] {
    return this.store.listProjects(filters);
  }

  createProject(input: ProjectCreateInput): ProjectRecord {
    const name = requireNonEmpty(input.name, "project name");
    const existing = this.store.getActiveProjectByName(name);
    if (existing) {
      throw new TaskServiceError("conflict", `project '${name}' already exists (${existing.id})`);
    }

    return this.store.createProject(
      {
        name,
        description: normalizeOptionalString(input.description),
        repoRoot: normalizeOptionalString(input.repoRoot),
      },
      this.now(),
    );
  }

  getProject(id: string): ProjectRecord | null {
    return this.store.getProject(id);
  }

  updateProject(input: ProjectUpdateInput): ProjectRecord {
    const existing = this.store.getProject(input.id);
    if (!existing) {
      throw new TaskServiceError("not_found", `project not found: ${input.id}`);
    }

    const nextName = input.name ? requireNonEmpty(input.name, "project name") : undefined;
    if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
      const conflict = this.store.getActiveProjectByName(nextName);
      if (conflict && conflict.id !== existing.id) {
        throw new TaskServiceError(
          "conflict",
          `project '${nextName}' already exists (${conflict.id})`,
        );
      }
    }

    const updated = this.store.updateProject(
      {
        id: input.id,
        name: nextName,
        description: normalizeOptionalString(input.description),
        repoRoot: normalizeOptionalString(input.repoRoot),
      },
      this.now(),
    );

    if (!updated) {
      throw new TaskServiceError("not_found", `project not found: ${input.id}`);
    }
    return updated;
  }

  archiveProject(id: string): ProjectRecord {
    const existing = this.store.getProject(id);
    if (!existing) {
      throw new TaskServiceError("not_found", `project not found: ${id}`);
    }
    const archived = this.store.archiveProject(id, this.now());
    if (!archived) {
      throw new TaskServiceError("not_found", `project not found: ${id}`);
    }
    return archived;
  }

  listTasks(filters?: TaskListFilters): TaskRecord[] {
    return this.store.listTasks(filters);
  }

  getTask(id: string): TaskRecord | null {
    return this.store.getTask(id);
  }

  createTask(input: TaskCreateInput): TaskRecord {
    const project = this.store.getProject(input.projectId);
    if (!project) {
      throw new TaskServiceError("not_found", `project not found: ${input.projectId}`);
    }
    if (project.archivedAtMs != null) {
      throw new TaskServiceError("invalid_input", `project is archived: ${input.projectId}`);
    }

    const title = requireNonEmpty(input.title, "task title");
    const description = requireNonEmpty(input.description, "task description");
    const parentTaskId = normalizeOptionalString(input.parentTaskId);
    const dependsOnTaskIds = normalizeStringArray(input.dependsOnTaskIds);

    if (input.status && input.status !== "created" && input.status !== "backlog") {
      throw new TaskServiceError(
        "invalid_input",
        `tasks.create currently supports status 'created' or 'backlog' only (received '${input.status}')`,
      );
    }

    if (parentTaskId) {
      const parentTask = this.store.getTask(parentTaskId);
      if (!parentTask) {
        throw new TaskServiceError("not_found", `parent task not found: ${parentTaskId}`);
      }
      if (parentTask.projectId !== input.projectId) {
        throw new TaskServiceError(
          "invalid_input",
          `parent task '${parentTaskId}' must belong to project '${input.projectId}'`,
        );
      }
    }

    for (const dependencyTaskId of dependsOnTaskIds) {
      const dependencyTask = this.store.getTask(dependencyTaskId);
      if (!dependencyTask) {
        throw new TaskServiceError("not_found", `dependency task not found: ${dependencyTaskId}`);
      }
      if (dependencyTask.projectId !== input.projectId) {
        throw new TaskServiceError(
          "invalid_input",
          `dependency task '${dependencyTaskId}' must belong to project '${input.projectId}'`,
        );
      }
    }

    const maxAttempts = input.maxAttempts == null ? 3 : Math.floor(input.maxAttempts);
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1) {
      throw new TaskServiceError("invalid_input", "maxAttempts must be a positive integer");
    }

    return this.store.createTask(
      {
        ...input,
        title,
        description,
        parentTaskId,
        dependsOnTaskIds,
        assignedAgentId: normalizeOptionalString(input.assignedAgentId),
        maxAttempts,
        relevantPaths: normalizeStringArray(input.relevantPaths),
        tags: normalizeStringArray(input.tags),
      },
      this.now(),
    );
  }

  updateTask(input: TaskUpdateInput): TaskRecord {
    const existing = this.store.getTask(input.id);
    if (!existing) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }

    const nextAssignedAgentId =
      normalizeOptionalNullableString(input.assignedAgentId) ?? existing.assignedAgentId;
    if (ASSIGNEE_GUARDED_STATUSES.has(existing.status) && !nextAssignedAgentId) {
      throw new TaskServiceError(
        "invalid_input",
        `status '${existing.status}' requires assignedAgentId`,
      );
    }

    const dependsOnTaskIds =
      input.dependsOnTaskIds === undefined
        ? existing.dependsOnTaskIds
        : normalizeStringArray(input.dependsOnTaskIds);

    for (const dependencyTaskId of dependsOnTaskIds) {
      if (dependencyTaskId === existing.id) {
        throw new TaskServiceError("invalid_input", "task cannot depend on itself");
      }
      const dependencyTask = this.store.getTask(dependencyTaskId);
      if (!dependencyTask) {
        throw new TaskServiceError("not_found", `dependency task not found: ${dependencyTaskId}`);
      }
      if (dependencyTask.projectId !== existing.projectId) {
        throw new TaskServiceError(
          "invalid_input",
          `dependency task '${dependencyTaskId}' must belong to project '${existing.projectId}'`,
        );
      }
      if (DEPENDENCY_GUARDED_STATUSES.has(existing.status) && dependencyTask.status !== "done") {
        throw new TaskServiceError(
          "invalid_input",
          `status '${existing.status}' requires all dependencies to be done`,
        );
      }
    }

    const maxAttempts =
      input.maxAttempts === undefined ? existing.maxAttempts : Math.floor(input.maxAttempts);
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1) {
      throw new TaskServiceError("invalid_input", "maxAttempts must be a positive integer");
    }

    const nowMs = this.now();
    const updated = this.store.updateTask(input.id, {
      title: input.title ? requireNonEmpty(input.title, "task title") : undefined,
      description: input.description
        ? requireNonEmpty(input.description, "task description")
        : undefined,
      type: input.type,
      priority: input.priority,
      complexity: input.complexity === undefined ? undefined : input.complexity,
      parent_task_id: normalizeOptionalNullableString(input.parentTaskId),
      assigned_agent_id:
        input.assignedAgentId === undefined
          ? undefined
          : normalizeOptionalNullableString(input.assignedAgentId),
      max_attempts: maxAttempts,
      relevant_paths_json:
        input.relevantPaths === undefined
          ? undefined
          : JSON.stringify(normalizeStringArray(input.relevantPaths)),
      tags_json:
        input.tags === undefined ? undefined : JSON.stringify(normalizeStringArray(input.tags)),
      updated_at_ms: nowMs,
    });

    if (input.dependsOnTaskIds !== undefined) {
      this.store.replaceTaskDependencies(input.id, dependsOnTaskIds);
    }

    if (!updated) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }

    return updated;
  }

  transitionTask(input: TaskTransitionInput): TaskRecord {
    const existing = this.store.getTask(input.id);
    if (!existing) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }

    const requestedAssignee = normalizeOptionalString(input.assignedAgentId);
    const nextAssignedAgentId = requestedAssignee ?? existing.assignedAgentId;
    const hasIncompleteDependencies = this.store.countIncompleteDependencies(existing.id) > 0;

    const transitionValidation = validateTaskTransition({
      fromStatus: existing.status,
      toStatus: input.toStatus,
      assignedAgentId: nextAssignedAgentId,
      hasIncompleteDependencies,
    });

    if (!transitionValidation.ok) {
      throw new TaskServiceError("invalid_transition", transitionValidation.message, {
        reason: transitionValidation.reason,
      });
    }

    const nowMs = this.now();
    const startedAtMs =
      input.toStatus === "running" && existing.startedAtMs == null ? nowMs : existing.startedAtMs;
    const completedAtMs = input.toStatus === "done" ? (existing.completedAtMs ?? nowMs) : null;

    const updated = this.store.updateTask(existing.id, {
      status: input.toStatus,
      assigned_agent_id: nextAssignedAgentId,
      updated_at_ms: nowMs,
      started_at_ms: startedAtMs,
      completed_at_ms: completedAtMs,
    });

    if (!updated) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }
    return updated;
  }
}

export function createTaskService(params?: {
  dbPath?: string;
  store?: TaskStore;
  now?: () => number;
}): TaskService {
  const store = params?.store ?? createTaskStore({ dbPath: params?.dbPath });
  return new TaskService(store, params?.now ?? (() => Date.now()));
}
