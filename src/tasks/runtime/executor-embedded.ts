import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { TaskExecutor, TaskExecutionInput } from "./types.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { loadConfig } from "../../config/config.js";
import { resolveSessionTranscriptPath } from "../../config/sessions.js";
import { buildAgentMainSessionKey } from "../../routing/session-key.js";
import { appendTaskRuntimeMemoryContext } from "../memory-context.js";
import { TASK_WORKER_EXECUTION_TIMEOUT_MS } from "./defaults.js";
import { buildExecutionResultFromOutput } from "./executor.js";

function buildTaskPrompt(input: TaskExecutionInput): string {
  const relevantPaths =
    input.task.relevantPaths.length > 0
      ? input.task.relevantPaths.map((entry) => `- ${entry}`).join("\n")
      : "- (none)";
  const tags =
    input.task.tags.length > 0
      ? input.task.tags.map((entry) => `- ${entry}`).join("\n")
      : "- (none)";
  const dependencies =
    input.task.dependsOnTaskIds.length > 0
      ? input.task.dependsOnTaskIds.map((entry) => `- ${entry}`).join("\n")
      : "- (none)";

  return [
    `You are executing task "${input.task.title}" (${input.task.id}).`,
    "",
    "Task details:",
    `- Project ID: ${input.task.projectId}`,
    `- Type: ${input.task.type}`,
    `- Priority: ${input.task.priority}`,
    `- Attempt: ${input.attempt.attemptNumber ?? "unknown"} / ${input.task.maxAttempts}`,
    "",
    "Description:",
    input.task.description,
    "",
    "Relevant paths:",
    relevantPaths,
    "",
    "Tags:",
    tags,
    "",
    "Dependencies:",
    dependencies,
    "",
    "Do the implementation work and then end your response with a JSON report in a fenced ```json block.",
    "JSON fields:",
    '- status: "success" or "failed"',
    "- summary: short completion summary",
    "- notes: optional details for operators",
    "- changedFiles: string[]",
    "- commandOutcome: object",
    "- testOutcome: object",
    "- metrics: object",
    "- errorText: required only when status=failed",
  ].join("\n");
}

export type EmbeddedTaskExecutorOptions = {
  agentId: string;
  config?: OpenClawConfig;
  loadCurrentConfig?: () => OpenClawConfig;
  timeoutMs?: number;
};

export function createEmbeddedTaskExecutor(options: EmbeddedTaskExecutorOptions): TaskExecutor {
  return {
    execute: async (input) => {
      const config = options.loadCurrentConfig?.() ?? options.config ?? loadConfig();
      const sessionId = `task-runtime-${randomUUID()}`;
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
      try {
        const result = await runEmbeddedPiAgent({
          sessionId,
          sessionKey,
          agentId: options.agentId,
          sessionFile,
          workspaceDir,
          config,
          prompt: buildTaskPrompt(input),
          timeoutMs: options.timeoutMs ?? TASK_WORKER_EXECUTION_TIMEOUT_MS,
          runId,
          disableMessageTool: true,
        });
        const text = (result.payloads ?? [])
          .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
          .filter(Boolean)
          .join("\n\n");
        const errorPayload = (result.payloads ?? []).find(
          (payload) => payload.isError && typeof payload.text === "string",
        );
        return buildExecutionResultFromOutput({
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
}): (agentId: string) => TaskExecutor {
  return (agentId: string) =>
    createEmbeddedTaskExecutor({
      agentId,
      config: params?.config,
      loadCurrentConfig: params?.loadCurrentConfig,
      timeoutMs: params?.timeoutMs,
    });
}
