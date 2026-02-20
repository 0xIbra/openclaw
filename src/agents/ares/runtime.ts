/**
 * Ares Master Control Runtime — tool-calling agent implementation.
 *
 * Instead of classify→execute (fragile, single-step), Ares runs as a real
 * embedded agent with tools. The model reasons, calls tools, handles errors,
 * and produces the final response text.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AresContext, AresResult, AresRuntime } from "./types.js";
import { resolveSessionTranscriptPath } from "../../config/sessions.js";
import { buildAgentMainSessionKey } from "../../routing/session-key.js";
import { resolveAgentWorkspaceDir } from "../agent-scope.js";
import { runEmbeddedPiAgent } from "../pi-embedded.js";
import { shouldHandleAsAres } from "./intents.js";
import { ARES_SYSTEM_PROMPT } from "./prompts.js";

export function createAresRuntime(): AresRuntime {
  return {
    processMessage: async (message: string, context: AresContext): Promise<AresResult> => {
      if (!shouldHandleAsAres(message)) {
        return { ok: false, error: "Not an Ares request" };
      }

      try {
        const sessionId = `ares-${randomUUID()}`;
        const sessionKey = buildAgentMainSessionKey({
          agentId: context.agentId,
          mainKey: "ares",
        });
        const sessionFile = resolveSessionTranscriptPath(sessionId, context.agentId);
        await fs.mkdir(path.dirname(sessionFile), { recursive: true });
        const workspaceDir = resolveAgentWorkspaceDir(context.config, context.agentId);

        const run = await runEmbeddedPiAgent({
          sessionId,
          sessionKey,
          agentId: context.agentId,
          agentDir: context.agentDir,
          sessionFile,
          workspaceDir,
          config: context.config,
          provider: context.provider,
          model: context.model,
          prompt: message,
          extraSystemPrompt: ARES_SYSTEM_PROMPT,
          timeoutMs: 120_000,
          runId: `ares:${Date.now()}`,
          disableMessageTool: true,
          thinkLevel: "low",
        });

        // Collect all text payloads as the response
        const text = (run.payloads ?? [])
          .map((p) => (typeof p.text === "string" ? p.text.trim() : ""))
          .filter(Boolean)
          .join("\n\n");

        if (!text && run.meta.error) {
          return {
            ok: false,
            error: `Ares encountered an error: ${run.meta.error.message}`,
          };
        }

        return {
          ok: true,
          message: text || "Done.",
        };
      } catch (error) {
        return {
          ok: false,
          error: `Ares failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

// Export singleton instance
export const ares = createAresRuntime();
