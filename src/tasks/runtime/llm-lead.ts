import type { TaskRecord, TaskQuestionThreadRecord } from "../types.js";
import type { TaskLead, TaskLeadEvent, TaskLeadOptions, TaskLeadStatus } from "./types.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { loadConfig } from "../../config/config.js";
import { resolveSessionTranscriptPath } from "../../config/sessions.js";
import { buildAgentMainSessionKey } from "../../routing/session-key.js";
import { TASK_LEAD_POLL_MS } from "./defaults.js";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return;
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

const LEAD_TURN_TIMEOUT_MS = 120_000;

const LEAD_SYSTEM_PROMPT = `You are a team lead agent in OpenClaw's autonomous task system.
Your job is to manage your team's workflow each turn: decompose parent tasks, delegate ready tasks to team members, review completed work, and answer worker questions.

## Rules
- Use the tasks and teams tools to perform actions. Never guess IDs.
- Delegate work to team members, not to yourself.
- Auto-approve tasks where all children passed tests. Escalate unclear cases.
- When a worker asks a question, answer it using your knowledge and context, or escalate if you can't.
- Be concise. Each turn should make measurable progress.
- If there's nothing to do, simply say "No pending work." and the system will sleep until the next poll.`;

type LeadSnapshot = {
  hasWork: boolean;
  members: Array<{ agentId: string; role: string }>;
  pendingMessages: Array<{
    id: string;
    senderAgentId: string;
    messageType: string;
    subject: string | null;
    body: string;
  }>;
  activeTasks: TaskRecord[];
  readyTasks: TaskRecord[];
  blockedTasks: TaskRecord[];
  openQuestions: Array<{ thread: TaskQuestionThreadRecord; questionBody: string }>;
};

function buildLeadContextSnapshot(options: TaskLeadOptions): LeadSnapshot {
  const members = options.taskService.listTeamMembers(options.teamId);
  const activeTasks = options.taskService.listTeamActiveTasks(options.teamId);
  const readyTasks = options.taskService.listTeamReadyTasks(options.teamId);
  const blockedTasks = activeTasks.filter((t) => t.status === "blocked");

  const deliveries = options.taskService.pullBusMessages({
    receiverAgentId: options.leadAgentId,
    maxMessages: 20,
    visibilityTimeoutMs: 30_000,
  });
  const pendingMessages = deliveries.map((d) => ({
    id: d.message.id,
    senderAgentId: d.message.senderAgentId,
    messageType: d.message.messageType,
    subject: d.message.subject,
    body: d.message.body,
  }));

  // Ack messages immediately — the LLM will see them in the prompt
  for (const delivery of deliveries) {
    try {
      options.taskService.ackBusMessage({
        receiverAgentId: options.leadAgentId,
        messageId: delivery.message.id,
        ackToken: delivery.ackToken,
      });
    } catch {
      // best-effort
    }
  }

  const rawQuestions = options.taskService
    .listDueQuestionReminders(Date.now() + 999_999_999)
    .filter(
      (thread) => thread.teamId === options.teamId && thread.leadAgentId === options.leadAgentId,
    );
  const openQuestions = rawQuestions.map((thread) => ({
    thread,
    questionBody:
      options.taskService.getBusMessage(thread.questionMessageId)?.body ?? "(question unavailable)",
  }));

  const hasWork =
    pendingMessages.length > 0 ||
    readyTasks.some((t) => !t.assignedAgentId) ||
    activeTasks.some((t) => t.status === "review") ||
    openQuestions.length > 0;

  return {
    hasWork,
    members,
    pendingMessages,
    activeTasks,
    readyTasks,
    blockedTasks,
    openQuestions,
  };
}

