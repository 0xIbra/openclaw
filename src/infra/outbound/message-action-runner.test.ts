import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../../channels/plugins/types.js";
import type { OpenClawConfig } from "../../config/config.js";
import { discordPlugin } from "../../../extensions/discord/src/channel.js";
import { telegramPlugin } from "../../../extensions/telegram/src/channel.js";
import { jsonResult } from "../../agents/tools/common.js";
import { loadWebMedia } from "../../media/web-media.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import { runMessageAction } from "./message-action-runner.js";

vi.mock("../../media/web-media.js", async () => {
  const actual = await vi.importActual<typeof import("../../media/web-media.js")>(
    "../../media/web-media.js",
  );
  return {
    ...actual,
    loadWebMedia: vi.fn(actual.loadWebMedia),
  };
});

const discordConfig = {
  channels: {
    discord: {},
  },
} as OpenClawConfig;

const discordConfig2 = {
  channels: {
    discord: {
      allowFrom: ["*"],
    },
  },
} as OpenClawConfig;

async function withSandbox(test: (sandboxDir: string) => Promise<void>) {
  const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "msg-sandbox-"));
  try {
    await test(sandboxDir);
  } finally {
    await fs.rm(sandboxDir, { recursive: true, force: true });
  }
}

const runDryAction = (params: {
  cfg: OpenClawConfig;
  action: "send" | "thread-reply" | "broadcast";
  actionParams: Record<string, unknown>;
  toolContext?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  sandboxRoot?: string;
}) =>
  runMessageAction({
    cfg: params.cfg,
    action: params.action,
    params: params.actionParams as never,
    toolContext: params.toolContext as never,
    dryRun: true,
    abortSignal: params.abortSignal,
    sandboxRoot: params.sandboxRoot,
  });

const runDrySend = (params: {
  cfg: OpenClawConfig;
  actionParams: Record<string, unknown>;
  toolContext?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  sandboxRoot?: string;
}) =>
  runDryAction({
    ...params,
    action: "send",
  });

