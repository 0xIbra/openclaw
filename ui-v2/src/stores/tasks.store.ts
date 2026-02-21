import { create } from "zustand";
import type {
  TaskDto,
  TaskAttemptDto,
  TaskDecompositionRunDto,
  TaskReviewDto,
  TaskStatus,
} from "@/types";
import { registerGatewayEventHandler } from "./gateway.store";

type TaskFilters = {
  projectId: string | null;
  search: string;
  priority: string | null;
  type: string | null;
};

type TasksState = {
  tasks: TaskDto[];
  attempts: Record<string, TaskAttemptDto[]>; // taskId → attempts
  decompositions: Record<string, TaskDecompositionRunDto[]>; // taskId → decompositions
  reviews: Record<string, TaskReviewDto>; // taskId → latest review
  filters: TaskFilters;
  loading: boolean;
  // Actions
  load: (projectId?: string) => Promise<void>;
  loadTaskDetail: (taskId: string) => Promise<void>;
  setFilter: (patch: Partial<TaskFilters>) => void;
  approveReview: (taskId: string, reviewId: string, reason?: string) => Promise<void>;
  rejectReview: (taskId: string, reviewId: string, reason?: string) => Promise<void>;
  moveTask: (taskId: string, status: TaskStatus) => Promise<void>;
  createTask: (params: {
    projectId: string;
    title: string;
    description: string;
    type: string;
    priority: string;
    teamId?: string;
  }) => Promise<TaskDto>;
};

function patchTask(tasks: TaskDto[], patch: Partial<TaskDto> & { id: string }): TaskDto[] {
  const idx = tasks.findIndex((t) => t.id === patch.id);
  if (idx === -1) {
    return tasks;
  }
  const updated = [...tasks];
  updated[idx] = { ...updated[idx], ...patch };
  return updated;
}

function upsertTask(tasks: TaskDto[], task: TaskDto): TaskDto[] {
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx === -1) {
    return [...tasks, task];
  }
  const updated = [...tasks];
  updated[idx] = task;
  return updated;
}

