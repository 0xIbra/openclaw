/**
 * Context-building helpers for the task executor.
 *
 * Responsible for:
 * - Formatting bus messages as readable prompt context
 * - Formatting layered memory results
 * - Building the rich task execution prompt (SPEC §9.2)
 * - Extracting boolean outcome flags from JSON reports
 */

import type { LayeredMemoryResult } from "../../memory/layered-types.js";
import type { BusDeliveryRecord, ProjectRecord, TaskAttemptRecord, TaskRecord } from "../types.js";
import { parseJsonReportBlock } from "./executor.js";

// ---------------------------------------------------------------------------
// Bus message formatting
// ---------------------------------------------------------------------------

export function formatBusMessagesAsContext(deliveries: BusDeliveryRecord[]): string | null {
  if (deliveries.length === 0) {
    return null;
  }
  const lines: string[] = [];
  for (const { message } of deliveries) {
    const label =
      message.messageType === "context:provide"
        ? "Lead answer"
        : message.messageType === "directive"
          ? "Lead directive"
          : `[${message.messageType}]`;
    const subject = message.subject?.trim() ? ` (${message.subject.trim()})` : "";
    lines.push(`${label}${subject}: ${message.body.trim()}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Memory result formatting
// ---------------------------------------------------------------------------

const SCOPE_LABEL: Record<string, string> = {
  agent: "Agent memory",
  project: "Project memory",
  team: "Team memory",
};

export function formatMemoryResults(results: LayeredMemoryResult[]): string | null {
  if (results.length === 0) {
    return null;
  }
  return results
    .map((r) => {
      const label = SCOPE_LABEL[r.scopeKind] ?? r.scopeKind;
      return `[${label}] ${r.snippet.trim()}`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Outcome flag extraction
// ---------------------------------------------------------------------------

export function extractOutcomeFlags(text: string): {
  commandOutcomePatch: Record<string, unknown>;
  testOutcomePatch: Record<string, unknown>;
} {
  const report = parseJsonReportBlock(text);
  if (!report) {
    return { commandOutcomePatch: {}, testOutcomePatch: {} };
  }

  const commandOutcomePatch: Record<string, unknown> = {};
  const testOutcomePatch: Record<string, unknown> = {};

  if (typeof report.buildPassed === "boolean") {
    commandOutcomePatch.buildPassed = report.buildPassed;
  }
  if (typeof report.lintPassed === "boolean") {
    commandOutcomePatch.lintPassed = report.lintPassed;
  }
  if (typeof report.testsPassed === "boolean") {
    testOutcomePatch.testsPassed = report.testsPassed;
  }

  return { commandOutcomePatch, testOutcomePatch };
}

// ---------------------------------------------------------------------------
// Setup guidance builder
// ---------------------------------------------------------------------------

function buildSetupGuidance(project: ProjectRecord | null): string {
  const lang = project?.language ?? null;
  const repo = project?.repoRoot ?? null;

  const lines: string[] = ["## Workflow"];

  // Step 1: Navigate to repo
  if (repo) {
    lines.push(`1. cd into the repo: \`cd ${repo}\``);
  } else {
    lines.push("1. Identify the project directory and cd into it.");
  }

  // Step 2: Install dependencies (language-aware)
  if (lang === "rust") {
    lines.push("2. Dependencies install automatically on build. Run `cargo build` to verify.");
  } else if (lang === "python") {
    lines.push(
      "2. Install dependencies: `pip install -e .` or `pip install -r requirements.txt` (check which exists).",
    );
  } else if (lang === "php") {
    lines.push("2. Install dependencies: `composer install`.");
  } else if (lang === "go") {
    lines.push("2. Dependencies install automatically. Run `go mod download` if needed.");
  } else if (lang === "typescript" || lang === "javascript") {
    const pm = project?.buildCmd?.split(" ")[0] ?? project?.testCmd?.split(" ")[0] ?? "npm";
    lines.push(
      `2. Install dependencies: \`${pm} install\` (check for lock file to identify the package manager).`,
    );
  } else {
    lines.push(
      "2. Check for package.json / requirements.txt / Cargo.toml / composer.json / go.mod and install dependencies with the appropriate package manager.",
    );
  }

  // Step 3-5: Common workflow
  lines.push("3. Read existing code before making changes — understand patterns and conventions.");
  lines.push(
    `4. After changes, run the build: \`${project?.buildCmd ?? "(auto-detect from repo)"}\`.`,
  );
  lines.push(
    `5. Run tests: \`${project?.testCmd ?? "(auto-detect from repo)"}\`. Fix any failures.`,
  );
  if (project?.lintCmd) {
    lines.push(`6. Run lint: \`${project.lintCmd}\`. Fix any issues.`);
  } else {
    lines.push("6. Run the linter if one is configured. Fix any issues.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Rich task prompt builder
// ---------------------------------------------------------------------------

export type RichTaskPromptParams = {
  agentId: string;
  task: TaskRecord;
  attempt: TaskAttemptRecord;
  project: ProjectRecord | null;
  previousAttemptSummary: string | null;
  busContext: string | null;
  memoryContext: string | null;
};

export function buildRichTaskPrompt(params: RichTaskPromptParams): string {
  const { agentId, task, attempt, project, previousAttemptSummary, busContext, memoryContext } =
    params;

  const relevantPaths =
    task.relevantPaths.length > 0
      ? task.relevantPaths.map((entry) => `- ${entry}`).join("\n")
      : "- (none)";

  const dependencies =
    task.dependsOnTaskIds.length > 0
      ? task.dependsOnTaskIds.map((entry) => `- ${entry}`).join("\n")
      : "- (none)";

  const sections: string[] = [];

  // Header
  sections.push(`You are agent "${agentId}" executing task "${task.title}" (${task.id}).`);

  // Project context
  sections.push(
    [
      "## Project Context",
      `- Repo path: ${project?.repoRoot ?? "(use current directory)"}`,
      `- Language: ${project?.language ?? "(auto-detect)"}`,
      `- Framework: ${project?.framework ?? "(auto-detect)"}`,
      `- Build cmd: ${project?.buildCmd ?? "(auto-detect from repo)"}`,
      `- Test cmd: ${project?.testCmd ?? "(auto-detect from repo)"}`,
      `- Lint cmd: ${project?.lintCmd ?? "(auto-detect from repo)"}`,
    ].join("\n"),
  );

  // Task metadata
  sections.push(
    [
      "## Task",
      `- ID: ${task.id}`,
      `- Type: ${task.type}`,
      `- Priority: ${task.priority}`,
      `- Attempt: ${attempt.attemptNumber ?? 1} / ${task.maxAttempts}`,
    ].join("\n"),
  );

  // Description
  sections.push(`## Description\n${task.description}`);

  // Relevant paths
  sections.push(`## Relevant Paths\n${relevantPaths}`);

  // Dependencies
  sections.push(`## Dependencies\n${dependencies}`);

  // Previous attempt (conditional)
  if (previousAttemptSummary) {
    sections.push(
      `## Previous Attempt\n${previousAttemptSummary}\n\nFocus on the error above and do not repeat the same approach.`,
    );
  }

  // Context from lead (conditional)
  if (busContext) {
    sections.push(`## Context from Lead\n${busContext}`);
  }

  // Memory lessons (conditional)
  if (memoryContext) {
    sections.push(`## Lessons Learned (Team Memory)\n${memoryContext}`);
  }

  // Communication instructions
  sections.push(
    [
      "## Communication",
      "If you are blocked or need clarification from the team lead:",
      `1. Use the tasks tool with action "askQuestion": senderAgentId="${agentId}", receiverAgentId=<lead agent id from your team>, body=<your question>, taskId="${task.id}".`,
      "2. Continue with your best guess if the question is non-critical.",
      "3. The lead's answer will appear as context in your next task attempt if not answered inline.",
    ].join("\n"),
  );

  // Setup & workflow
  sections.push(buildSetupGuidance(project));

  // Instructions and JSON report format
  sections.push(
    [
      "## Instructions",
      "Do the implementation work. When done, end your response with a JSON report in a fenced ```json block:",
      "```json",
      "{",
      '  "status": "success" | "failed",',
      '  "summary": "one-sentence completion summary",',
      '  "notes": "optional multi-line details",',
      '  "changedFiles": ["path/to/file"],',
      '  "buildPassed": true | false,',
      '  "lintPassed": true | false,',
      '  "testsPassed": true | false,',
      '  "commandOutcome": { "buildCmd": "...", "exitCode": 0 },',
      '  "testOutcome": { "passed": 12, "failed": 0, "skipped": 2 },',
      '  "metrics": { "durationMs": 12000 },',
      '  "errorText": "required only when status=failed"',
      "}",
      "```",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
