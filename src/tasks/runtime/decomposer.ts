import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../../config/config.js";
import type { TaskDecompositionPlan, TaskType } from "../types.js";
import type { TaskDecomposer, TaskDecomposerInput, TaskDecomposerResult } from "./types.js";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { runEmbeddedPiAgent } from "../../agents/pi-embedded.js";
import { loadConfig } from "../../config/config.js";
import { resolveSessionTranscriptPath } from "../../config/sessions.js";
import { buildAgentMainSessionKey } from "../../routing/session-key.js";

const DEFAULT_MAX_SUBTASKS = 12;

function toTaskType(value: unknown, fallback: TaskType): TaskType {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "feature" ||
    normalized === "bugfix" ||
    normalized === "refactor" ||
    normalized === "test" ||
    normalized === "review" ||
    normalized === "research" ||
    normalized === "devops"
  ) {
    return normalized;
  }
  return fallback;
}

function toPriority(value: unknown): "critical" | "high" | "medium" | "low" {
  if (typeof value !== "string") {
    return "medium";
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "critical" ||
    normalized === "high" ||
    normalized === "medium" ||
    normalized === "low"
  ) {
    return normalized;
  }
  return "medium";
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  for (let i = fenced.length - 1; i >= 0; i -= 1) {
    const raw = fenced[i]?.[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // continue
    }
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }

  return null;
}

function fallbackPlan(input: TaskDecomposerInput): TaskDecompositionPlan {
  const baseType = input.task.type;
  return {
    summary: `Fallback decomposition for ${input.task.id}`,
    children: [
      {
        localId: "plan",
        title: `Analyze and plan: ${input.task.title}`,
        description: `Map impacted modules, constraints, and acceptance criteria for ${input.task.title}.`,
        type: "research",
        priority: "high",
        dependsOnLocalIds: [],
        tags: ["decomposition", "planning"],
        relevantPaths: input.task.relevantPaths,
      },
      {
        localId: "implement",
        title: `Implement: ${input.task.title}`,
        description: `Execute the core implementation for ${input.task.title} according to the plan.`,
        type: toTaskType(baseType, "feature"),
        priority: "high",
        dependsOnLocalIds: ["plan"],
        tags: ["implementation"],
        relevantPaths: input.task.relevantPaths,
      },
      {
        localId: "verify",
        title: `Verify and harden: ${input.task.title}`,
        description: `Add or update tests/lint fixes and validate outcomes for ${input.task.title}.`,
        type: "test",
        priority: "medium",
        dependsOnLocalIds: ["implement"],
        tags: ["tests", "verification"],
        relevantPaths: input.task.relevantPaths,
      },
    ],
  };
}

function normalizePlan(
  raw: Record<string, unknown>,
  input: TaskDecomposerInput,
): TaskDecompositionPlan | null {
  const childrenRaw = raw.children;
  if (!Array.isArray(childrenRaw) || childrenRaw.length < 1) {
    return null;
  }

  const normalizedChildren: TaskDecompositionPlan["children"] = [];
  const localIds = new Set<string>();

  for (
    let index = 0;
    index < childrenRaw.length && normalizedChildren.length < DEFAULT_MAX_SUBTASKS;
    index += 1
  ) {
    const child = childrenRaw[index];
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      continue;
    }
    const row = child as Record<string, unknown>;
    const localId = typeof row.localId === "string" ? row.localId.trim() : `s${index + 1}`;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const description = typeof row.description === "string" ? row.description.trim() : "";
    if (!localId || !title || !description || localIds.has(localId)) {
      continue;
    }
    localIds.add(localId);

    const dependsOnLocalIds = Array.isArray(row.dependsOnLocalIds)
      ? [
          ...new Set(
            row.dependsOnLocalIds
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean),
          ),
        ]
      : [];
    const tags = Array.isArray(row.tags)
      ? [
          ...new Set(
            row.tags
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean),
          ),
        ]
      : undefined;
    const relevantPaths = Array.isArray(row.relevantPaths)
      ? [
          ...new Set(
            row.relevantPaths
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean),
          ),
        ]
      : undefined;

    normalizedChildren.push({
      localId,
      title,
      description,
      type: toTaskType(row.type, input.task.type),
      priority: toPriority(row.priority),
      dependsOnLocalIds,
      tags,
      relevantPaths,
    });
  }

  if (normalizedChildren.length < 1) {
    return null;
  }

  const allowed = new Set(normalizedChildren.map((entry) => entry.localId));
  for (const child of normalizedChildren) {
    child.dependsOnLocalIds = child.dependsOnLocalIds.filter(
      (entry) => entry !== child.localId && allowed.has(entry),
    );
  }

  const summary = typeof raw.summary === "string" ? raw.summary.trim() : null;
  return {
    summary: summary || null,
    children: normalizedChildren,
  };
}