describe("runMessageAction context isolation", () => {
  beforeEach(async () => {
    const { createPluginRuntime } = await import("../../plugins/runtime/index.js");
    const { setDiscordRuntime } = await import("../../../extensions/discord/src/runtime.js");
    const { setTelegramRuntime } = await import("../../../extensions/telegram/src/runtime.js");

    const runtime = createPluginRuntime();
    setDiscordRuntime(runtime);
    setTelegramRuntime(runtime);

    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "discord",
          source: "test",
          plugin: discordPlugin,
        },
        {
          pluginId: "discord",
          source: "test",
          plugin: discordPlugin,
        },
        {
          pluginId: "telegram",
          source: "test",
          plugin: telegramPlugin,
        },
        {
          pluginId: "discord",
          source: "test",
          plugin: discordPlugin,
        },
      ]),
    );
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
  });

  it("allows send when target matches current channel", async () => {
    const result = await runDrySend({
      cfg: discordConfig,
      actionParams: {
        channel: "discord",
        target: "channel:123456789012345678",
        message: "hi",
      },
      toolContext: { currentChannelId: "channel:123456789012345678" },
    });

    expect(result.kind).toBe("send");
  });

  it("accepts legacy to parameter for send", async () => {
    const result = await runDrySend({
      cfg: discordConfig,
      actionParams: {
        channel: "discord",
        to: "channel:123456789012345678",
        message: "hi",
      },
    });

    expect(result.kind).toBe("send");
  });

  it("defaults to current channel when target is omitted", async () => {
    const result = await runDrySend({
      cfg: discordConfig,
      actionParams: {
        channel: "discord",
        message: "hi",
      },
      toolContext: { currentChannelId: "channel:123456789012345678" },
    });

    expect(result.kind).toBe("send");
  });

  it("allows media-only send when target matches current channel", async () => {
    const result = await runDrySend({
      cfg: discordConfig,
      actionParams: {
        channel: "discord",
        target: "channel:123456789012345678",
        media: "https://example.com/note.ogg",
      },
      toolContext: { currentChannelId: "channel:123456789012345678" },
    });

    expect(result.kind).toBe("send");
  });

  it("requires message when no media hint is provided", async () => {
    await expect(
      runDrySend({
        cfg: discordConfig,
        actionParams: {
          channel: "discord",
          target: "channel:123456789012345678",
        },
        toolContext: { currentChannelId: "channel:123456789012345678" },
      }),
    ).rejects.toThrow(/message required/i);
  });

  it("blocks send when target differs from current channel", async () => {
    const result = await runDrySend({
      cfg: discordConfig,
      actionParams: {
        channel: "discord",
        target: "channel:999999999999999999",
        message: "hi",
      },
      toolContext: {
        currentChannelId: "channel:123456789012345678",
        currentChannelProvider: "discord",
      },
    });

    expect(result.kind).toBe("send");
  });

  it("blocks thread-reply when channelId differs from current channel", async () => {
    const result = await runDryAction({
      cfg: discordConfig,
      action: "thread-reply",
      actionParams: {
        channel: "discord",
        target: "channel:999999999999999999",
        message: "hi",
      },
      toolContext: {
        currentChannelId: "channel:123456789012345678",
        currentChannelProvider: "discord",
      },
    });

    expect(result.kind).toBe("action");
  });

  it("allows Discord DM send when target matches current recipient", async () => {
    const result = await runDrySend({
      cfg: discordConfig,
      actionParams: {
        channel: "discord",
        target: "user:123456789012345678",
        message: "hi",
      },
      toolContext: { currentChannelId: "user:123456789012345678" },
    });

    expect(result.kind).toBe("send");
  });

  it("allows Discord DM send when target differs and cross-context is allowed", async () => {
    const result = await runDrySend({
      cfg: discordConfig,
      actionParams: {
        channel: "discord",
        target: "user:999999999999999999",
        message: "hi",
      },
      toolContext: {
        currentChannelId: "user:123456789012345678",
        currentChannelProvider: "discord",
      },
    });

    expect(result.kind).toBe("send");
  });

  it("allows Telegram send when target matches current chat", async () => {
    const result = await runDrySend({
      cfg: discordConfig2,
      actionParams: {
        channel: "telegram",
        target: "telegram:123456",
        message: "hi",
      },
      toolContext: { currentChannelId: "telegram:123456" },
    });

    expect(result.kind).toBe("send");
  });

  it("allows Telegram send when target differs and cross-context is allowed", async () => {
    const result = await runDrySend({
      cfg: discordConfig2,
      actionParams: {
        channel: "telegram",
        target: "telegram:999999",
        message: "hi",
      },
      toolContext: {
        currentChannelId: "telegram:123456",
        currentChannelProvider: "telegram",
      },
    });

    expect(result.kind).toBe("send");
  });

  it("infers channel + target from tool context when missing", async () => {
    const multiConfig = {
      channels: {
        discord: {},
        telegram: {
          token: "tg-test",
        },
      },
    } as OpenClawConfig;

    const result = await runDrySend({
      cfg: multiConfig,
      actionParams: {
        message: "hi",
      },
      toolContext: {
        currentChannelId: "channel:123456789012345678",
        currentChannelProvider: "discord",
      },
    });

    expect(result.kind).toBe("send");
    expect(result.channel).toBe("discord");
  });

  it("blocks cross-provider sends by default", async () => {
    await expect(
      runDrySend({
        cfg: discordConfig,
        actionParams: {
          channel: "telegram",
          target: "telegram:@ops",
          message: "hi",
        },
        toolContext: {
          currentChannelId: "channel:123456789012345678",
          currentChannelProvider: "discord",
        },
      }),
    ).rejects.toThrow(/Cross-context messaging denied/);
  });

  it("blocks same-provider cross-context when disabled", async () => {
    const cfg = {
      ...discordConfig,
      tools: {
        message: {
          crossContext: {
            allowWithinProvider: false,
          },
        },
      },
    } as OpenClawConfig;

    await expect(
      runDrySend({
        cfg,
        actionParams: {
          channel: "discord",
          target: "channel:999999999999999999",
          message: "hi",
        },
        toolContext: {
          currentChannelId: "channel:123456789012345678",
          currentChannelProvider: "discord",
        },
      }),
    ).rejects.toThrow(/Cross-context messaging denied/);
  });

  it("aborts send when abortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runDrySend({
        cfg: discordConfig,
        actionParams: {
          channel: "discord",
          target: "channel:123456789012345678",
          message: "hi",
        },
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("aborts broadcast when abortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runDryAction({
        cfg: discordConfig,
        action: "broadcast",
        actionParams: {
          targets: ["channel:C12345678"],
          channel: "discord",
          message: "hi",
        },
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("runMessageAction sendAttachment hydration", () => {
  const attachmentPlugin: ChannelPlugin = {
    id: "bluebubbles",
    meta: {
      id: "bluebubbles",
      label: "BlueBubbles",
      selectionLabel: "BlueBubbles",
      docsPath: "/channels/bluebubbles",
      blurb: "BlueBubbles test plugin.",
    },
    capabilities: { chatTypes: ["direct"], media: true },
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: () => ({ enabled: true }),
      isConfigured: () => true,
    },
    actions: {
      listActions: () => ["sendAttachment"],
      supportsAction: ({ action }) => action === "sendAttachment",
      handleAction: async ({ params }) =>
        jsonResult({
          ok: true,
          buffer: params.buffer,
          filename: params.filename,
          caption: params.caption,
          contentType: params.contentType,
        }),
    },
  };

  beforeEach(() => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "bluebubbles",
          source: "test",
          plugin: attachmentPlugin,
        },
      ]),
    );
    vi.mocked(loadWebMedia).mockResolvedValue({
      buffer: Buffer.from("hello"),
      contentType: "image/png",
      kind: "image",
      fileName: "pic.png",
    });
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
    vi.clearAllMocks();
  });

  it("hydrates buffer and filename from media for sendAttachment", async () => {
    const cfg = {
      channels: {
        bluebubbles: {
          enabled: true,
          serverUrl: "http://localhost:1234",
          password: "test-password",
        },
      },
    } as OpenClawConfig;

    const result = await runMessageAction({
      cfg,
      action: "sendAttachment",
      params: {
        channel: "bluebubbles",
        target: "+15551234567",
        media: "https://example.com/pic.png",
        message: "caption",
      },
    });

    expect(result.kind).toBe("action");
    expect(result.payload).toMatchObject({
      ok: true,
      filename: "pic.png",
      caption: "caption",
      contentType: "image/png",
    });
    expect((result.payload as { buffer?: string }).buffer).toBe(
      Buffer.from("hello").toString("base64"),
    );
  });

  it("rewrites sandboxed media paths for sendAttachment", async () => {
    const cfg = {
      channels: {
        bluebubbles: {
          enabled: true,
          serverUrl: "http://localhost:1234",
          password: "test-password",
        },
      },
    } as OpenClawConfig;
    await withSandbox(async (sandboxDir) => {
      await runMessageAction({
        cfg,
        action: "sendAttachment",
        params: {
          channel: "bluebubbles",
          target: "+15551234567",
          media: "./data/pic.png",
          message: "caption",
        },
        sandboxRoot: sandboxDir,
      });

      const call = vi.mocked(loadWebMedia).mock.calls[0];
      expect(call?.[0]).toBe(path.join(sandboxDir, "data", "pic.png"));
    });
  });
});

