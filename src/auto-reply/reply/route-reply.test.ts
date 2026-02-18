import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import { discordOutbound } from "../../channels/plugins/outbound/discord.js";
import { telegramOutbound } from "../../channels/plugins/outbound/telegram.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import { SILENT_REPLY_TOKEN } from "../tokens.js";

const mocks = vi.hoisted(() => ({
  sendMessageDiscord: vi.fn(async () => ({ messageId: "m1", channelId: "c1" })),
  sendMessageTelegram: vi.fn(async () => ({ messageId: "m1", chatId: "c1" })),
  deliverOutboundPayloads: vi.fn(),
}));

vi.mock("../../discord/send.js", () => ({
  sendMessageDiscord: mocks.sendMessageDiscord,
}));
vi.mock("../../telegram/send.js", () => ({
  sendMessageTelegram: mocks.sendMessageTelegram,
}));
vi.mock("../../infra/outbound/deliver.js", async () => {
  const actual = await vi.importActual<typeof import("../../infra/outbound/deliver.js")>(
    "../../infra/outbound/deliver.js",
  );
  return {
    ...actual,
    deliverOutboundPayloads: mocks.deliverOutboundPayloads,
  };
});
const actualDeliver = await vi.importActual<typeof import("../../infra/outbound/deliver.js")>(
  "../../infra/outbound/deliver.js",
);

const { routeReply } = await import("./route-reply.js");

const createRegistry = (channels: PluginRegistry["channels"]): PluginRegistry => ({
  plugins: [],
  tools: [],
  hooks: [],
  typedHooks: [],
  channels,
  providers: [],
  gatewayHandlers: {},
  httpHandlers: [],
  httpRoutes: [],
  cliRegistrars: [],
  services: [],
  commands: [],
  diagnostics: [],
});

describe("routeReply", () => {
  beforeEach(() => {
    setActivePluginRegistry(defaultRegistry);
    mocks.deliverOutboundPayloads.mockImplementation(actualDeliver.deliverOutboundPayloads);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("skips sends when abort signal is already aborted", async () => {
    mocks.sendMessageDiscord.mockClear();
    const controller = new AbortController();
    controller.abort();
    const res = await routeReply({
      payload: { text: "hi" },
      channel: "discord",
      to: "channel:123",
      cfg: {} as never,
      abortSignal: controller.signal,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("aborted");
    expect(mocks.sendMessageDiscord).not.toHaveBeenCalled();
  });

  it("no-ops on empty payload", async () => {
    mocks.sendMessageDiscord.mockClear();
    const res = await routeReply({
      payload: {},
      channel: "discord",
      to: "channel:123",
      cfg: {} as never,
    });
    expect(res.ok).toBe(true);
    expect(mocks.sendMessageDiscord).not.toHaveBeenCalled();
  });

  it("drops silent token payloads", async () => {
    mocks.sendMessageDiscord.mockClear();
    const res = await routeReply({
      payload: { text: SILENT_REPLY_TOKEN },
      channel: "discord",
      to: "channel:123",
      cfg: {} as never,
    });
    expect(res.ok).toBe(true);
    expect(mocks.sendMessageDiscord).not.toHaveBeenCalled();
  });

  it("drops payloads that start with the silent token", async () => {
    mocks.sendMessageDiscord.mockClear();
    const res = await routeReply({
      payload: { text: `${SILENT_REPLY_TOKEN} -- (why am I here?)` },
      channel: "discord",
      to: "channel:123",
      cfg: {} as never,
    });
    expect(res.ok).toBe(true);
    expect(mocks.sendMessageDiscord).not.toHaveBeenCalled();
  });

  it("applies responsePrefix when routing", async () => {
    mocks.sendMessageDiscord.mockClear();
    const cfg = {
      messages: { responsePrefix: "[openclaw]" },
    } as unknown as OpenClawConfig;
    await routeReply({
      payload: { text: "hi" },
      channel: "discord",
      to: "channel:123",
      cfg,
    });
    expect(mocks.sendMessageDiscord).toHaveBeenCalledWith(
      "channel:123",
      "[openclaw] hi",
      expect.any(Object),
    );
  });

  it("does not derive responsePrefix from agent identity when routing", async () => {
    mocks.sendMessageDiscord.mockClear();
    const cfg = {
      agents: {
        list: [
          {
            id: "rich",
            identity: { name: "Richbot", theme: "lion bot", emoji: "🦁" },
          },
        ],
      },
      messages: {},
    } as unknown as OpenClawConfig;
    await routeReply({
      payload: { text: "hi" },
      channel: "discord",
      to: "channel:123",
      sessionKey: "agent:rich:main",
      cfg,
    });
    expect(mocks.sendMessageDiscord).toHaveBeenCalledWith("channel:123", "hi", expect.any(Object));
  });

  it("passes thread id to Telegram sends", async () => {
    mocks.sendMessageTelegram.mockClear();
    await routeReply({
      payload: { text: "hi" },
      channel: "telegram",
      to: "telegram:123",
      threadId: 42,
      cfg: {} as never,
    });
    expect(mocks.sendMessageTelegram).toHaveBeenCalledWith(
      "telegram:123",
      "hi",
      expect.objectContaining({ messageThreadId: 42 }),
    );
  });

  it("passes replyToId to Telegram sends", async () => {
    mocks.sendMessageTelegram.mockClear();
    await routeReply({
      payload: { text: "hi", replyToId: "123" },
      channel: "telegram",
      to: "telegram:123",
      cfg: {} as never,
    });
    expect(mocks.sendMessageTelegram).toHaveBeenCalledWith(
      "telegram:123",
      "hi",
      expect.objectContaining({ replyToMessageId: 123 }),
    );
  });

  it("sends multiple mediaUrls (caption only on first)", async () => {
    mocks.sendMessageDiscord.mockClear();
    await routeReply({
      payload: { text: "caption", mediaUrls: ["a", "b"] },
      channel: "discord",
      to: "channel:123",
      cfg: {} as never,
    });
    expect(mocks.sendMessageDiscord).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessageDiscord).toHaveBeenNthCalledWith(
      1,
      "channel:123",
      "caption",
      expect.objectContaining({ mediaUrl: "a" }),
    );
    expect(mocks.sendMessageDiscord).toHaveBeenNthCalledWith(
      2,
      "channel:123",
      "",
      expect.objectContaining({ mediaUrl: "b" }),
    );
  });

  it("passes mirror data when sessionKey is set", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([]);
    await routeReply({
      payload: { text: "hi" },
      channel: "discord",
      to: "channel:123",
      sessionKey: "agent:main:main",
      cfg: {} as never,
    });
    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:main",
          text: "hi",
        }),
      }),
    );
  });

  it("skips mirror data when mirror is false", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([]);
    await routeReply({
      payload: { text: "hi" },
      channel: "discord",
      to: "channel:123",
      sessionKey: "agent:main:main",
      mirror: false,
      cfg: {} as never,
    });
    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: undefined,
      }),
    );
  });
});

const emptyRegistry = createRegistry([]);
const defaultRegistry = createTestRegistry([
  {
    pluginId: "discord",
    plugin: createOutboundTestPlugin({
      id: "discord",
      outbound: discordOutbound,
      label: "Discord",
    }),
    source: "test",
  },
  {
    pluginId: "telegram",
    plugin: createOutboundTestPlugin({
      id: "telegram",
      outbound: telegramOutbound,
      label: "Telegram",
    }),
    source: "test",
  },
]);
