import type {
  TaskRuntimeSupervisor,
  TaskRuntimeSupervisorOptions,
  TaskWorker,
  TaskWorkerEvent,
  TaskWorkerOptions,
  TaskWorkerStatus,
} from "./types.js";
import { TASK_WORKER_RECONCILE_MS } from "./defaults.js";
import { createTaskWorker } from "./worker.js";

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))].toSorted();
}

function mapActiveWorkerAgents(taskService: TaskRuntimeSupervisorOptions["taskService"]) {
  const active = new Map<string, string[]>();
  const teams = taskService.listTeams({ includeArchived: false });
  for (const team of teams) {
    const members = taskService.listTeamMembers(team.id);
    for (const member of members) {
      if (member.role !== "member") {
        continue;
      }
      const teamIds = active.get(member.agentId) ?? [];
      teamIds.push(team.id);
      active.set(member.agentId, teamIds);
    }
  }
  return new Map(
    [...active.entries()].map(([agentId, teamIds]) => [agentId, sortedUnique(teamIds)]),
  );
}

export function createTaskRuntimeSupervisor(
  options: TaskRuntimeSupervisorOptions,
): TaskRuntimeSupervisor {
  const reconcileIntervalMs = Math.max(
    1_000,
    Math.floor(options.reconcileIntervalMs ?? TASK_WORKER_RECONCILE_MS),
  );
  const createWorker =
    options.createWorker ?? ((opts: TaskWorkerOptions) => createTaskWorker(opts));
  const workers = new Map<string, TaskWorker>();
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;
  let reconcilePromise: Promise<void> | null = null;
  let reconcilePending = false;
  let stopping = false;

  const emit = (event: TaskWorkerEvent) => {
    options.onWorkerEvent?.(event);
  };

  const runReconcile = async () => {
    const active = mapActiveWorkerAgents(options.taskService);
    for (const [agentId, teamIds] of active.entries()) {
      const existing = workers.get(agentId);
      if (existing) {
        existing.setTeamIds(teamIds);
        continue;
      }
      const worker = createWorker({
        taskService: options.taskService,
        executor: options.createExecutor(agentId),
        agentId,
        teamIds,
        onEvent: emit,
      });
      workers.set(agentId, worker);
      worker.start();
      emit({ reason: "started", worker: worker.getStatus() });
    }

    const activeAgents = new Set(active.keys());
    for (const [agentId, worker] of workers.entries()) {
      if (activeAgents.has(agentId)) {
        continue;
      }
      await worker.stop();
      emit({ reason: "stopped", worker: worker.getStatus() });
      workers.delete(agentId);
    }
  };

  const reconcileWorkers = async () => {
    if (stopping) {
      return;
    }
    if (reconcilePromise) {
      reconcilePending = true;
      await reconcilePromise;
      return;
    }
    do {
      reconcilePending = false;
      reconcilePromise = runReconcile();
      try {
        await reconcilePromise;
      } finally {
        reconcilePromise = null;
      }
    } while (reconcilePending && !stopping);
  };

  return {
    start: () => {
      if (reconcileTimer) {
        return;
      }
      stopping = false;
      void reconcileWorkers();
      reconcileTimer = setInterval(() => {
        void reconcileWorkers();
      }, reconcileIntervalMs);
      reconcileTimer.unref?.();
    },
    stop: async () => {
      stopping = true;
      if (reconcileTimer) {
        clearInterval(reconcileTimer);
        reconcileTimer = null;
      }
      if (reconcilePromise) {
        await reconcilePromise;
      }
      for (const [agentId, worker] of workers.entries()) {
        await worker.stop();
        emit({ reason: "stopped", worker: worker.getStatus() });
        workers.delete(agentId);
      }
    },
    getWorkerStatuses: (): TaskWorkerStatus[] =>
      [...workers.values()].map((worker) => worker.getStatus()),
    reconcileNow: async () => {
      await reconcileWorkers();
    },
  };
}
