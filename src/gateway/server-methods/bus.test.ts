import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandler } from "./types.js";
import { createTaskService } from "../../tasks/service.js";
import { busHandlers } from "./bus.js";

const tempDirs: string[] = [];

async function createFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-bus-method-"));
  tempDirs.push(dir);
  const taskService = createTaskService({ dbPath: path.join(dir, "tasks.sqlite") });
  const broadcasts: Array<{ event: string; payload: unknown }> = [];
  const context = {
    taskService,
    broadcast: (event: string, payload: unknown) => {
      broadcasts.push({ event, payload });
    },
  };
  const respond = vi.fn();
  return { context, respond, broadcasts, taskService };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function callMethod(params: {
  handler: GatewayRequestHandler;
  method: string;
  payload: Record<string, unknown>;
  respond: ReturnType<typeof vi.fn>;
  context: {
    taskService: ReturnType<typeof createTaskService>;
    broadcast: (event: string, payload: unknown) => void;
  };
}) {
  return Promise.resolve(
    params.handler({
      params: params.payload,
      respond: params.respond,
      context: params.context as never,
      client: null,
      req: { type: "req", id: params.method, method: params.method },
      isWebchatConnect: () => false,
    }),
  );
}

describe("gateway bus handlers", () => {
  it("supports publish, pull, and ack", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: busHandlers["bus.publish"],
      method: "bus.publish",
      payload: {
        senderAgentId: "agent-a",
        receiverAgentId: "agent-b",
        messageType: "task.question",
        body: "Need clarification",
      },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        messageId: expect.any(String),
        deduped: false,
      }),
      undefined,
    );
    expect(fixture.broadcasts.some((entry) => entry.event === "bus.message")).toBe(true);

    fixture.respond.mockClear();
    await callMethod({
      handler: busHandlers["bus.pull"],
      method: "bus.pull",
      payload: { receiverAgentId: "agent-b", visibilityTimeoutMs: 5000 },
      respond: fixture.respond,
      context: fixture.context,
    });
    const deliveries = (
      fixture.respond.mock.calls[0]?.[1] as
        | { deliveries?: Array<{ message: { id: string }; ackToken: string }> }
        | undefined
    )?.deliveries;
    expect(deliveries?.length).toBe(1);

    fixture.respond.mockClear();
    await callMethod({
      handler: busHandlers["bus.ack"],
      method: "bus.ack",
      payload: {
        receiverAgentId: "agent-b",
        messageId: deliveries?.[0]?.message.id,
        ackToken: deliveries?.[0]?.ackToken,
      },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        message: expect.objectContaining({ state: "acked", receiverAgentId: "agent-b" }),
      }),
      undefined,
    );

    fixture.taskService.close();
  });

  it("redelivers after lease timeout and dedupes by receiver/dedupeKey", async () => {
    const fixture = await createFixture();

    await callMethod({
      handler: busHandlers["bus.publish"],
      method: "bus.publish",
      payload: {
        senderAgentId: "agent-a",
        receiverAgentId: "agent-b",
        messageType: "task.status",
        body: "Update",
        dedupeKey: "same-msg",
      },
      respond: fixture.respond,
      context: fixture.context,
    });
    const firstMessageId = (
      fixture.respond.mock.calls[0]?.[1] as { messageId?: string } | undefined
    )?.messageId as string;

    fixture.respond.mockClear();
    await callMethod({
      handler: busHandlers["bus.publish"],
      method: "bus.publish",
      payload: {
        senderAgentId: "agent-a",
        receiverAgentId: "agent-b",
        messageType: "task.status",
        body: "Update again",
        dedupeKey: "same-msg",
      },
      respond: fixture.respond,
      context: fixture.context,
    });
    expect(fixture.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ messageId: firstMessageId, deduped: true }),
      undefined,
    );

    fixture.respond.mockClear();
    await callMethod({
      handler: busHandlers["bus.pull"],
      method: "bus.pull",
      payload: { receiverAgentId: "agent-b", visibilityTimeoutMs: 30 },
      respond: fixture.respond,
      context: fixture.context,
    });
    const firstDelivery = (
      fixture.respond.mock.calls[0]?.[1] as
        | { deliveries?: Array<{ message: { id: string; deliveryCount: number } }> }
        | undefined
    )?.deliveries?.[0];
    expect(firstDelivery?.message.id).toBe(firstMessageId);
    expect(firstDelivery?.message.deliveryCount).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 40));
    fixture.respond.mockClear();
    await callMethod({
      handler: busHandlers["bus.pull"],
      method: "bus.pull",
      payload: { receiverAgentId: "agent-b", visibilityTimeoutMs: 30 },
      respond: fixture.respond,
      context: fixture.context,
    });
    const secondDelivery = (
      fixture.respond.mock.calls[0]?.[1] as
        | { deliveries?: Array<{ message: { id: string; deliveryCount: number } }> }
        | undefined
    )?.deliveries?.[0];
    expect(secondDelivery?.message.id).toBe(firstMessageId);
    expect(secondDelivery?.message.deliveryCount).toBe(2);

    fixture.taskService.close();
  });
});
