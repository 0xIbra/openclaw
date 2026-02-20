/**
 * Ares Intent Classification
 *
 * Parses natural language into structured intents using an LLM.
 */

import { randomUUID } from "node:crypto";
import type { AresContext, AresIntent } from "./types.js";
import { resolveSessionTranscriptPath } from "../../config/sessions.js";
import { buildAgentMainSessionKey } from "../../routing/session-key.js";
import { resolveAgentWorkspaceDir } from "../agent-scope.js";
import { runEmbeddedPiAgent } from "../pi-embedded.js";
import { buildAresPrompt } from "./prompts.js";

// Simple regex-based fallback for common patterns
const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  intent: (matches: RegExpExecArray) => AresIntent;
}> = [
  // Team creation patterns
  {
    pattern: /^(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?team\s+(?:called\s+)?["']?([^"']+)["']?/i,
    intent: (m) => ({ type: "team_create", name: m[1].trim() }),
  },
  // Team list patterns
  {
    pattern: /^(?:list|show|get)\s+(?:all\s+)?teams/i,
    intent: () => ({ type: "team_list" }),
  },
  // Project creation patterns
  {
    pattern:
      /^(?:create|make|add)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called\s+)?["']?([^"']+)["']?/i,
    intent: (m) => ({ type: "project_create", name: m[1].trim() }),
  },
  // Project list patterns
  {
    pattern: /^(?:list|show|get)\s+(?:all\s+)?projects/i,
    intent: () => ({ type: "project_list" }),
  },
  // Status patterns
  {
    pattern: /^(?:status|overview|what['']?s\s+(?:going\s+on|happening)|show\s+me\s+the\s+status)/i,
    intent: () => ({ type: "status_overview" }),
  },
  // Help patterns
  {
    pattern: /^(?:help|what\s+can\s+you\s+do|\?)/i,
    intent: () => ({ type: "help" }),
  },
];

/**
 * Try to classify intent using regex patterns (fast path)
 */
function classifyWithPatterns(message: string): AresIntent | null {
  for (const { pattern, intent } of INTENT_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      return intent(match);
    }
  }
  return null;
}

/**
 * Parse JSON intent from LLM response
 */