function buildPlannerPrompt(input: TaskDecomposerInput, maxSubtasks: number): string {
  const relevantPaths =
    input.task.relevantPaths.length > 0
      ? input.task.relevantPaths.map((entry) => `- ${entry}`).join("\n")
      : "- (none)";

  return [
    "You are a lead software engineering planner.",
    "Return STRICT JSON only (no prose) with keys: summary, children.",
    "children must be an array of objects with:",
    "localId, title, description, type, priority, dependsOnLocalIds, optional tags, optional relevantPaths.",
    "Do not exceed max child count.",
    `maxChildren: ${maxSubtasks}`,
    "",
    `Task ID: ${input.task.id}`,
    `Task title: ${input.task.title}`,
    `Task type: ${input.task.type}`,
    `Task priority: ${input.task.priority}`,
    "Description:",
    input.task.description,
    "",
    "Relevant paths:",
    relevantPaths,
    "",
    "JSON only.",
  ].join("\n");
}

export type TaskDecomposerOptions = {
  config?: OpenClawConfig;
  loadCurrentConfig?: () => OpenClawConfig;
  maxSubtasks?: number;
  planner?: (input: TaskDecomposerInput, prompt: string) => Promise<string>;
};

export function createTaskDecomposer(options?: TaskDecomposerOptions): TaskDecomposer {
  const maxSubtasks = Math.max(
    1,
    Math.min(50, Math.floor(options?.maxSubtasks ?? DEFAULT_MAX_SUBTASKS)),
  );

  const runPlanner = async (
    input: TaskDecomposerInput,
    prompt: string,
  ): Promise<{ text: string; sessionId: string | null }> => {
    if (options?.planner) {
      return {
        text: await options.planner(input, prompt),
        sessionId: null,
      };
    }

    const cfg = options?.loadCurrentConfig?.() ?? options?.config ?? loadConfig();
    const sessionId = `task-decomposer-${randomUUID()}`;
    const sessionFile = resolveSessionTranscriptPath(sessionId, input.leadAgentId);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, input.leadAgentId);
    const run = await runEmbeddedPiAgent({
      sessionId,
      sessionKey: buildAgentMainSessionKey({
        agentId: input.leadAgentId,
        mainKey: "task-decomposer",
      }),
      agentId: input.leadAgentId,
      sessionFile,
      workspaceDir,
      config: cfg,
      prompt,
      timeoutMs: 90_000,
      runId: `task-decomposer:${input.teamId}:${input.task.id}`,
      disableMessageTool: true,
    });
    const text = (run.payloads ?? [])
      .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
    return {
      text,
      sessionId: run.meta.agentMeta?.sessionId?.trim() || null,
    };
  };

  return {
    decompose: async (input: TaskDecomposerInput): Promise<TaskDecomposerResult> => {
      const prompt = buildPlannerPrompt(input, maxSubtasks);
      try {
        const planned = await runPlanner(input, prompt);
        const parsed = parseJsonObject(planned.text);
        if (parsed) {
          const normalized = normalizePlan(parsed, input);
          if (normalized && normalized.children.length > 0) {
            return {
              plan: {
                ...normalized,
                children: normalized.children.slice(0, maxSubtasks),
              },
              plannerBackend: "embedded",
              plannerSessionId: planned.sessionId,
            };
          }
        }
      } catch {
        // planner fallback
      }

      return {
        plan: fallbackPlan(input),
        plannerBackend: "fallback",
        plannerSessionId: null,
      };
    },
  };
}
