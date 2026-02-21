import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../../config/config.js";
import type { TaskQuestionAnswerer, TaskQuestionAnswererInput } from "./types.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { loadConfig } from "../../config/config.js";
import { resolveSessionTranscriptPath } from "../../config/sessions.js";
import { searchLayeredMemory, resolveLayeredScopes } from "../../memory/layered-manager.js";
import { buildAgentMainSessionKey } from "../../routing/session-key.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function buildAnswerPrompt(input: TaskQuestionAnswererInput, memoryContext: string): string {
  const taskLine = input.taskId ? ` on task ${input.taskId}` : "";
  return [
    `You are team lead "${input.leadAgentId}" for team "${input.teamName}".`,
    `Worker agent "${input.requesterAgentId}" asked a question${taskLine}:`,
    "",
    input.questionBody,
    "",
    memoryContext ? `Relevant team memory:\n${memoryContext}\n` : "",
    "Provide a concise, actionable answer. Do not ask follow-up questions.",
  ]
    .filter(Boolean)
    .join("\n");
}

export type QuestionAnswererOptions = {
  config?: OpenClawConfig;
  loadCurrentConfig?: () => OpenClawConfig;
  timeoutMs?: number;
};

export function createQuestionAnswerer(options?: QuestionAnswererOptions): TaskQuestionAnswerer {
  const timeoutMs = Math.max(1, Math.floor(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS));

  return {
    answer: async (input: TaskQuestionAnswererInput) => {
      const cfg = options?.loadCurrentConfig?.() ?? options?.config ?? loadConfig();

      // Best-effort memory search for context
      let memoryContext = "";
      try {
        const scopes = resolveLayeredScopes({
          cfg,
          agentId: input.leadAgentId,
          projectId: undefined,
          teamId: input.teamId,
        });
        if (scopes.length > 0) {
          const results = await searchLayeredMemory({
            cfg,
            agentId: input.leadAgentId,
            query: input.questionBody.slice(0, 500),
            scopes,
            maxResults: 3,
          }).catch(() => []);
          if (results.length > 0) {
            memoryContext = results.map((r) => `[${r.scopeKind}] ${r.snippet.trim()}`).join("\n\n");
          }
        }
      } catch {
        // best-effort
      }

      const prompt = buildAnswerPrompt(input, memoryContext);
      const sessionId = `lead-qa-${randomUUID()}`;
      const sessionFile = resolveSessionTranscriptPath(sessionId, input.leadAgentId);
      const workspaceDir = resolveAgentWorkspaceDir(cfg, input.leadAgentId);

      const run = await runEmbeddedPiAgent({
        sessionId,
        sessionKey: buildAgentMainSessionKey({
          agentId: input.leadAgentId,
          mainKey: "lead-qa",
        }),
        agentId: input.leadAgentId,
        sessionFile,
        workspaceDir,
        config: cfg,
        prompt,
        timeoutMs,
        runId: `lead-qa:${input.teamId}:${input.requesterAgentId}:${Date.now()}`,
        disableMessageTool: true,
        disableTools: true,
      });

      const text = (run.payloads ?? [])
        .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
        .filter(Boolean)
        .join("\n\n");

      if (!text.trim()) {
        throw new Error("Question answerer produced no output");
      }

      return { answer: text.trim() };
    },
  };
}