function parseIntentFromJson(text: string): { intent: AresIntent; reasoning?: string } | null {
  // Try to extract JSON from code blocks
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const intentType = parsed.intent as string;
    const params = (parsed.params as Record<string, unknown>) ?? {};
    const reasoning = parsed.reasoning as string | undefined;

    // Validate and construct intent based on type
    switch (intentType) {
      case "team_create":
        return {
          intent: {
            type: "team_create",
            name: typeof params.name === "string" ? params.name : "",
            description: typeof params.description === "string" ? params.description : undefined,
            leadAgentId: typeof params.leadAgentId === "string" ? params.leadAgentId : undefined,
          },
          reasoning,
        };
      case "team_list":
        return { intent: { type: "team_list" }, reasoning };
      case "team_get":
        return {
          intent: {
            type: "team_get",
            id: typeof params.id === "string" ? params.id : undefined,
            name: typeof params.name === "string" ? params.name : undefined,
          },
          reasoning,
        };
      case "team_update": {
        const updates = params.updates as Record<string, unknown> | undefined;
        return {
          intent: {
            type: "team_update",
            id: typeof params.id === "string" ? params.id : "",
            updates: {
              name: typeof updates?.name === "string" ? updates.name : undefined,
              description:
                typeof updates?.description === "string" ? updates.description : undefined,
              leadAgentId:
                updates?.leadAgentId === null
                  ? null
                  : typeof updates?.leadAgentId === "string"
                    ? updates.leadAgentId
                    : undefined,
            },
          },
          reasoning,
        };
      }
      case "team_delete":
        return {
          intent: { type: "team_delete", id: typeof params.id === "string" ? params.id : "" },
          reasoning,
        };
      case "team_add_member":
        return {
          intent: {
            type: "team_add_member",
            teamId: typeof params.teamId === "string" ? params.teamId : "",
            agentId: typeof params.agentId === "string" ? params.agentId : "",
            role: params.role === "lead" ? "lead" : "member",
          },
          reasoning,
        };
      case "team_remove_member":
        return {
          intent: {
            type: "team_remove_member",
            teamId: typeof params.teamId === "string" ? params.teamId : "",
            agentId: typeof params.agentId === "string" ? params.agentId : "",
          },
          reasoning,
        };
      case "task_create":
        return {
          intent: {
            type: "task_create",
            projectId: typeof params.projectId === "string" ? params.projectId : "",
            title: typeof params.title === "string" ? params.title : "",
            description: typeof params.description === "string" ? params.description : "",
            taskType: typeof params.type === "string" ? params.type : "feature",
          },
          reasoning,
        };
      case "task_list":
        return {
          intent: {
            type: "task_list",
            filters: params.filters as
              | { projectId?: string; status?: string; assignedAgentId?: string }
              | undefined,
          },
          reasoning,
        };
      case "task_get":
        return {
          intent: { type: "task_get", id: typeof params.id === "string" ? params.id : "" },
          reasoning,
        };
      case "task_assign":
        return {
          intent: {
            type: "task_assign",
            taskId: typeof params.taskId === "string" ? params.taskId : "",
            assignedAgentId:
              typeof params.assignedAgentId === "string" ? params.assignedAgentId : "",
          },
          reasoning,
        };
      case "project_create":
        return {
          intent: {
            type: "project_create",
            name: typeof params.name === "string" ? params.name : "",
            description: typeof params.description === "string" ? params.description : undefined,
            repoRoot: typeof params.repoRoot === "string" ? params.repoRoot : undefined,
          },
          reasoning,
        };
      case "project_list":
        return { intent: { type: "project_list" }, reasoning };
      case "project_get":
        return {
          intent: {
            type: "project_get",
            id: typeof params.id === "string" ? params.id : undefined,
            name: typeof params.name === "string" ? params.name : undefined,
          },
          reasoning,
        };
      case "status_overview":
        return { intent: { type: "status_overview" }, reasoning };
      case "help":
        return {
          intent: {
            type: "help",
            topic: typeof params.topic === "string" ? params.topic : undefined,
          },
          reasoning,
        };
      case "unknown":
        return {
          intent: { type: "unknown", raw: typeof params.raw === "string" ? params.raw : "" },
          reasoning,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Classify user message into an intent
 */
export async function classifyIntent(
  message: string,
  context: AresContext,
): Promise<{ intent: AresIntent; reasoning?: string } | null> {
  // Try fast path first
  const patternMatch = classifyWithPatterns(message);
  if (patternMatch) {
    return { intent: patternMatch, reasoning: "Pattern match" };
  }

  // Fall back to LLM classification
  const sessionId = `ares-intent-${randomUUID()}`;
  const sessionKey = buildAgentMainSessionKey({ agentId: context.agentId, mainKey: "ares-intent" });
  const sessionFile = resolveSessionTranscriptPath(sessionId, context.agentId);
  const workspaceDir = resolveAgentWorkspaceDir(context.config, context.agentId);

  // Build context-aware prompt
  // TODO: Fetch actual teams/projects from task service
  const systemPrompt = buildAresPrompt({
    availableTeams: [],
    availableProjects: [],
  });

  const fullPrompt = `${systemPrompt}\n\n## User Request\n${message}\n\nRespond with the appropriate JSON intent.`;

  const run = await runEmbeddedPiAgent({
    sessionId,
    sessionKey,
    agentId: context.agentId,
    sessionFile,
    workspaceDir,
    config: context.config,
    prompt: fullPrompt,
    timeoutMs: 30_000,
    runId: `ares:intent:${Date.now()}`,
    disableMessageTool: true,
    // Use low thinking for fast classification
    thinkLevel: "low",
  });

  const text = (run.payloads ?? [])
    .map((p) => (typeof p.text === "string" ? p.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");

  return parseIntentFromJson(text);
}

/**
 * Check if a message should be handled by Ares
 */
export function shouldHandleAsAres(message: string): boolean {
  // Direct mentions of Ares
  if (/\bares\b/i.test(message)) {
    return true;
  }

  // Team-related keywords
  if (
    /\b(team|teams)\b/i.test(message) &&
    /\b(create|make|add|list|show|delete|remove|update)\b/i.test(message)
  ) {
    return true;
  }

  // Task-related keywords in management context
  if (/\b(task|tasks)\b/i.test(message) && /\b(create|assign|give|delegate)\b/i.test(message)) {
    return true;
  }

  // Project-related keywords
  if (/\b(project|projects)\b/i.test(message) && /\b(create|make|add|list|show)\b/i.test(message)) {
    return true;
  }

  // Status/overview requests
  if (/\b(status|overview|what['']?s\s+(?:going\s+on|happening))\b/i.test(message)) {
    return true;
  }

  return false;
}
