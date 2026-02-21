import { describe, expect, it } from "vitest";
import type { LayeredMemoryResult } from "../../memory/layered-types.js";
import type { BusDeliveryRecord, ProjectRecord, TaskAttemptRecord, TaskRecord } from "../types.js";
import {
  buildRichTaskPrompt,
  extractOutcomeFlags,
  formatBusMessagesAsContext,
  formatMemoryResults,
} from "./executor-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBusDelivery(overrides: {
  messageType: string;
  body: string;
  subject?: string;
}): BusDeliveryRecord {
  return {
    ackToken: "tok",
    message: {
      id: "msg-1",
      senderAgentId: "lead-1",
      receiverAgentId: "worker-1",
      taskId: null,
      correlationId: null,
      replyToMessageId: null,
      messageType: overrides.messageType,
      subject: overrides.subject ?? null,
      body: overrides.body,
      payload: {},
      dedupeKey: null,
      state: "leased",
      deliveryCount: 1,
      maxDeliveries: 5,
      createdAtMs: Date.now(),
      availableAtMs: Date.now(),
      leasedAtMs: Date.now(),
      leaseExpiresAtMs: Date.now() + 30_000,
      ackedAtMs: null,
      expiresAtMs: null,
    },
  };
}

function makeMemoryResult(overrides: {
  scopeKind: "agent" | "project" | "team";
  snippet: string;
}): LayeredMemoryResult {
  return {
    path: "layered/test",
    startLine: 0,
    endLine: 0,
    score: 0.8,
    snippet: overrides.snippet,
    source: "memory",
    scopeKind: overrides.scopeKind,
    scopeId: "scope-1",
    rankScore: 0.5,
    freshnessBoost: 0.01,
    finalScore: 0.51,
  };
}

function makeTask(overrides?: Partial<TaskRecord>): TaskRecord {
  return {
    id: "task-1",
    projectId: "proj-1",
    teamId: "team-1",
    title: "Implement auth middleware",
    description: "Add JWT authentication middleware to the Express app.",
    type: "feature",
    priority: "high",
    status: "running",
    parentTaskId: null,
    assignedAgentId: "worker-1",
    maxAttempts: 3,
    currentAttemptId: "attempt-1",
    relevantPaths: ["src/middleware/auth.ts"],
    tags: ["auth"],
    dependsOnTaskIds: [],
    complexity: "medium",
    createdBy: "ares",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    startedAtMs: Date.now(),
    completedAtMs: null,
    archivedAtMs: null,
    gitBranch: null,
    ...overrides,
  };
}