function formatTask(task: TaskRecord): string {
  const parts = [
    `- [${task.status}] ${task.title} (${task.id})`,
    task.assignedAgentId ? `  assigned: ${task.assignedAgentId}` : null,
    task.priority !== "medium" ? `  priority: ${task.priority}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

function buildLeadTurnPrompt(options: TaskLeadOptions, snapshot: LeadSnapshot): string {
  const sections: string[] = [];

  sections.push(`## Team Status`);
  sections.push(`- Team: ${options.teamName} (${options.teamId})`);
  sections.push(`- Lead: ${options.leadAgentId}`);
  sections.push(`- Members: ${snapshot.members.map((m) => `${m.agentId} (${m.role})`).join(", ")}`);

  if (snapshot.pendingMessages.length > 0) {
    sections.push(`\n## Inbox Messages (${snapshot.pendingMessages.length})`);
    for (const msg of snapshot.pendingMessages) {
      const subjectLine = msg.subject ? ` — ${msg.subject}` : "";
      sections.push(
        `- [${msg.messageType}] from ${msg.senderAgentId}${subjectLine}\n  ${msg.body}`,
      );
    }
  }

  if (snapshot.activeTasks.length > 0) {
    sections.push(`\n## Active Tasks (${snapshot.activeTasks.length})`);
    sections.push(snapshot.activeTasks.map(formatTask).join("\n"));
  }

  if (snapshot.readyTasks.length > 0) {
    sections.push(
      `\n## Ready Tasks - unassigned (${snapshot.readyTasks.filter((t) => !t.assignedAgentId).length})`,
    );
    sections.push(
      snapshot.readyTasks
        .filter((t) => !t.assignedAgentId)
        .map(formatTask)
        .join("\n"),
    );
  }

  if (snapshot.blockedTasks.length > 0) {
    sections.push(`\n## Blocked Tasks (${snapshot.blockedTasks.length})`);
    sections.push(snapshot.blockedTasks.map(formatTask).join("\n"));
  }

  if (snapshot.openQuestions.length > 0) {
    sections.push(`\n## Open Questions (${snapshot.openQuestions.length})`);
    for (const { thread, questionBody } of snapshot.openQuestions) {
      sections.push(
        `- From ${thread.requesterAgentId} (thread: ${thread.id}, task: ${thread.taskId ?? "none"})\n  > ${questionBody}`,
      );
    }
  }

  sections.push(`\nWhat should you do next? Use the available tools to make progress.`);
  return sections.join("\n");
}

export function createLLMTaskLead(options: TaskLeadOptions): TaskLead {
  const pollMs = Math.max(1, Math.floor(options.pollMs ?? TASK_LEAD_POLL_MS));
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
    status = { ...status, ...patch, updatedAtMs: now() };
    emit({ reason, lead: { ...status }, payload });
  };

  // Stable session so the LLM retains context across turns
  const sessionId = `lead:${options.teamId}:${options.leadAgentId}`;

  const runLoop = async (signal: AbortSignal) => {
    updateStatus({ state: "idle", lastError: null }, "started");

    while (!signal.aborted) {
      try {
        updateStatus({ state: "processing", lastPolledAtMs: now() });

        const snapshot = buildLeadContextSnapshot(options);

        if (!snapshot.hasWork) {
          updateStatus({ state: "idle" });
          try {
            await sleep(pollMs, signal);
          } catch {
            break;
          }
          continue;
        }

        const cfg = options.config ?? loadConfig();
        const sessionFile = resolveSessionTranscriptPath(sessionId, options.leadAgentId);
        const workspaceDir = resolveAgentWorkspaceDir(cfg, options.leadAgentId);
        const prompt = buildLeadTurnPrompt(options, snapshot);

        await runEmbeddedPiAgent({
          sessionId,
          sessionKey: buildAgentMainSessionKey({
            agentId: options.leadAgentId,
            mainKey: "team-lead",
          }),
          agentId: options.leadAgentId,
          sessionFile,
          workspaceDir,
          config: cfg,
          prompt,
          extraSystemPrompt: LEAD_SYSTEM_PROMPT,
          timeoutMs: LEAD_TURN_TIMEOUT_MS,
          runId: `lead-turn:${options.teamId}:${now()}`,
          disableMessageTool: false,
          thinkLevel: "low",
          abortSignal: signal,
        });

        // Refresh question count after the LLM turn
        const waitingQuestionCount = options.taskService.countOpenQuestionThreads({
          teamId: options.teamId,
          leadAgentId: options.leadAgentId,
        });
        updateStatus({
          waitingQuestionCount,
          state: waitingQuestionCount > 0 ? "waiting" : "idle",
        });
      } catch (error) {
        if (signal.aborted) {
          break;
        }
        updateStatus({ state: "waiting", lastError: toErrorMessage(error) });
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
