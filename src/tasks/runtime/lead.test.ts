import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskAttemptRecord } from "../types.js";
import { createTaskService } from "../service.js";
import { attemptLooksClean, createTaskLead } from "./lead.js";

const tempDirs: string[] = [];

async function createTempDbPath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-task-lead-"));
  tempDirs.push(dir);
  return path.join(dir, "tasks.sqlite");
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function waitForMessageType(params: {
  service: ReturnType<typeof createTaskService>;
  receiverAgentId: string;
  messageType: string;
  timeoutMs?: number;
}) {
  const startedAt = Date.now();
  const timeoutMs = params.timeoutMs ?? 5_000;
  while (Date.now() - startedAt <= timeoutMs) {
    const deliveries = params.service.pullBusMessages({
      receiverAgentId: params.receiverAgentId,
      maxMessages: 20,
      visibilityTimeoutMs: 1_000,
    });
    for (const delivery of deliveries) {
      try {
        params.service.ackBusMessage({
          receiverAgentId: params.receiverAgentId,
          messageId: delivery.message.id,
          ackToken: delivery.ackToken,
        });
      } catch {
        // ignore
      }
      if (delivery.message.messageType === params.messageType) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${params.messageType}`);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("task lead runtime", () => {
  it("delegates ready team tasks to team members and publishes assignment bus messages", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({
      name: "Morpheus",
      leadAgentId: "lead-agent",
      settings: { decomposition: { auto: false } },
    });
    service.upsertTeamMember({ teamId: team.id, agentId: "member-agent", role: "member" });
    const project = service.createProject({ name: "Lead Runtime" });
    const task = service.createTask({
      projectId: project.id,
      teamId: team.id,
      title: "delegate me",
      description: "ready task",
      type: "feature",
      status: "backlog",
    });

    const lead = createTaskLead({
      taskService: service,
      teamId: team.id,
      teamName: team.name,
      leadAgentId: "lead-agent",
      pollMs: 20,
    });

    lead.start();
    await waitFor(() => service.getTask(task.id)?.assignedAgentId === "member-agent");

    const deliveries = service.pullBusMessages({
      receiverAgentId: "member-agent",
      maxMessages: 10,
      visibilityTimeoutMs: 30_000,
    });
    expect(deliveries.some((delivery) => delivery.message.messageType === "task:assign")).toBe(
      true,
    );

    await lead.stop();
    service.close();
  });

  it("reminds and escalates unresolved question threads on timeout", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({
      name: "Nebuchadnezzar",
      leadAgentId: "lead-agent",
      settings: { decomposition: { auto: false } },
    });
    service.upsertTeamMember({ teamId: team.id, agentId: "member-agent", role: "member" });

    const events: Array<{ reason: string; payload?: Record<string, unknown> }> = [];
    const lead = createTaskLead({
      taskService: service,
      teamId: team.id,
      teamName: team.name,
      leadAgentId: "lead-agent",
      pollMs: 20,
      questionReminderMs: 60,
      questionEscalationMs: 140,
      onEvent: (event) => {
        events.push({ reason: event.reason, payload: event.payload });
      },
    });
    lead.start();

    service.publishBusMessage({
      senderAgentId: "member-agent",
      receiverAgentId: "lead-agent",
      messageType: "question",
      body: "Need decision",
      dedupeKey: `question-${Date.now()}`,
    });

    // Wait for escalation event (proves reminder fired first, then escalation)
    await waitFor(() => events.some((e) => e.reason === "escalated"));

    // Verify escalation message reaches ares
    await waitForMessageType({
      service,
      receiverAgentId: "ares",
      messageType: "escalation",
    });

    await lead.stop();
    service.close();
  });

  it("auto-decomposes root tasks before delegation", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({
      name: "Architects",
      leadAgentId: "lead-agent",
      settings: { decomposition: { auto: true } },
    });
    const project = service.createProject({ name: "Auto Decompose" });
    const parent = service.createTask({
      projectId: project.id,
      teamId: team.id,
      title: "Build feature",
      description: "Need decomposition",
      type: "feature",
      status: "backlog",
    });

    const lead = createTaskLead({
      taskService: service,
      teamId: team.id,
      teamName: team.name,
      leadAgentId: "lead-agent",
      pollMs: 20,
      decomposer: {
        decompose: async () => ({
          plannerBackend: "test",
          plannerSessionId: "session-test",
          plan: {
            summary: "test plan",
            children: [
              {
                localId: "s1",
                title: "Implement",
                description: "Ship code",
                type: "feature",
                priority: "high",
                dependsOnLocalIds: [],
              },
              {
                localId: "s2",
                title: "Verify",
                description: "Run validation",
                type: "test",
                priority: "medium",
                dependsOnLocalIds: ["s1"],
              },
            ],
          },
        }),
      },
    });
    lead.start();

    await waitFor(() => service.listChildTasks(parent.id).length === 2);
    const parentAfter = service.getTask(parent.id);
    const run = service.getLatestDecompositionRun(parent.id);
    expect(parentAfter?.assignedAgentId).toBe("lead-agent");
    expect(run?.status).toBe("applied");

    await lead.stop();
    service.close();
  });

  it("marks parent blocked when a child hard-fails", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({
      name: "Sentinels",
      leadAgentId: "lead-agent",
      settings: { decomposition: { auto: false } },
    });
    const project = service.createProject({ name: "Parent Review" });
    const parent = service.createTask({
      projectId: project.id,
      teamId: team.id,
      title: "Parent",
      description: "Parent task",
      type: "feature",
      status: "backlog",
    });
    const childDone = service.createTask({
      projectId: project.id,
      teamId: team.id,
      parentTaskId: parent.id,
      title: "Child done",
      description: "done",
      type: "feature",
      status: "backlog",
    });
    const childFailed = service.createTask({
      projectId: project.id,
      teamId: team.id,
      parentTaskId: parent.id,
      title: "Child failed",
      description: "failed",
      type: "feature",
      status: "backlog",
    });
    service.setTaskStatus(childDone.id, "done");
    service.setTaskStatus(childFailed.id, "failed");

    const lead = createTaskLead({
      taskService: service,
      teamId: team.id,
      teamName: team.name,
      leadAgentId: "lead-agent",
      pollMs: 20,
    });
    lead.start();

    await waitFor(() => service.getTask(parent.id)?.status === "blocked");
    const latestReview = service.getLatestTaskReview(parent.id);
    expect(latestReview?.status).toBe("blocked");

    await lead.stop();
    service.close();
  });

  it("auto-answers questions when questionAnswerer is provided", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({
      name: "Oracle",
      leadAgentId: "lead-agent",
      settings: { decomposition: { auto: false } },
    });
    service.upsertTeamMember({ teamId: team.id, agentId: "member-agent", role: "member" });

    const answeredQuestions: string[] = [];
    const lead = createTaskLead({
      taskService: service,
      teamId: team.id,
      teamName: team.name,
      leadAgentId: "lead-agent",
      pollMs: 20,
      questionAnswerer: {
        answer: async (input) => {
          answeredQuestions.push(input.questionBody);
          return { answer: `The answer to "${input.questionBody}" is 42.` };
        },
      },
    });
    lead.start();

    service.publishBusMessage({
      senderAgentId: "member-agent",
      receiverAgentId: "lead-agent",
      messageType: "question",
      body: "Which library should I use?",
      dedupeKey: `q-${Date.now()}`,
    });

    // Wait for the answer to arrive at the worker
    await waitForMessageType({
      service,
      receiverAgentId: "member-agent",
      messageType: "context:provide",
    });

    expect(answeredQuestions).toContain("Which library should I use?");

    await lead.stop();
    service.close();
  });

  it("leaves question open when questionAnswerer fails", async () => {
    const dbPath = await createTempDbPath();
    const service = createTaskService({ dbPath });
    const team = service.createTeam({
      name: "Failsafe",
      leadAgentId: "lead-agent",
      settings: { decomposition: { auto: false } },
    });
    service.upsertTeamMember({ teamId: team.id, agentId: "member-agent", role: "member" });

    const events: Array<{ reason: string }> = [];
    const lead = createTaskLead({
      taskService: service,
      teamId: team.id,
      teamName: team.name,
      leadAgentId: "lead-agent",
      pollMs: 20,
      questionReminderMs: 60,
      questionEscalationMs: 140,
      questionAnswerer: {
        answer: async () => {
          throw new Error("LLM unavailable");
        },
      },
      onEvent: (event) => {
        events.push({ reason: event.reason });
      },
    });
    lead.start();

    service.publishBusMessage({
      senderAgentId: "member-agent",
      receiverAgentId: "lead-agent",
      messageType: "question",
      body: "Need help",
      dedupeKey: `q-fail-${Date.now()}`,
    });

    // Question answering fails → question thread stays open → escalation fires
    await waitFor(() => events.some((e) => e.reason === "escalated"));

    await lead.stop();
    service.close();
  });
});

// ---------------------------------------------------------------------------
// attemptLooksClean — pure unit tests (no DB needed)
// ---------------------------------------------------------------------------

function mockAttempt(overrides?: Partial<TaskAttemptRecord>): TaskAttemptRecord {
  return {
    id: "attempt-1",
    taskId: "task-1",
    status: "completed",
    startedAtMs: Date.now(),
    endedAtMs: Date.now(),
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

describe("attemptLooksClean", () => {
  it("returns false for null attempt", () => {
    expect(attemptLooksClean(null)).toBe(false);
  });

  it("returns false when status is not completed", () => {
    expect(attemptLooksClean(mockAttempt({ status: "running" }))).toBe(false);
    expect(attemptLooksClean(mockAttempt({ status: "failed" }))).toBe(false);
  });

  it("returns false when errorText is present", () => {
    const attempt = mockAttempt({
      errorText: "Something went wrong",
      testOutcome: { testsPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(false);
  });

  it("returns true when all three flags are true", () => {
    const attempt = mockAttempt({
      commandOutcome: { buildPassed: true, lintPassed: true },
      testOutcome: { testsPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(true);
  });

  it("returns true when testsPassed is true and build/lint are absent", () => {
    const attempt = mockAttempt({
      commandOutcome: {},
      testOutcome: { testsPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(true);
  });

  it("returns false when testsPassed is missing", () => {
    const attempt = mockAttempt({
      commandOutcome: { buildPassed: true, lintPassed: true },
      testOutcome: {},
    });
    expect(attemptLooksClean(attempt)).toBe(false);
  });

  it("returns false when testsPassed is false", () => {
    const attempt = mockAttempt({
      commandOutcome: { buildPassed: true, lintPassed: true },
      testOutcome: { testsPassed: false },
    });
    expect(attemptLooksClean(attempt)).toBe(false);
  });

  it("returns false when buildPassed is explicitly false", () => {
    const attempt = mockAttempt({
      commandOutcome: { buildPassed: false, lintPassed: true },
      testOutcome: { testsPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(false);
  });

  it("returns false when lintPassed is explicitly false", () => {
    const attempt = mockAttempt({
      commandOutcome: { buildPassed: true, lintPassed: false },
      testOutcome: { testsPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(false);
  });

  it("accepts testPassed as an alias for testsPassed", () => {
    const attempt = mockAttempt({
      testOutcome: { testPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(true);
  });

  it("accepts testsPassed in metrics as a fallback", () => {
    const attempt = mockAttempt({
      testOutcome: {},
      metrics: { testsPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(true);
  });

  it("treats whitespace-only errorText as no error", () => {
    const attempt = mockAttempt({
      errorText: "   ",
      testOutcome: { testsPassed: true },
    });
    expect(attemptLooksClean(attempt)).toBe(true);
  });
});