export const useTasksStore = create<TasksState>((set, get) => {
  registerGatewayEventHandler((evt) => {
    // tasks.changed: { reason, task }
    if (evt.event === "tasks.changed") {
      const payload = evt.payload as { reason?: string; task?: TaskDto } | undefined;
      if (payload?.task) {
        set((s) => ({ tasks: upsertTask(s.tasks, payload.task!) }));
      }
    }
    // tasks.claimed: { reason, task, claim }
    if (evt.event === "tasks.claimed") {
      const payload = evt.payload as { reason?: string; task?: TaskDto } | undefined;
      if (payload?.task) {
        set((s) => ({ tasks: upsertTask(s.tasks, payload.task!) }));
      }
    }
    // tasks.attempt.changed: { taskId, attempt, reason }
    if (evt.event === "tasks.attempt.changed") {
      const payload = evt.payload as
        | { taskId?: string; reason?: string; attempt?: TaskAttemptDto }
        | undefined;
      if (payload?.attempt && payload?.taskId) {
        const attempt = payload.attempt;
        const taskId = payload.taskId;
        set((s) => {
          const existing = s.attempts[taskId] ?? [];
          const idx = existing.findIndex((a) => a.id === attempt.id);
          const updated =
            idx === -1
              ? [...existing, attempt]
              : existing.map((a) => (a.id === attempt.id ? attempt : a));
          return { attempts: { ...s.attempts, [taskId]: updated } };
        });
      }
    }
    // tasks.review.changed / tasks.review.pending: { reason, task, review }
    if (evt.event === "tasks.review.changed" || evt.event === "tasks.review.pending") {
      const payload = evt.payload as
        | { reason?: string; task?: TaskDto; review?: TaskReviewDto }
        | undefined;
      if (payload?.review) {
        const review = payload.review;
        set((s) => ({ reviews: { ...s.reviews, [review.taskId]: review } }));
      }
      if (payload?.task) {
        set((s) => ({ tasks: upsertTask(s.tasks, payload.task!) }));
      }
    }
    // tasks.decomposition.changed: { reason, parentTask, children, decompositionRun, deduped }
    if (evt.event === "tasks.decomposition.changed") {
      const payload = evt.payload as
        | {
            reason?: string;
            parentTask?: TaskDto;
            decompositionRun?: TaskDecompositionRunDto;
            children?: TaskDto[];
          }
        | undefined;
      if (payload?.decompositionRun && payload?.parentTask) {
        const d = payload.decompositionRun;
        const parentTaskId = payload.parentTask.id;
        set((s) => {
          const existing = s.decompositions[parentTaskId] ?? [];
          const idx = existing.findIndex((x) => x.id === d.id);
          const updated =
            idx === -1 ? [...existing, d] : existing.map((x) => (x.id === d.id ? d : x));
          // Also upsert child tasks
          let tasks = s.tasks;
          if (payload.children) {
            for (const child of payload.children) {
              tasks = upsertTask(tasks, child);
            }
          }
          if (payload.parentTask) {
            tasks = upsertTask(tasks, payload.parentTask);
          }
          return { decompositions: { ...s.decompositions, [parentTaskId]: updated }, tasks };
        });
      }
    }
  });

  return {
    tasks: [],
    attempts: {},
    decompositions: {},
    reviews: {},
    filters: { projectId: null, search: "", priority: null, type: null },
    loading: false,

    load: async (projectId) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      set({ loading: true });
      try {
        const params: Record<string, unknown> = {};
        if (projectId) {
          params.projectId = projectId;
        }
        const result = await client.request<{ tasks: TaskDto[] }>("tasks.list", params);
        set({ tasks: result.tasks ?? [] });
      } catch (err) {
        console.error("[tasks] load failed:", err);
      } finally {
        set({ loading: false });
      }
    },

    loadTaskDetail: async (taskId) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      try {
        const [attemptsRes, reviewsRes] = await Promise.allSettled([
          client.request<{ attempts: TaskAttemptDto[] }>("tasks.attempts.list", { taskId }),
          client.request<{ items: Array<{ review: TaskReviewDto; task: TaskDto }> }>(
            "tasks.review.listPending",
            {},
          ),
        ]);
        if (attemptsRes.status === "fulfilled") {
          set((s) => ({ attempts: { ...s.attempts, [taskId]: attemptsRes.value.attempts ?? [] } }));
        }
        if (reviewsRes.status === "fulfilled") {
          const items = reviewsRes.value.items ?? [];
          // Find review for this specific task
          const item = items.find((i) => i.review.taskId === taskId);
          if (item) {
            set((s) => ({ reviews: { ...s.reviews, [taskId]: item.review } }));
          }
        }
      } catch (err) {
        console.error("[tasks] loadTaskDetail failed:", err);
      }
    },

    setFilter: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),

    approveReview: async (taskId, reviewId, reason) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      await client.request("tasks.review.decide", {
        taskId,
        reviewId,
        decision: "approved",
        notes: reason,
      });
    },

    rejectReview: async (taskId, reviewId, reason) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      await client.request("tasks.review.decide", {
        taskId,
        reviewId,
        decision: "rejected",
        notes: reason,
      });
    },

    moveTask: async (taskId, status) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      // Optimistic update
      set((s) => ({ tasks: patchTask(s.tasks, { id: taskId, status }) }));
      try {
        await client.request("tasks.transition", { taskId, status });
      } catch (err) {
        console.error("[tasks] moveTask failed:", err);
        // Re-fetch to revert
        await get().load();
      }
    },

    createTask: async (params) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        throw new Error("Not connected");
      }
      const result = await client.request<{ task: TaskDto }>("tasks.create", params);
      set((s) => ({ tasks: upsertTask(s.tasks, result.task) }));
      return result.task;
    },
  };
});
