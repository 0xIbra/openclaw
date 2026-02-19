import type { TaskLead, TaskLeadEvent, TaskLeadOptions, TaskLeadStatus } from "./types.js";
import { markSubagentRunTerminated, registerSubagentRun } from "../../agents/subagent-registry.js";
import { resolveAgentMainSessionKey } from "../../config/sessions.js";
import { writeLayeredMemoryEntry } from "../../memory/layered-writeback.js";
import {
  TASK_LEAD_MESSAGE_VISIBILITY_TIMEOUT_MS,
  TASK_LEAD_POLL_MS,
  TASK_LEAD_QUESTION_ESCALATION_MS,
  TASK_LEAD_QUESTION_REMINDER_MS,
} from "./defaults.js";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildDelegationRunId(params: { teamId: string; taskId: string; agentId: string }): string {
  return `task-runtime:${params.teamId}:${params.taskId}:${params.agentId}`;
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

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

export function createTaskLead(options: TaskLeadOptions): TaskLead {
  const pollMs = Math.max(1, Math.floor(options.pollMs ?? TASK_LEAD_POLL_MS));
  const visibilityTimeoutMs = Math.max(
    1,
    Math.floor(options.busVisibilityTimeoutMs ?? TASK_LEAD_MESSAGE_VISIBILITY_TIMEOUT_MS),
  );
  const questionReminderMs = Math.max(
    1,
    Math.floor(options.questionReminderMs ?? TASK_LEAD_QUESTION_REMINDER_MS),
  );
  const questionEscalationMs = Math.max(
    1,
    Math.floor(options.questionEscalationMs ?? TASK_LEAD_QUESTION_ESCALATION_MS),
  );
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? sleepWithAbort;
  let stopController: AbortController | null = null;
  let loopPromise: Promise<void> | null = null;

  let status: TaskLeadStatus = {
    teamId: options.teamId,
    teamName: options.teamName,
    leadAgentId: options.leadAgentId,
    state: "paused",
    lastError: null,
    lastPolledAtMs: null,
    waitingQuestionCount: 0,
    updatedAtMs: now(),
  };

  const emit = (event: TaskLeadEvent) => {
    options.onEvent?.(event);
  };

  const updateStatus = (
    patch: Partial<Omit<TaskLeadStatus, "teamId" | "teamName" | "leadAgentId" | "updatedAtMs">>,
    reason: TaskLeadEvent["reason"] = "status",
    payload?: Record<string, unknown>,
  ) => {
    status = {
      ...status,
      ...patch,
      updatedAtMs: now(),
    };
    emit({
      reason,
      lead: { ...status },
      payload,
    });
  };

  const publishReminder = (
    threadId: string,
    requesterAgentId: string,
    questionMessageId: string,
  ) => {
    options.taskService.publishBusMessage({
      senderAgentId: options.leadAgentId,
      receiverAgentId: requesterAgentId,
      taskId: null,
      correlationId: threadId,
      replyToMessageId: questionMessageId,
      messageType: "context:provide",
      subject: "Question reminder",
      body: "Please provide an update or answer so execution can continue.",
      payload: {
        threadId,
        reminder: true,
      },
      dedupeKey: `lead-reminder:${threadId}`,
    });
  };

  const publishEscalation = (threadId: string, taskId: string | null, requesterAgentId: string) => {
    options.taskService.publishBusMessage({
      senderAgentId: options.leadAgentId,
      receiverAgentId: "ares",
      taskId: taskId ?? null,
      correlationId: threadId,
      messageType: "escalation",
      subject: "Question timeout escalation",
      body: `Question from ${requesterAgentId} timed out and requires human attention.`,
      payload: {
        threadId,
        teamId: options.teamId,
        leadAgentId: options.leadAgentId,
        requesterAgentId,
      },
      dedupeKey: `lead-escalation:${threadId}`,
    });
  };

  const processDueThreads = () => {
    const nowMs = now();
    const reminders = options.taskService
      .listDueQuestionReminders(nowMs)
      .filter(
        (thread) => thread.teamId === options.teamId && thread.leadAgentId === options.leadAgentId,
      );
    for (const thread of reminders) {
      publishReminder(thread.id, thread.requesterAgentId, thread.questionMessageId);
      options.taskService.touchQuestionThread({
        threadId: thread.id,
        lastNotifiedAtMs: nowMs,
      });
    }

    const escalations = options.taskService
      .listDueEscalations(nowMs)
      .filter(
        (thread) => thread.teamId === options.teamId && thread.leadAgentId === options.leadAgentId,
      );
    for (const thread of escalations) {
      publishEscalation(thread.id, thread.taskId, thread.requesterAgentId);
      const escalated = options.taskService.markQuestionEscalated(thread.id);
      updateStatus(
        {
          waitingQuestionCount: Math.max(0, status.waitingQuestionCount - 1),
        },
        "escalated",
        {
          threadId: escalated.threadId,
          taskId: escalated.taskId,
          requesterAgentId: escalated.requesterAgentId,
        },
      );
    }
  };

  const processInboundMessages = () => {
    const deliveries = options.taskService.pullBusMessages({
      receiverAgentId: options.leadAgentId,
      maxMessages: 20,
      visibilityTimeoutMs,
    });
    updateStatus({
      lastPolledAtMs: now(),
    });

    for (const delivery of deliveries) {
      const message = delivery.message;
      const payload = message.payload;
      const payloadThreadId = asString(payload.threadId);

      try {
        if (message.messageType === "question" || message.messageType === "blocker") {
          options.taskService.openQuestionThread({
            teamId: options.teamId,
            taskId: message.taskId,
            leadAgentId: options.leadAgentId,
            requesterAgentId: message.senderAgentId,
            questionMessageId: message.id,
            reminderDelayMs: questionReminderMs,
            escalationDelayMs: questionEscalationMs,
          });
        } else if (
          (message.messageType === "answer" || message.messageType === "context:provide") &&
          payloadThreadId
        ) {
          const answered = options.taskService.markQuestionAnswered({
            threadId: payloadThreadId,
            answerMessageId: message.id,
          });
          if (options.config && answered.taskId) {
            const task = options.taskService.getTask(answered.taskId);
            if (task) {
              void writeLayeredMemoryEntry({
                cfg: options.config,
                scopeRef: {
                  agentId: options.leadAgentId,
                  projectId: task.projectId,
                  teamId: task.teamId,
                },
                entry: {
                  eventType: "question:resolved",
                  taskId: task.id,
                  summary: message.body,
                  metadata: {
                    threadId: answered.id,
                    requesterAgentId: answered.requesterAgentId,
                    leadAgentId: options.leadAgentId,
                    answerMessageId: message.id,
                  },
                },
              }).catch(() => {
                // layered writeback is best-effort
              });
            }
          }
        } else if (
          message.messageType === "task:complete" ||
          message.messageType === "task:failed"
        ) {
          const taskId = asString(payload.taskId) ?? message.taskId;
          const delegatedAgentId = asString(payload.agentId) ?? message.senderAgentId;
          if (taskId) {
            const runId = buildDelegationRunId({
              teamId: options.teamId,
              taskId,
              agentId: delegatedAgentId,
            });
            markSubagentRunTerminated({
              runId,
              reason: message.messageType,
            });
          }
        }
      } finally {
        try {
          options.taskService.ackBusMessage({
            receiverAgentId: options.leadAgentId,
            messageId: message.id,
            ackToken: delivery.ackToken,
          });
        } catch {
          // best effort ack
        }
      }
    }
  };

  const delegateReadyTasks = () => {
    const team = options.taskService.getTeam(options.teamId);
    if (!team || team.archivedAtMs != null) {
      return;
    }
    const members = options.taskService
      .listTeamMembers(options.teamId)
      .filter(
        (member) =>
          member.role === "member" &&
          member.agentId !== options.leadAgentId &&
          member.agentId.trim(),
      );
    if (members.length === 0) {
      return;
    }
    const memberSet = new Set(members.map((member) => member.agentId));
    const active = options.taskService.listTeamActiveTasks(options.teamId);
    const load = new Map<string, number>(members.map((member) => [member.agentId, 0]));
    for (const task of active) {
      if (!task.assignedAgentId || !memberSet.has(task.assignedAgentId)) {
        continue;
      }
      load.set(task.assignedAgentId, (load.get(task.assignedAgentId) ?? 0) + 1);
    }

    const ready = options.taskService
      .listTeamReadyTasks(options.teamId)
      .filter((task) => !task.assignedAgentId);
    for (const task of ready) {
      const selected = [...load.entries()].toSorted((a, b) => a[1] - b[1])[0]?.[0];
      if (!selected) {
        return;
      }
      const decision = options.taskService.assignTaskToAgent({
        taskId: task.id,
        assignedAgentId: selected,
        teamId: options.teamId,
      });
      const runId = buildDelegationRunId({
        teamId: options.teamId,
        taskId: task.id,
        agentId: selected,
      });

      options.taskService.publishBusMessage({
        senderAgentId: options.leadAgentId,
        receiverAgentId: selected,
        taskId: task.id,
        correlationId: runId,
        messageType: "task:assign",
        subject: task.title,
        body: `Assigned task ${task.title} (${task.id})`,
        payload: {
          runId,
          taskId: task.id,
          teamId: options.teamId,
          assignedAgentId: selected,
        },
        dedupeKey: `task-assign:${task.id}:${selected}`,
      });

      registerSubagentRun({
        runId,
        childSessionKey: resolveAgentMainSessionKey({ agentId: selected }),
        requesterSessionKey: resolveAgentMainSessionKey({ agentId: options.leadAgentId }),
        requesterDisplayKey: options.leadAgentId,
        task: task.title,
        cleanup: "keep",
        label: task.title,
        runTimeoutSeconds: 0,
        runtimeSource: "task_runtime",
      });

      load.set(selected, (load.get(selected) ?? 0) + 1);
      updateStatus(
        {
          state: "delegating",
        },
        "delegated",
        {
          taskId: decision.taskId,
          assignedAgentId: decision.assignedAgentId,
        },
      );
    }
  };

  const refreshWaitingCount = () => {
    const waitingQuestionCount = options.taskService.countOpenQuestionThreads({
      teamId: options.teamId,
      leadAgentId: options.leadAgentId,
    });
    updateStatus({
      waitingQuestionCount,
      state: waitingQuestionCount > 0 ? "waiting" : "idle",
    });
  };

  const runLoop = async (signal: AbortSignal) => {
    updateStatus({ state: "idle", lastError: null }, "started");
    while (!signal.aborted) {
      try {
        updateStatus({ state: "processing" });
        processInboundMessages();
        processDueThreads();
        delegateReadyTasks();
        refreshWaitingCount();
      } catch (error) {
        if (signal.aborted) {
          break;
        }
        updateStatus({
          state: "waiting",
          lastError: toErrorMessage(error),
        });
      }

      try {
        await sleep(pollMs, signal);
      } catch {
        break;
      }
    }
    updateStatus({ state: "paused" }, "stopped");
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
    getStatus: () => ({ ...status }),
  };
}