function makeAttempt(overrides?: Partial<TaskAttemptRecord>): TaskAttemptRecord {
  return {
    id: "attempt-1",
    taskId: "task-1",
    status: "running",
    startedAtMs: Date.now(),
    endedAtMs: null,
    agentId: "worker-1",
    notes: null,
    attemptNumber: 1,
    claimId: null,
    teamId: "team-1",
    sessionBackend: null,
    sessionId: null,
    summary: null,
    errorText: null,
    commandOutcome: {},
    testOutcome: {},
    changedFiles: [],
    metrics: {},
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: formatBusMessagesAsContext
// ---------------------------------------------------------------------------

describe("formatBusMessagesAsContext", () => {
  it("returns null for empty deliveries", () => {
    expect(formatBusMessagesAsContext([])).toBeNull();
  });

  it("formats a context:provide message with lead answer label", () => {
    const deliveries = [
      makeBusDelivery({
        messageType: "context:provide",
        subject: "auth library",
        body: "Use jose for JWT tokens.",
      }),
    ];
    const result = formatBusMessagesAsContext(deliveries);
    expect(result).toBe("Lead answer (auth library): Use jose for JWT tokens.");
  });

  it("formats a directive message", () => {
    const deliveries = [
      makeBusDelivery({
        messageType: "directive",
        body: "Use adapter pattern instead.",
      }),
    ];
    const result = formatBusMessagesAsContext(deliveries);
    expect(result).toBe("Lead directive: Use adapter pattern instead.");
  });

  it("formats multiple messages separated by newlines", () => {
    const deliveries = [
      makeBusDelivery({ messageType: "context:provide", body: "Answer 1" }),
      makeBusDelivery({ messageType: "task:assign", body: "Your next task" }),
    ];
    const result = formatBusMessagesAsContext(deliveries);
    expect(result).toContain("Lead answer: Answer 1");
    expect(result).toContain("[task:assign]: Your next task");
    expect(result!.split("\n")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: formatMemoryResults
// ---------------------------------------------------------------------------

describe("formatMemoryResults", () => {
  it("returns null for empty results", () => {
    expect(formatMemoryResults([])).toBeNull();
  });

  it("labels results by scope", () => {
    const results = [
      makeMemoryResult({ scopeKind: "agent", snippet: "Always use pnpm." }),
      makeMemoryResult({ scopeKind: "project", snippet: "Express 4 with TypeScript." }),
      makeMemoryResult({ scopeKind: "team", snippet: "Run lint before commit." }),
    ];
    const formatted = formatMemoryResults(results)!;
    expect(formatted).toContain("[Agent memory] Always use pnpm.");
    expect(formatted).toContain("[Project memory] Express 4 with TypeScript.");
    expect(formatted).toContain("[Team memory] Run lint before commit.");
  });

  it("separates results with double newlines", () => {
    const results = [
      makeMemoryResult({ scopeKind: "project", snippet: "First" }),
      makeMemoryResult({ scopeKind: "team", snippet: "Second" }),
    ];
    const formatted = formatMemoryResults(results)!;
    expect(formatted).toBe("[Project memory] First\n\n[Team memory] Second");
  });
});

// ---------------------------------------------------------------------------
// Tests: extractOutcomeFlags
// ---------------------------------------------------------------------------

describe("extractOutcomeFlags", () => {
  it("extracts all three boolean flags from a JSON report", () => {
    const text = [
      "Done. Here is the report:",
      "```json",
      '{ "status": "success", "buildPassed": true, "lintPassed": true, "testsPassed": true }',
      "```",
    ].join("\n");
    const { commandOutcomePatch, testOutcomePatch } = extractOutcomeFlags(text);
    expect(commandOutcomePatch).toEqual({ buildPassed: true, lintPassed: true });
    expect(testOutcomePatch).toEqual({ testsPassed: true });
  });

  it("extracts false values correctly", () => {
    const text = [
      "```json",
      '{ "status": "failed", "buildPassed": false, "lintPassed": false, "testsPassed": false }',
      "```",
    ].join("\n");
    const { commandOutcomePatch, testOutcomePatch } = extractOutcomeFlags(text);
    expect(commandOutcomePatch).toEqual({ buildPassed: false, lintPassed: false });
    expect(testOutcomePatch).toEqual({ testsPassed: false });
  });

  it("returns empty patches when no JSON block found", () => {
    const { commandOutcomePatch, testOutcomePatch } = extractOutcomeFlags("No report here.");
    expect(commandOutcomePatch).toEqual({});
    expect(testOutcomePatch).toEqual({});
  });

  it("skips non-boolean flag values", () => {
    const text = [
      "```json",
      '{ "status": "success", "buildPassed": "yes", "testsPassed": 1 }',
      "```",
    ].join("\n");
    const { commandOutcomePatch, testOutcomePatch } = extractOutcomeFlags(text);
    expect(commandOutcomePatch).toEqual({});
    expect(testOutcomePatch).toEqual({});
  });

  it("uses the last JSON block when multiple exist", () => {
    const text = [
      "```json",
      '{ "buildPassed": false, "testsPassed": false }',
      "```",
      "Actually, I fixed it:",
      "```json",
      '{ "buildPassed": true, "testsPassed": true, "lintPassed": true }',
      "```",
    ].join("\n");
    const { commandOutcomePatch, testOutcomePatch } = extractOutcomeFlags(text);
    expect(commandOutcomePatch).toEqual({ buildPassed: true, lintPassed: true });
    expect(testOutcomePatch).toEqual({ testsPassed: true });
  });
});

// ---------------------------------------------------------------------------
// Tests: buildRichTaskPrompt
// ---------------------------------------------------------------------------

describe("buildRichTaskPrompt", () => {
  const baseProject: ProjectRecord = {
    id: "proj-1",
    name: "MyApp",
    repoRoot: "/home/dev/myapp",
    buildCmd: "pnpm build",
    testCmd: "pnpm test",
    lintCmd: "pnpm check",
    language: "typescript",
    framework: "express",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    archivedAtMs: null,
  };

  it("includes project context in the prompt", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain("/home/dev/myapp");
    expect(prompt).toContain("pnpm build");
    expect(prompt).toContain("pnpm test");
    expect(prompt).toContain("pnpm check");
    expect(prompt).toContain("typescript");
    expect(prompt).toContain("express");
  });

  it("uses fallback values when project is null", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: null,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain("(use current directory)");
    expect(prompt).toContain("(auto-detect)");
  });

  it("includes task description and metadata", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain("Implement auth middleware");
    expect(prompt).toContain("Add JWT authentication middleware");
    expect(prompt).toContain("feature");
    expect(prompt).toContain("high");
    expect(prompt).toContain("src/middleware/auth.ts");
  });

  it("includes previous attempt summary when provided", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt({ attemptNumber: 2 }),
      project: baseProject,
      previousAttemptSummary: "Failed: missing jose dependency.",
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain("## Previous Attempt");
    expect(prompt).toContain("Failed: missing jose dependency.");
    expect(prompt).toContain("do not repeat the same approach");
  });

  it("excludes previous attempt section when null", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).not.toContain("## Previous Attempt");
  });

  it("includes bus context from lead when provided", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: "Lead answer: Use jose for JWT tokens.",
      memoryContext: null,
    });
    expect(prompt).toContain("## Context from Lead");
    expect(prompt).toContain("Use jose for JWT tokens.");
  });

  it("includes memory context when provided", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: "[Project memory] Always use middleware pattern.",
    });
    expect(prompt).toContain("## Lessons Learned (Team Memory)");
    expect(prompt).toContain("Always use middleware pattern.");
  });

  it("includes JSON report instructions with boolean fields", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain('"buildPassed"');
    expect(prompt).toContain('"lintPassed"');
    expect(prompt).toContain('"testsPassed"');
  });

  it("shows attempt number in task section", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask({ maxAttempts: 3 }),
      attempt: makeAttempt({ attemptNumber: 2 }),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain("Attempt: 2 / 3");
  });

  it("includes agent id in the header", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "impl-alpha",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain('agent "impl-alpha"');
  });

  it("includes communication instructions for asking questions", () => {
    const prompt = buildRichTaskPrompt({
      agentId: "worker-1",
      task: makeTask(),
      attempt: makeAttempt(),
      project: baseProject,
      previousAttemptSummary: null,
      busContext: null,
      memoryContext: null,
    });
    expect(prompt).toContain("## Communication");
    expect(prompt).toContain("blocked or need clarification");
    expect(prompt).toContain("question");
  });
});