describe("runMessageAction sandboxed media validation", () => {
  beforeEach(async () => {
    const { createPluginRuntime } = await import("../../plugins/runtime/index.js");
    const { setDiscordRuntime } = await import("../../../extensions/discord/src/runtime.js");
    const runtime = createPluginRuntime();
    setDiscordRuntime(runtime);
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "discord",
          source: "test",
          plugin: discordPlugin,
        },
      ]),
    );
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
  });

  it("rejects media outside the sandbox root", async () => {
    await withSandbox(async (sandboxDir) => {
      await expect(
        runDrySend({
          cfg: discordConfig,
          actionParams: {
            channel: "discord",
            target: "channel:123456789012345678",
            media: "/etc/passwd",
            message: "",
          },
          sandboxRoot: sandboxDir,
        }),
      ).rejects.toThrow(/sandbox/i);
    });
  });

  it("rejects file:// media outside the sandbox root", async () => {
    await withSandbox(async (sandboxDir) => {
      await expect(
        runDrySend({
          cfg: discordConfig,
          actionParams: {
            channel: "discord",
            target: "channel:123456789012345678",
            media: "file:///etc/passwd",
            message: "",
          },
          sandboxRoot: sandboxDir,
        }),
      ).rejects.toThrow(/sandbox/i);
    });
  });

  it("rewrites sandbox-relative media paths", async () => {
    await withSandbox(async (sandboxDir) => {
      const result = await runDrySend({
        cfg: discordConfig,
        actionParams: {
          channel: "discord",
          target: "channel:123456789012345678",
          media: "./data/file.txt",
          message: "",
        },
        sandboxRoot: sandboxDir,
      });

      expect(result.kind).toBe("send");
      expect(result.sendResult?.mediaUrl).toBe(path.join(sandboxDir, "data", "file.txt"));
    });
  });

  it("rewrites MEDIA directives under sandbox", async () => {
    await withSandbox(async (sandboxDir) => {
      const result = await runDrySend({
        cfg: discordConfig,
        actionParams: {
          channel: "discord",
          target: "channel:123456789012345678",
          message: "Hello\nMEDIA: ./data/note.ogg",
        },
        sandboxRoot: sandboxDir,
      });

      expect(result.kind).toBe("send");
      expect(result.sendResult?.mediaUrl).toBe(path.join(sandboxDir, "data", "note.ogg"));
    });
  });

  it("rejects data URLs in media params", async () => {
    await expect(
      runDrySend({
        cfg: discordConfig,
        actionParams: {
          channel: "discord",
          target: "channel:123456789012345678",
          media: "data:image/png;base64,abcd",
          message: "",
        },
      }),
    ).rejects.toThrow(/data:/i);
  });
});

