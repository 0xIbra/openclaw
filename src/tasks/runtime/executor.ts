import type { TaskExecutionResult } from "./types.js";

function parseJsonReportBlock(text: string): Record<string, unknown> | null {
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
      // Try the next candidate.
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function buildExecutionResultFromOutput(params: {
  text: string;
  fallbackSummary?: string;
  session?: {
    backend?: string | null;
    id?: string | null;
  };
  didFail?: boolean;
  errorText?: string;
}): TaskExecutionResult {
  const report = parseJsonReportBlock(params.text);
  const summaryFromOutput = params.fallbackSummary?.trim() || params.text.trim();
  const safeSummary =
    ((report ? asString(report.summary) : null) ?? summaryFromOutput) || "Task run";
  const reportStatus = report ? asString(report.status)?.toLowerCase() : null;
  const finalFailed = params.didFail === true || reportStatus === "failed";
  const resultBase = {
    summary: safeSummary,
    notes: report ? asString(report.notes) : null,
    changedFiles: report ? asStringArray(report.changedFiles) : [],
    commandOutcome: report ? asObject(report.commandOutcome) : {},
    testOutcome: report ? asObject(report.testOutcome) : {},
    metrics: report ? asObject(report.metrics) : {},
    session: params.session,
  };

  if (!finalFailed) {
    return {
      status: "success",
      ...resultBase,
    };
  }

  return {
    status: "failed",
    ...resultBase,
    errorText:
      params.errorText?.trim() ||
      (report ? asString(report.errorText) : null) ||
      "Execution failed",
  };
}
