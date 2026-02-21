import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { TaskService } from "../service.js";
import type { ProjectRecord } from "../types.js";
import type { TaskExecutor, TaskExecutionInput } from "./types.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { loadConfig } from "../../config/config.js";
import { resolveSessionTranscriptPath } from "../../config/sessions.js";
import { searchLayeredMemory, resolveLayeredScopes } from "../../memory/layered-manager.js";
import { buildAgentMainSessionKey } from "../../routing/session-key.js";
import { scrubText } from "../../secrets/scrub-middleware.js";
import { appendTaskRuntimeMemoryContext } from "../memory-context.js";
import { TASK_WORKER_EXECUTION_TIMEOUT_MS } from "./defaults.js";
import {
  buildRichTaskPrompt,
  extractOutcomeFlags,
  formatBusMessagesAsContext,
  formatMemoryResults,
} from "./executor-context.js";
import { buildExecutionResultFromOutput } from "./executor.js";

export type EmbeddedTaskExecutorOptions = {
  agentId: string;
  config?: OpenClawConfig;
  loadCurrentConfig?: () => OpenClawConfig;
  timeoutMs?: number;
  taskService?: TaskService;
};

export function createEmbeddedTaskExecutor(options: EmbeddedTaskExecutorOptions): TaskExecutor {
  return {
    execute: async (input: TaskExecutionInput) => {
      const config = options.loadCurrentConfig?.() ?? options.config ?? loadConfig();
      const taskService = options.taskService;

      // --- Deterministic session ID: same agent + task always resumes the same conversation ---
      const sessionId = `task-runtime:${options.agentId}:${input.task.id}`;

      const sessionFile = resolveSessionTranscriptPath(sessionId, options.agentId);
      await fs.mkdir(path.dirname(sessionFile), { recursive: true });
      const defaultWorkspaceDir = resolveAgentWorkspaceDir(config, options.agentId);
      const workspaceDir =
        input.workspaceDir && input.workspaceDir.trim().length > 0
          ? input.workspaceDir.trim()
          : defaultWorkspaceDir;
      const sessionKey = appendTaskRuntimeMemoryContext({
        sessionKey: buildAgentMainSessionKey({
          agentId: options.agentId,
          mainKey: "task-runtime",
        }),
        projectId: input.task.projectId,
        teamId: input.task.teamId,
        taskId: input.task.id,
      });
      const runId = `task-runtime:${options.agentId}:${input.task.id}:${input.attempt.id}`;

      // --- Load project record (best-effort) ---
      let project: ProjectRecord | null = null;
      if (taskService) {
        try {
          project = taskService.getProject(input.task.projectId);
        } catch {
          // Project not found or DB error — continue without project context
        }
      }

      // --- Pull and ack bus messages (best-effort) ---
      let busContext: string | null = null;
      if (taskService) {
        try {
          const deliveries = taskService.pullBusMessages({
            receiverAgentId: options.agentId,
            maxMessages: 10,
            visibilityTimeoutMs: options.timeoutMs ?? TASK_WORKER_EXECUTION_TIMEOUT_MS,
          });
          busContext = formatBusMessagesAsContext(deliveries);
          for (const { message, ackToken } of deliveries) {
            try {
              taskService.ackBusMessage({
                receiverAgentId: options.agentId,
                messageId: message.id,
                ackToken,
              });
            } catch {
              // Best-effort ack — message will re-appear after visibility timeout
            }
          }
        } catch {
          // Bus unavailable — continue without lead context
        }
      }

      // --- Search layered memory (best-effort, does not require taskService) ---
      let memoryContext: string | null = null;
      try {
        const scopes = resolveLayeredScopes({
          cfg: config,
          agentId: options.agentId,
          projectId: input.task.projectId,
          teamId: input.task.teamId,
        });
        const memResults = await searchLayeredMemory({
          cfg: config,
          agentId: options.agentId,
          query: `${input.task.title} ${input.task.description}`.slice(0, 500),
          scopes,
          maxResults: 5,
        }).catch(() => []);
        memoryContext = formatMemoryResults(memResults);
      } catch {
        // Memory search unavailable — continue without lessons
      }

      // --- Load previous attempt summary (best-effort) ---
      let previousAttemptSummary: string | null = null;
      if (taskService && (input.attempt.attemptNumber ?? 1) > 1) {
        try {
          const attempts = taskService.listTaskAttempts(input.task.id, 2);
          // The current attempt is the latest; we want the one before it
          const prev = attempts.find((a) => a.id !== input.attempt.id);
          previousAttemptSummary = prev?.summary?.trim() || prev?.errorText?.trim() || null;
        } catch {
          // Previous attempt not available — continue without retry context
        }
      }

      // --- Build enriched prompt ---
      const prompt = buildRichTaskPrompt({
        agentId: options.agentId,
        task: input.task,
        attempt: input.attempt,
        project,
        previousAttemptSummary,
        busContext,
        memoryContext,
      });

      try {
        const result = await runEmbeddedPiAgent({
          sessionId,
          sessionKey,
          agentId: options.agentId,
          sessionFile,
          workspaceDir,
          config,
          prompt,
          timeoutMs: options.timeoutMs ?? TASK_WORKER_EXECUTION_TIMEOUT_MS,
          runId,
          disableMessageTool: true,
        });

        // --- Collect and scrub output text ---
        const rawText = (result.payloads ?? [])
          .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
          .filter(Boolean)
          .join("\n\n");
        const text = scrubText(rawText, {
          context: "terminal",
          agentId: options.agentId,
          taskId: input.task.id,
        });

        const errorPayload = (result.payloads ?? []).find(
          (payload) => payload.isError && typeof payload.text === "string",
        );

        // --- Build result and merge boolean outcome flags ---
        const baseResult = buildExecutionResultFromOutput({
          text,
          fallbackSummary: `Executed task ${input.task.id}`,
          didFail: Boolean(result.meta.error) || Boolean(errorPayload),
          errorText:
            (typeof errorPayload?.text === "string" ? errorPayload.text : undefined) ??
            result.meta.error?.message,
          session: {
            backend: "embedded",
            id: result.meta.agentMeta?.sessionId?.trim() || null,
          },
        });

        const { commandOutcomePatch, testOutcomePatch } = extractOutcomeFlags(text);
        return {
          ...baseResult,
          commandOutcome: { ...baseResult.commandOutcome, ...commandOutcomePatch },
          testOutcome: { ...baseResult.testOutcome, ...testOutcomePatch },
        };
      } catch (error) {
        return {
          status: "failed",
          summary: `Execution failed for task ${input.task.id}`,
          errorText: error instanceof Error ? error.message : String(error),
          session: {
            backend: "embedded",
            id: null,
          },
          commandOutcome: {},
          testOutcome: {},
          changedFiles: [],
          metrics: {},
        };
      }
    },
  };
}

export function createEmbeddedTaskExecutorFactory(params?: {
  config?: OpenClawConfig;
  loadCurrentConfig?: () => OpenClawConfig;
  timeoutMs?: number;
  taskService?: TaskService;
}): (agentId: string) => TaskExecutor {
  return (agentId: string) =>
    createEmbeddedTaskExecutor({
      agentId,
      config: params?.config,
      loadCurrentConfig: params?.loadCurrentConfig,
      timeoutMs: params?.timeoutMs,
      taskService: params?.taskService,
    });
}
