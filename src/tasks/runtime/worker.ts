import type {
  TaskExecutionResult,
  TaskWorker,
  TaskWorkerEvent,
  TaskWorkerEventReason,
  TaskWorkerOptions,
  TaskWorkerStatus,
} from "./types.js";
import {
  TASK_WORKER_HEARTBEAT_MS,
  TASK_WORKER_IDLE_POLL_MS,
  TASK_WORKER_LEASE_DURATION_MS,
  TASK_WORKER_MAX_BACKOFF_MS,
} from "./defaults.js";

function uniqSorted(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))].toSorted();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }
  if (signal.aborted) {
    throw new Error("aborted");
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort);
  });
}

export function createTaskWorker(options: TaskWorkerOptions): TaskWorker {
  const leaseDurationMs = Math.max(
    1,
    Math.floor(options.leaseDurationMs ?? TASK_WORKER_LEASE_DURATION_MS),
  );
  const heartbeatIntervalMs = Math.max(
    1,
    Math.floor(options.heartbeatIntervalMs ?? TASK_WORKER_HEARTBEAT_MS),
  );
  const idlePollMs = Math.max(1, Math.floor(options.idlePollMs ?? TASK_WORKER_IDLE_POLL_MS));
  const maxBackoffMs = Math.max(1, Math.floor(options.maxBackoffMs ?? TASK_WORKER_MAX_BACKOFF_MS));
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? sleepWithAbort;
  let stopController: AbortController | null = null;
  let loopPromise: Promise<void> | null = null;

  let status: TaskWorkerStatus = {
    agentId: options.agentId,
    teamIds: uniqSorted(options.teamIds ?? []),
    state: "paused",
    currentTaskId: null,
    lastHeartbeatAtMs: null,
    errorStreak: 0,
    lastError: null,
    updatedAtMs: now(),
  };

  const emit = (reason: TaskWorkerEventReason) => {
    const event: TaskWorkerEvent = {
      reason,
      worker: { ...status, teamIds: [...status.teamIds] },
    };
    options.onEvent?.(event);
  };

  const updateStatus = (
    patch: Partial<Omit<TaskWorkerStatus, "agentId" | "updatedAtMs">>,
    reason: TaskWorkerEventReason = "status",
  ) => {
    status = {
      ...status,
      ...patch,
      updatedAtMs: now(),
    };
    emit(reason);
  };

  const checkpointAttempt = (
    attemptId: string,
    summary: string,
    metrics?: Record<string, unknown>,
  ) => {
    try {
      options.taskService.updateTaskAttempt({
        id: attemptId,
        summary,
        metrics: {
          ...metrics,
          workerAgentId: options.agentId,
          checkpointAtMs: now(),
        },
      });
    } catch {
      // Best-effort checkpointing should not break execution flow.
    }
  };

  const publishLifecycleMessage = (params: {
    taskId: string;
    attemptId: string;
    teamId: string | null;
    messageType: "progress" | "task:complete" | "task:failed";
    summary: string;
    errorText?: string | null;
    metrics?: Record<string, unknown>;
    changedFiles?: string[];
  }) => {
    if (!params.teamId) {
      return;
    }
    const team = options.taskService.getTeam(params.teamId);
    const leadAgentId = team?.leadAgentId?.trim();
    if (!leadAgentId || leadAgentId === options.agentId) {
      return;
    }
    try {
      options.taskService.publishBusMessage({
        senderAgentId: options.agentId,
        receiverAgentId: leadAgentId,
        taskId: params.taskId,
        messageType: params.messageType,
        subject: params.messageType,
        body: params.summary,
        payload: {
          taskId: params.taskId,
          attemptId: params.attemptId,
          teamId: params.teamId,
          agentId: options.agentId,
          summary: params.summary,
          errorText: params.errorText ?? null,
          metrics: params.metrics ?? {},
          changedFiles: params.changedFiles ?? [],
        },
      });
    } catch {
      // bus publish is best-effort
    }
  };

  const runSingleClaim = async (
    signal: AbortSignal,
    input: ReturnType<typeof options.taskService.claimNextTask>,
  ) => {
    if (!input) {
      return;
    }
    const claimedTask = input.task;
    const claim = input.claim;
    updateStatus({
      state: "running",
      currentTaskId: claimedTask.id,
      lastHeartbeatAtMs: now(),
      lastError: null,
    });

    let started: ReturnType<typeof options.taskService.startAttempt> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let leaseLost = false;

    try {
      started = options.taskService.startAttempt({
        taskId: claimedTask.id,
        claimId: claim.id,
        agentId: options.agentId,
        leaseToken: claim.leaseToken,
        teamId: claimedTask.teamId,
        sessionBackend: "embedded",
      });
      checkpointAttempt(started.attempt.id, `Started task ${claimedTask.id}`);
      publishLifecycleMessage({
        taskId: started.task.id,
        attemptId: started.attempt.id,
        teamId: started.task.teamId,
        messageType: "progress",
        summary: `Started task ${started.task.id}`,
      });

      heartbeatTimer = setInterval(() => {
        try {
          const heartbeat = options.taskService.leaseHeartbeat({
            claimId: claim.id,
            agentId: options.agentId,
            leaseToken: claim.leaseToken,
            leaseDurationMs,
          });
          updateStatus({ lastHeartbeatAtMs: heartbeat.claim.heartbeatAtMs });
        } catch {
          leaseLost = true;
        }
      }, heartbeatIntervalMs);
      heartbeatTimer.unref?.();

      let execution: TaskExecutionResult;
      try {
        execution = await options.executor.execute({
          agentId: options.agentId,
          task: started.task,
          claim: started.claim,
          attempt: started.attempt,
          signal,
        });
      } catch (error) {
        execution = {
          status: "failed",
          summary: `Execution failed for task ${claimedTask.id}`,
          errorText: toErrorMessage(error),
          commandOutcome: {},
          testOutcome: {},
          changedFiles: [],
          metrics: {},
        };
      }

      if (leaseLost) {
        execution = {
          status: "failed",
          summary: `Execution lease lost for task ${claimedTask.id}`,
          errorText: "Claim lease heartbeat failed during execution",
          commandOutcome: execution.commandOutcome ?? {},
          testOutcome: execution.testOutcome ?? {},
          changedFiles: execution.changedFiles ?? [],
          metrics: execution.metrics ?? {},
          notes: execution.notes,
          session: execution.session,
        };
      }

      const executionSummary =
        (typeof execution.summary === "string" && execution.summary.trim()) ||
        (execution.status === "success"
          ? `Completed task ${claimedTask.id}`
          : `Execution failed for task ${claimedTask.id}`);
      checkpointAttempt(started.attempt.id, executionSummary, execution.metrics);
      const persistedMetrics = {
        ...execution.metrics,
        workerAgentId: options.agentId,
        workerCheckpointAtMs: now(),
      };

      if (execution.session?.backend || execution.session?.id) {
        try {
          options.taskService.updateTaskAttempt({
            id: started.attempt.id,
            sessionBackend: execution.session?.backend ?? null,
            sessionId: execution.session?.id ?? null,
          });
        } catch {
          // Best-effort metadata patch.
        }
      }

      if (execution.status === "success") {
        const finished = options.taskService.finishAttempt({
          taskId: started.task.id,
          claimId: claim.id,
          attemptId: started.attempt.id,
          agentId: options.agentId,
          leaseToken: claim.leaseToken,
          summary: executionSummary,
          notes: execution.notes,
          commandOutcome: execution.commandOutcome,
          testOutcome: execution.testOutcome,
          changedFiles: execution.changedFiles,
          metrics: persistedMetrics,
        });
        publishLifecycleMessage({
          taskId: finished.task.id,
          attemptId: finished.attempt.id,
          teamId: finished.task.teamId,
          messageType: "task:complete",
          summary: executionSummary,
          metrics: persistedMetrics,
          changedFiles: execution.changedFiles,
        });
      } else {
        const failed = options.taskService.failAttempt({
          taskId: started.task.id,
          claimId: claim.id,
          attemptId: started.attempt.id,
          agentId: options.agentId,
          leaseToken: claim.leaseToken,
          errorText: execution.errorText,
          summary: executionSummary,
          notes: execution.notes,
          commandOutcome: execution.commandOutcome,
          testOutcome: execution.testOutcome,
          changedFiles: execution.changedFiles,
          metrics: persistedMetrics,
        });
        publishLifecycleMessage({
          taskId: failed.task.id,
          attemptId: failed.attempt.id,
          teamId: failed.task.teamId,
          messageType: "task:failed",
          summary: executionSummary,
          errorText: execution.errorText,
          metrics: persistedMetrics,
          changedFiles: execution.changedFiles,
        });

        if (failed.retryEligible) {
          try {
            options.taskService.requeueTask({
              taskId: failed.task.id,
              assignedAgentId: failed.task.assignedAgentId ?? options.agentId,
            });
          } catch {
            // Requeue is best-effort; failed task state is already persisted.
          }
        }
      }

      updateStatus({
        state: "idle",
        currentTaskId: null,
        errorStreak: 0,
        lastError: null,
      });
    } catch (error) {
      if (started) {
        try {
          options.taskService.failAttempt({
            taskId: started.task.id,
            claimId: claim.id,
            attemptId: started.attempt.id,
            agentId: options.agentId,
            leaseToken: claim.leaseToken,
            errorText: toErrorMessage(error),
            summary: `Worker runtime failure on task ${claimedTask.id}`,
          });
        } catch {
          // If failAttempt preconditions no longer hold, release claim as fallback.
          try {
            options.taskService.releaseTaskClaim(claim.id, "expired");
          } catch {
            // ignored
          }
        }
      } else {
        try {
          options.taskService.releaseTaskClaim(claim.id, "expired");
        } catch {
          // ignored
        }
      }
      throw error;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  };

  const runLoop = async (signal: AbortSignal) => {
    let backoffMs = 0;
    updateStatus({ state: "idle", currentTaskId: null, lastError: null }, "started");
    while (!signal.aborted) {
      try {
        options.taskService.expireStaleTaskClaims();
        updateStatus({ state: "claiming" });
        const claim = options.taskService.claimNextTask({
          agentId: options.agentId,
          leaseDurationMs,
        });
        if (!claim) {
          backoffMs = 0;
          updateStatus({ state: "idle", currentTaskId: null, lastError: null });
          await sleep(idlePollMs, signal);
          continue;
        }

        await runSingleClaim(signal, claim);
        backoffMs = 0;
      } catch (error) {
        if (signal.aborted) {
          break;
        }
        backoffMs = Math.min(backoffMs > 0 ? backoffMs * 2 : 1_000, maxBackoffMs);
        updateStatus({
          state: "recovering",
          currentTaskId: null,
          errorStreak: status.errorStreak + 1,
          lastError: toErrorMessage(error),
        });
        try {
          await sleep(backoffMs, signal);
        } catch {
          break;
        }
      }
    }
    updateStatus({ state: "paused", currentTaskId: null }, "stopped");
  };

  return {
    start: () => {
      if (loopPromise) {
        return;
      }
      stopController = new AbortController();
      loopPromise = runLoop(stopController.signal).finally(() => {
        stopController = null;
        loopPromise = null;
      });
    },
    stop: async () => {
      if (stopController) {
        stopController.abort();
      }
      if (loopPromise) {
        await loopPromise;
      }
    },
    getStatus: () => ({ ...status, teamIds: [...status.teamIds] }),
    setTeamIds: (teamIds: string[]) => {
      const normalized = uniqSorted(teamIds);
      if (normalized.join("|") === status.teamIds.join("|")) {
        return;
      }
      updateStatus({ teamIds: normalized });
    },
  };
}
