import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { telegramOutbound } from "../../channels/plugins/outbound/telegram.js";
import { STATE_DIR } from "../../config/paths.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";

const mocks = vi.hoisted(() => ({
  appendAssistantMessageToSessionTranscript: vi.fn(async () => ({ ok: true, sessionFile: "x" })),
}));
const hookMocks = vi.hoisted(() => ({
  runner: {
    hasHooks: vi.fn(() => false),
    runMessageSent: vi.fn(async () => {}),
  },
}));
const queueMocks = vi.hoisted(() => ({
  enqueueDelivery: vi.fn(async () => "mock-queue-id"),
  ackDelivery: vi.fn(async () => {}),
  failDelivery: vi.fn(async () => {}),
}));

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>(
    "../../config/sessions.js",
  );
  return {
    ...actual,
    appendAssistantMessageToSessionTranscript: mocks.appendAssistantMessageToSessionTranscript,
  };
});
vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => hookMocks.runner,
}));
vi.mock("./delivery-queue.js", () => ({
  enqueueDelivery: queueMocks.enqueueDelivery,
  ackDelivery: queueMocks.ackDelivery,
  failDelivery: queueMocks.failDelivery,
}));

const { deliverOutboundPayloads, normalizeOutboundPayloads } = await import("./deliver.js");

const telegramChunkConfig: OpenClawConfig = {
  channels: { telegram: { botToken: "tok-1", textChunkLimit: 2 } },
};

