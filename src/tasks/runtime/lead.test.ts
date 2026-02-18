import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTaskService } from "../service.js";
import { createTaskLead } from "./lead.js";

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
    const team = service.createTeam({ name: "Morpheus", leadAgentId: "lead-agent" });
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
    const team = service.createTeam({ name: "Nebuchadnezzar", leadAgentId: "lead-agent" });
    service.upsertTeamMember({ teamId: team.id, agentId: "member-agent", role: "member" });

    const lead = createTaskLead({
      taskService: service,
      teamId: team.id,
      teamName: team.name,
      leadAgentId: "lead-agent",
      pollMs: 20,
      questionReminderMs: 60,
      questionEscalationMs: 140,
    });
    lead.start();

    service.publishBusMessage({
      senderAgentId: "member-agent",
      receiverAgentId: "lead-agent",
      messageType: "question",
      body: "Need decision",
      dedupeKey: `question-${Date.now()}`,
    });

    await waitForMessageType({
      service,
      receiverAgentId: "member-agent",
      messageType: "context:provide",
    });

    await waitForMessageType({
      service,
      receiverAgentId: "ares",
      messageType: "escalation",
    });

    await lead.stop();
    service.close();
  });
});