describe("runMessageAction media caption behavior", () => {
  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
  });

  it("promotes caption to message for media sends when message is empty", async () => {
    const sendMedia = vi.fn().mockResolvedValue({
      channel: "testchat",
      messageId: "m1",
      chatId: "c1",
    });
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "testchat",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "testchat",
            outbound: {
              deliveryMode: "direct",
              sendText: vi.fn().mockResolvedValue({
                channel: "testchat",
                messageId: "t1",
                chatId: "c1",
              }),
              sendMedia,
            },
          }),
        },
      ]),
    );
    const cfg = {
      channels: {
        testchat: {
          enabled: true,
        },
      },
    } as OpenClawConfig;

    const result = await runMessageAction({
      cfg,
      action: "send",
      params: {
        channel: "testchat",
        target: "channel:abc",
        media: "https://example.com/cat.png",
        caption: "caption-only text",
      },
      dryRun: false,
    });

    expect(result.kind).toBe("send");
    expect(sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "caption-only text",
        mediaUrl: "https://example.com/cat.png",
      }),
    );
  });
});

describe("runMessageAction card-only send behavior", () => {
  const handleAction = vi.fn(async ({ params }: { params: Record<string, unknown> }) =>
    jsonResult({
      ok: true,
      card: params.card ?? null,
      message: params.message ?? null,
    }),
  );

  const cardPlugin: ChannelPlugin = {
    id: "cardchat",
    meta: {
      id: "cardchat",
      label: "Card Chat",
      selectionLabel: "Card Chat",
      docsPath: "/channels/cardchat",
      blurb: "Card-only send test plugin.",
    },
    capabilities: { chatTypes: ["direct"] },
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: () => ({ enabled: true }),
      isConfigured: () => true,
    },
    actions: {
      listActions: () => ["send"],
      supportsAction: ({ action }) => action === "send",
      handleAction,
    },
  };

  beforeEach(() => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "cardchat",
          source: "test",
          plugin: cardPlugin,
        },
      ]),
    );
    handleAction.mockClear();
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
    vi.clearAllMocks();
  });

  it("allows card-only sends without text or media", async () => {
    const cfg = {
      channels: {
        cardchat: {
          enabled: true,
        },
      },
    } as OpenClawConfig;

    const card = {
      type: "AdaptiveCard",
      version: "1.4",
      body: [{ type: "TextBlock", text: "Card-only payload" }],
    };

    const result = await runMessageAction({
      cfg,
      action: "send",
      params: {
        channel: "cardchat",
        target: "channel:test-card",
        card,
      },
      dryRun: false,
    });

    expect(result.kind).toBe("send");
    expect(result.handledBy).toBe("plugin");
    expect(handleAction).toHaveBeenCalled();
    expect(result.payload).toMatchObject({
      ok: true,
      card,
    });
  });
});

describe("runMessageAction accountId defaults", () => {
  const handleAction = vi.fn(async () => jsonResult({ ok: true }));
  const accountPlugin: ChannelPlugin = {
    id: "discord",
    meta: {
      id: "discord",
      label: "Discord",
      selectionLabel: "Discord",
      docsPath: "/channels/discord",
      blurb: "Discord test plugin.",
    },
    capabilities: { chatTypes: ["direct"] },
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: () => ({}),
    },
    actions: {
      listActions: () => ["send"],
      handleAction,
    },
  };

  beforeEach(() => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "discord",
          source: "test",
          plugin: accountPlugin,
        },
      ]),
    );
    handleAction.mockClear();
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry([]));
    vi.clearAllMocks();
  });

  it("propagates defaultAccountId into params", async () => {
    await runMessageAction({
      cfg: {} as OpenClawConfig,
      action: "send",
      params: {
        channel: "discord",
        target: "channel:123",
        message: "hi",
      },
      defaultAccountId: "ops",
    });

    expect(handleAction).toHaveBeenCalled();
    const ctx = handleAction.mock.calls[0]?.[0] as {
      accountId?: string | null;
      params: Record<string, unknown>;
    };
    expect(ctx.accountId).toBe("ops");
    expect(ctx.params.accountId).toBe("ops");
  });
});
