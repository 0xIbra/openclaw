import type { GatewayBrowserClient } from "../gateway.ts";
import type { TaskDto, TaskPriority, TaskStatus, TaskType } from "../types.ts";

export type TasksState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  boardLoading: boolean;
  boardBusy: boolean;
  boardError: string | null;
  boardTasks: TaskDto[];
  boardSelectedProjectId: string | null;
  boardFilterAssignee: string;
  boardFilterType: "" | TaskType;
  boardFilterPriority: "" | TaskPriority;
  boardFilterTag: string;
  boardFilterQuery: string;
};

export function normalizeBoardStatus(status: TaskStatus): Exclude<TaskStatus, "created"> {
  return status === "created" ? "backlog" : status;
}

export async function loadTasks(state: TasksState) {
  if (!state.client || !state.connected || !state.boardSelectedProjectId) {
    state.boardTasks = [];
    return;
  }
  state.boardLoading = true;
  state.boardError = null;
  try {
    const res = await state.client.request<{ tasks?: TaskDto[] }>("tasks.list", {
      projectId: state.boardSelectedProjectId,
      assignedAgentId: state.boardFilterAssignee.trim() || undefined,
      type: state.boardFilterType || undefined,
      priority: state.boardFilterPriority || undefined,
      tag: state.boardFilterTag.trim() || undefined,
      query: state.boardFilterQuery.trim() || undefined,
      limit: 500,
    });
    state.boardTasks = Array.isArray(res.tasks) ? res.tasks : [];
  } catch (err) {
    state.boardError = String(err);
  } finally {
    state.boardLoading = false;
  }
}

export async function createTask(
  state: TasksState,
  input: {
    projectId: string;
    title: string;
    description: string;
    type: TaskType;
    priority?: TaskPriority;
    assignedAgentId?: string;
    tags?: string[];
  },
) {
  if (!state.client || !state.connected) {
    return null;
  }
  const created = await state.client.request<{ task?: TaskDto }>("tasks.create", {
    projectId: input.projectId,
    title: input.title.trim(),
    description: input.description.trim(),
    type: input.type,
    priority: input.priority,
    assignedAgentId: input.assignedAgentId?.trim() || undefined,
    tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
  });
  const task = created.task;
  if (task) {
    state.boardTasks = [task, ...state.boardTasks.filter((entry) => entry.id !== task.id)];
  }
  return task ?? null;
}

export async function updateTask(
  state: TasksState,
  input: {
    id: string;
    title?: string;
    description?: string;
    type?: TaskType;
    priority?: TaskPriority;
    assignedAgentId?: string | null;
    tags?: string[];
  },
) {
  if (!state.client || !state.connected) {
    return null;
  }
  const updated = await state.client.request<{ task?: TaskDto }>("tasks.update", {
    id: input.id,
    title: input.title,
    description: input.description,
    type: input.type,
    priority: input.priority,
    assignedAgentId: input.assignedAgentId,
    tags: input.tags,
  });
  const task = updated.task;
  if (task) {
    patchTaskInList(state, task);
  }
  return task ?? null;
}

export async function transitionTaskOptimistic(
  state: TasksState,
  input: { id: string; toStatus: TaskStatus; assignedAgentId?: string },
) {
  if (!state.client || !state.connected || state.boardBusy) {
    return;
  }
  const idx = state.boardTasks.findIndex((task) => task.id === input.id);
  if (idx < 0) {
    return;
  }

  const before = state.boardTasks[idx];
  if (!before) {
    return;
  }

  const optimistic: TaskDto = {
    ...before,
    status: input.toStatus,
    assignedAgentId: input.assignedAgentId?.trim() || before.assignedAgentId,
    updatedAtMs: Date.now(),
  };
  const nextTasks = [...state.boardTasks];
  nextTasks[idx] = optimistic;
  state.boardTasks = nextTasks;
  state.boardBusy = true;
  state.boardError = null;

  try {
    const res = await state.client.request<{ task?: TaskDto }>("tasks.transition", {
      id: input.id,
      toStatus: input.toStatus,
      assignedAgentId: input.assignedAgentId?.trim() || undefined,
    });
    const task = res.task;
    if (task) {
      patchTaskInList(state, task);
    }
  } catch (err) {
    const rollback = [...state.boardTasks];
    rollback[idx] = before;
    state.boardTasks = rollback;
    state.boardError = String(err);
  } finally {
    state.boardBusy = false;
  }
}

export function patchTaskFromEvent(state: Pick<TasksState, "boardTasks">, payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const task = (payload as { task?: TaskDto }).task;
  if (!task || typeof task.id !== "string") {
    return;
  }
  patchTaskInList(state, task);
}

function patchTaskInList(state: Pick<TasksState, "boardTasks">, task: TaskDto) {
  const next = [...state.boardTasks];
  const index = next.findIndex((entry) => entry.id === task.id);
  if (index >= 0) {
    next[index] = task;
  } else {
    next.unshift(task);
  }
  state.boardTasks = next;
}
