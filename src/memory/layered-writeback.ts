import type { OpenClawConfig } from "../config/config.js";
import type { LayeredMemoryScopeRef, LayeredMemoryWriteEntry } from "./layered-types.js";
import { scrubText } from "../secrets/scrub-middleware.js";
import { hashText } from "./internal.js";
import { resolveLayeredScopes } from "./layered-manager.js";
import {
  ensureLayeredScopeWorkspace,
  resolveLayeredMemoryRoot,
  writeLayeredScopeEntry,
} from "./layered-paths.js";

const LAYERED_WRITEBACK_METRICS = {
  events: 0,
  writes: 0,
  failures: 0,
};

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) {
    return [];
  }
  return [...new Set(tags.map((entry) => entry.trim()).filter(Boolean))];
}

function toMarkdown(params: {
  scope: { kind: string; id: string };
  entry: LayeredMemoryWriteEntry;
  dedupeKey: string;
  occurredAtMs: number;
}): string {
  const changedFiles = params.entry.changedFiles?.length
    ? params.entry.changedFiles.map((entry) => `- ${entry}`).join("\n")
    : "- (none)";
  const tags = normalizeTags(params.entry.resolutionTags);
  const tagsText = tags.length > 0 ? tags.map((entry) => `- ${entry}`).join("\n") : "- (none)";
  const summary = scrubText(params.entry.summary, { context: "memory" });
  const errorText = scrubText(params.entry.errorText ?? "", { context: "memory" });
  return [
    `# Layered Memory Entry`,
    "",
    `- scope: ${params.scope.kind}:${params.scope.id}`,
    `- eventType: ${params.entry.eventType}`,
    `- taskId: ${params.entry.taskId ?? "none"}`,
    `- attemptId: ${params.entry.attemptId ?? "none"}`,
    `- dedupeKey: ${params.dedupeKey}`,
    `- occurredAtMs: ${params.occurredAtMs}`,
    "",
    "## Summary",
    summary || "(empty)",
    "",
    "## Root Cause",
    errorText || "(none)",
    "",
    "## Changed Files",
    changedFiles,
    "",
    "## Resolution Tags",
    tagsText,
    "",
    "## Test Outcome",
    "```json",
    scrubText(stringifyJson(params.entry.testOutcome ?? {}), { context: "memory" }),
    "```",
    "",
    "## Metadata",
    "```json",
    scrubText(stringifyJson(params.entry.metadata ?? {}), { context: "memory" }),
    "```",
    "",
  ].join("\n");
}

export function getLayeredMemoryWritebackMetrics(): {
  events: number;
  writes: number;
  failures: number;
} {
  return { ...LAYERED_WRITEBACK_METRICS };
}

export async function writeLayeredMemoryEntry(params: {
  cfg: OpenClawConfig;
  scopeRef: LayeredMemoryScopeRef;
  entry: LayeredMemoryWriteEntry;
}): Promise<string[]> {
  LAYERED_WRITEBACK_METRICS.events += 1;
  const occurredAtMs = params.entry.occurredAtMs ?? Date.now();
  const rootDir = resolveLayeredMemoryRoot(params.cfg);
  const dedupeKey = `${params.entry.taskId ?? "no-task"}:${params.entry.attemptId ?? "none"}:${params.entry.eventType}`;
  const entryId = hashText(dedupeKey);
  const scopes = resolveLayeredScopes({
    cfg: params.cfg,
    agentId: params.scopeRef.agentId,
    projectId: params.scopeRef.projectId,
    teamId: params.scopeRef.teamId,
  });
  const written: string[] = [];
  for (const scope of scopes) {
    try {
      await ensureLayeredScopeWorkspace({
        rootDir,
        scopeKind: scope.kind,
        scopeId: scope.id,
      });
      const markdown = toMarkdown({
        scope: { kind: scope.kind, id: scope.id },
        entry: params.entry,
        dedupeKey,
        occurredAtMs,
      });
      const target = await writeLayeredScopeEntry({
        rootDir,
        scopeKind: scope.kind,
        scopeId: scope.id,
        entryId,
        atMs: occurredAtMs,
        markdown,
      });
      written.push(target);
      LAYERED_WRITEBACK_METRICS.writes += 1;
    } catch {
      LAYERED_WRITEBACK_METRICS.failures += 1;
    }
  }
  return written;
}