describe("deliverOutboundPayloads", () => {
  beforeEach(() => {
    setActivePluginRegistry(defaultRegistry);
    hookMocks.runner.hasHooks.mockReset();
    hookMocks.runner.hasHooks.mockReturnValue(false);
    hookMocks.runner.runMessageSent.mockReset();
    hookMocks.runner.runMessageSent.mockResolvedValue(undefined);
    queueMocks.enqueueDelivery.mockReset();
    queueMocks.enqueueDelivery.mockResolvedValue("mock-queue-id");
    queueMocks.ackDelivery.mockReset();
    queueMocks.ackDelivery.mockResolvedValue(undefined);
    queueMocks.failDelivery.mockReset();
    queueMocks.failDelivery.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });
  it("chunks telegram markdown and passes through accountId", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "";
    try {
      const results = await deliverOutboundPayloads({
        cfg: telegramChunkConfig,
        channel: "telegram",
        to: "123",
        payloads: [{ text: "abcd" }],
        deps: { sendTelegram },
      });

      expect(sendTelegram).toHaveBeenCalledTimes(2);
      for (const call of sendTelegram.mock.calls) {
        expect(call[2]).toEqual(
          expect.objectContaining({ accountId: undefined, verbose: false, textMode: "html" }),
        );
      }
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ channel: "telegram", chatId: "c1" });
    } finally {
      if (prevTelegramToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
      }
    }
  });

  it("passes explicit accountId to sendTelegram", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverOutboundPayloads({
      cfg: telegramChunkConfig,
      channel: "telegram",
      to: "123",
      accountId: "default",
      payloads: [{ text: "hi" }],
      deps: { sendTelegram },
    });

    expect(sendTelegram).toHaveBeenCalledWith(
      "123",
      "hi",
      expect.objectContaining({ accountId: "default", verbose: false, textMode: "html" }),
    );
  });

  it("scopes media local roots to the active agent workspace when agentId is provided", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverOutboundPayloads({
      cfg: telegramChunkConfig,
      channel: "telegram",
      to: "123",
      agentId: "work",
      payloads: [{ text: "hi", mediaUrl: "file:///tmp/f.png" }],
      deps: { sendTelegram },
    });

    expect(sendTelegram).toHaveBeenCalledWith(
      "123",
      "hi",
      expect.objectContaining({
        mediaUrl: "file:///tmp/f.png",
        mediaLocalRoots: expect.arrayContaining([path.join(STATE_DIR, "workspace-work")]),
      }),
    );
  });

  it("preserves fenced blocks for markdown chunkers in newline mode", async () => {
    const chunker = vi.fn((text: string) => (text ? [text] : []));
    const sendText = vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
      channel: "matrix" as const,
      messageId: text,
      roomId: "r1",
    }));
    const sendMedia = vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
      channel: "matrix" as const,
      messageId: text,
      roomId: "r1",
    }));
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: {
              deliveryMode: "direct",
              chunker,
              chunkerMode: "markdown",
              textChunkLimit: 4000,
              sendText,
              sendMedia,
            },
          }),
        },
      ]),
    );

    const cfg: OpenClawConfig = {
      channels: { matrix: { textChunkLimit: 4000, chunkMode: "newline" } },
    };
    const text = "```js\nconst a = 1;\nconst b = 2;\n```\nAfter";

    await deliverOutboundPayloads({
      cfg,
      channel: "matrix",
      to: "!room",
      payloads: [{ text }],
    });

    expect(chunker).toHaveBeenCalledTimes(1);
    expect(chunker).toHaveBeenNthCalledWith(1, text, 4000);
  });

  it("normalizes payloads and drops empty entries", () => {
    const normalized = normalizeOutboundPayloads([
      { text: "hi" },
      { text: "MEDIA:https://x.test/a.jpg" },
      { text: " ", mediaUrls: [] },
    ]);
    expect(normalized).toEqual([
      { text: "hi", mediaUrls: [] },
      { text: "", mediaUrls: ["https://x.test/a.jpg"] },
    ]);
  });

  it("continues on errors when bestEffort is enabled", async () => {
    const sendTelegram = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ messageId: "m2", chatId: "c2" });
    const onError = vi.fn();
    const cfg: OpenClawConfig = {};

    const results = await deliverOutboundPayloads({
      cfg,
      channel: "telegram",
      to: "123",
      payloads: [{ text: "a" }, { text: "b" }],
      deps: { sendTelegram },
      bestEffort: true,
      onError,
    });

    expect(sendTelegram).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ channel: "telegram", messageId: "m2", chatId: "c2" }]);
  });

  it("calls failDelivery instead of ackDelivery on bestEffort partial failure", async () => {
    const sendTelegram = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ messageId: "m2", chatId: "c2" });
    const onError = vi.fn();
    const cfg: OpenClawConfig = {};

    await deliverOutboundPayloads({
      cfg,
      channel: "telegram",
      to: "123",
      payloads: [{ text: "a" }, { text: "b" }],
      deps: { sendTelegram },
      bestEffort: true,
      onError,
    });

    // onError was called for the first payload's failure.
    expect(onError).toHaveBeenCalledTimes(1);

    // Queue entry should NOT be acked — failDelivery should be called instead.
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      "partial delivery failure (bestEffort)",
    );
  });

  it("acks the queue entry when delivery is aborted", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const abortController = new AbortController();
    abortController.abort();
    const cfg: OpenClawConfig = {};

    await expect(
      deliverOutboundPayloads({
        cfg,
        channel: "telegram",
        to: "123",
        payloads: [{ text: "a" }],
        deps: { sendTelegram },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow("Operation aborted");

    expect(queueMocks.ackDelivery).toHaveBeenCalledWith("mock-queue-id");
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("passes normalized payload to onError", async () => {
    const sendTelegram = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    const cfg: OpenClawConfig = {};

    await deliverOutboundPayloads({
      cfg,
      channel: "telegram",
      to: "123",
      payloads: [{ text: "hi", mediaUrl: "https://x.test/a.jpg" }],
      deps: { sendTelegram },
      bestEffort: true,
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ text: "hi", mediaUrls: ["https://x.test/a.jpg"] }),
    );
  });

  it("mirrors delivered output when mirror options are provided", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    mocks.appendAssistantMessageToSessionTranscript.mockClear();

    await deliverOutboundPayloads({
      cfg: telegramChunkConfig,
      channel: "telegram",
      to: "123",
      payloads: [{ text: "caption", mediaUrl: "https://example.com/files/report.pdf?sig=1" }],
      deps: { sendTelegram },
      mirror: {
        sessionKey: "agent:main:main",
        text: "caption",
        mediaUrls: ["https://example.com/files/report.pdf?sig=1"],
      },
    });

    expect(mocks.appendAssistantMessageToSessionTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "report.pdf" }),
    );
  });

  it("emits message_sent success for text-only deliveries", async () => {
    hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sent");
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverOutboundPayloads({
      cfg: {},
      channel: "telegram",
      to: "123",
      payloads: [{ text: "hello" }],
      deps: { sendTelegram },
    });

    await vi.waitFor(() => {
      expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
        expect.objectContaining({ to: "123", content: "hello", success: true }),
        expect.objectContaining({ channelId: "telegram" }),
      );
    });
  });

  it("emits message_sent success for sendPayload deliveries", async () => {
    hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sent");
    const sendPayload = vi.fn().mockResolvedValue({ channel: "matrix", messageId: "mx-1" });
    const sendText = vi.fn();
    const sendMedia = vi.fn();
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendPayload, sendText, sendMedia },
          }),
        },
      ]),
    );

    await deliverOutboundPayloads({
      cfg: {},
      channel: "matrix",
      to: "!room:1",
      payloads: [{ text: "payload text", channelData: { mode: "custom" } }],
    });

    await vi.waitFor(() => {
      expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
        expect.objectContaining({ to: "!room:1", content: "payload text", success: true }),
        expect.objectContaining({ channelId: "matrix" }),
      );
    });
  });

  it("emits message_sent failure when delivery errors", async () => {
    hookMocks.runner.hasHooks.mockImplementation((name: string) => name === "message_sent");
    const sendTelegram = vi.fn().mockRejectedValue(new Error("downstream failed"));

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "telegram",
        to: "123",
        payloads: [{ text: "hi" }],
        deps: { sendTelegram },
      }),
    ).rejects.toThrow("downstream failed");

    await vi.waitFor(() => {
      expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "123",
          content: "hi",
          success: false,
          error: "downstream failed",
        }),
        expect.objectContaining({ channelId: "telegram" }),
      );
    });
  });
});

const emptyRegistry = createTestRegistry([]);
const defaultRegistry = createTestRegistry([
  {
    pluginId: "telegram",
    plugin: createOutboundTestPlugin({ id: "telegram", outbound: telegramOutbound }),
    source: "test",
  },
]);
