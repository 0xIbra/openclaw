import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import * as replyModule from "../auto-reply/reply.js";
import { resolveMainSessionKey } from "../config/sessions.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";
import { installHeartbeatRunnerTestRuntime } from "./heartbeat-runner.test-harness.js";

// Avoid pulling optional runtime deps during isolated runs.
vi.mock("jiti", () => ({ createJiti: () => () => ({}) }));

installHeartbeatRunnerTestRuntime();

describe("resolveHeartbeatIntervalMs", () => {
  function createHeartbeatConfig(params: {
    tmpDir: string;
    storePath: string;
    heartbeat: Record<string, unknown>;
    channels: Record<string, unknown>;
  }): OpenClawConfig {
    return {
      agents: {
        defaults: {
          workspace: params.tmpDir,
          heartbeat: params.heartbeat as never,
        },
      },
      channels: params.channels as never,
      session: { store: params.storePath },
    };
  }

  async function seedMainSession(
    storePath: string,
    cfg: OpenClawConfig,
    session: {
      sessionId?: string;
      updatedAt?: number;
      lastChannel: string;
      lastProvider: string;
      lastTo: string;
    },
  ) {
    const sessionKey = resolveMainSessionKey(cfg);
    await seedSessionStore(storePath, sessionKey, session);
    return sessionKey;
  }

  function makeTelegramDeps(
    params: {
      sendTelegram?: ReturnType<typeof vi.fn>;
      getQueueSize?: () => number;
      nowMs?: () => number;
      webAuthExists?: () => Promise<boolean>;
      hasActiveWebListener?: () => boolean;
    } = {},
  ) {
    return {
      ...(params.sendTelegram ? { sendTelegram: params.sendTelegram } : {}),
      getQueueSize: params.getQueueSize ?? (() => 0),
      nowMs: params.nowMs ?? (() => 0),
      webAuthExists: params.webAuthExists ?? (async () => true),
      hasActiveWebListener: params.hasActiveWebListener ?? (() => true),
    };
  }

  function makeTelegramDeps(
    params: {
      sendTelegram?: ReturnType<typeof vi.fn>;
      getQueueSize?: () => number;
      nowMs?: () => number;
    } = {},
  ) {
    return {
      ...(params.sendTelegram ? { sendTelegram: params.sendTelegram } : {}),
      getQueueSize: params.getQueueSize ?? (() => 0),
      nowMs: params.nowMs ?? (() => 0),
    };
  }

  async function seedSessionStore(
    storePath: string,
    sessionKey: string,
    session: {
      sessionId?: string;
      updatedAt?: number;
      lastChannel: string;
      lastProvider: string;
      lastTo: string;
    },
  ) {
    await fs.writeFile(
      storePath,
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId: session.sessionId ?? "sid",
            updatedAt: session.updatedAt ?? Date.now(),
            ...session,
          },
        },
        null,
        2,
      ),
    );
  }

  async function withTempHeartbeatSandbox<T>(
    fn: (ctx: {
      tmpDir: string;
      storePath: string;
      replySpy: ReturnType<typeof vi.spyOn>;
    }) => Promise<T>,
  ) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-"));
    const storePath = path.join(tmpDir, "sessions.json");
    const replySpy = vi.spyOn(replyModule, "getReplyFromConfig");
    try {
      return await fn({ tmpDir, storePath, replySpy });
    } finally {
      replySpy.mockRestore();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  async function withTempTelegramHeartbeatSandbox<T>(
    fn: (ctx: {
      tmpDir: string;
      storePath: string;
      replySpy: ReturnType<typeof vi.spyOn>;
    }) => Promise<T>,
  ) {
    const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "";
    try {
      return await withTempHeartbeatSandbox(fn);
    } finally {
      if (prevTelegramToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
      }
    }
  }

  it("respects ackMaxChars for heartbeat acks", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: {
          every: "5m",
          target: "telegram",
          ackMaxChars: 0,
        },
        channels: { telegram: { allowFrom: ["*"] } },
      });

      await seedMainSession(storePath, cfg, {
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "+1555",
      });

      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK 🦞" });
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        toJid: "jid",
      });

      await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps({ sendTelegram }),
      });

      expect(sendTelegram).toHaveBeenCalled();
    });
  });

  it("sends HEARTBEAT_OK when visibility.showOk is true", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: {
          every: "5m",
          target: "telegram",
        },
        channels: { telegram: { allowFrom: ["*"], heartbeat: { showOk: true } } },
      });

      await seedMainSession(storePath, cfg, {
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "+1555",
      });

      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        toJid: "jid",
      });

      await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps({ sendTelegram }),
      });

      expect(sendTelegram).toHaveBeenCalledTimes(1);
      expect(sendTelegram).toHaveBeenCalledWith("+1555", "HEARTBEAT_OK", expect.any(Object));
    });
  });

  it("does not deliver HEARTBEAT_OK to telegram when showOk is false", async () => {
    await withTempTelegramHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: {
          every: "5m",
          target: "telegram",
        },
        channels: {
          telegram: {
            token: "test-token",
            allowFrom: ["*"],
            heartbeat: { showOk: false },
          },
        },
      });

      await seedMainSession(storePath, cfg, {
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "12345",
      });

      replySpy.mockResolvedValue({ text: "HEARTBEAT_OK" });
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        toJid: "jid",
      });

      await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps({ sendTelegram }),
      });

      expect(sendTelegram).not.toHaveBeenCalled();
    });
  });

  it("skips heartbeat LLM calls when visibility disables all output", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: {
          every: "5m",
          target: "telegram",
        },
        channels: {
          telegram: {
            allowFrom: ["*"],
            heartbeat: { showOk: false, showAlerts: false, useIndicator: false },
          },
        },
      });

      await seedMainSession(storePath, cfg, {
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "+1555",
      });

      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        toJid: "jid",
      });

      const result = await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps({ sendTelegram }),
      });

      expect(replySpy).not.toHaveBeenCalled();
      expect(sendTelegram).not.toHaveBeenCalled();
      expect(result).toEqual({ status: "skipped", reason: "alerts-disabled" });
    });
  });

  it("skips delivery for markup-wrapped HEARTBEAT_OK", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: {
          every: "5m",
          target: "telegram",
        },
        channels: { telegram: { allowFrom: ["*"] } },
      });

      await seedMainSession(storePath, cfg, {
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "+1555",
      });

      replySpy.mockResolvedValue({ text: "<b>HEARTBEAT_OK</b>" });
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        toJid: "jid",
      });

      await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps({ sendTelegram }),
      });

      expect(sendTelegram).not.toHaveBeenCalled();
    });
  });

  it("does not regress updatedAt when restoring heartbeat sessions", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const originalUpdatedAt = 1000;
      const bumpedUpdatedAt = 2000;
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: {
          every: "5m",
          target: "telegram",
        },
        channels: { telegram: { allowFrom: ["*"] } },
      });

      const sessionKey = await seedMainSession(storePath, cfg, {
        updatedAt: originalUpdatedAt,
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "+1555",
      });

      replySpy.mockImplementationOnce(async () => {
        const raw = await fs.readFile(storePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, { updatedAt?: number } | undefined>;
        if (parsed[sessionKey]) {
          parsed[sessionKey] = {
            ...parsed[sessionKey],
            updatedAt: bumpedUpdatedAt,
          };
        }
        await fs.writeFile(storePath, JSON.stringify(parsed, null, 2));
        return { text: "" };
      });

      await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps(),
      });

      const finalStore = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<
        string,
        { updatedAt?: number } | undefined
      >;
      expect(finalStore[sessionKey]?.updatedAt).toBe(bumpedUpdatedAt);
    });
  });

  it("continues Telegram delivery even when WhatsApp linkage checks fail", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: { every: "5m", target: "telegram" },
        channels: { telegram: { allowFrom: ["*"] } },
      });
      await seedMainSession(storePath, cfg, {
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "+1555",
      });

      replySpy.mockResolvedValue({ text: "Heartbeat alert" });
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        toJid: "jid",
      });

      const res = await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps({
          sendTelegram,
          webAuthExists: async () => false,
          hasActiveWebListener: () => false,
        }),
      });

      expect(res.status).toBe("ran");
      expect(sendTelegram).toHaveBeenCalled();
    });
  });

  async function expectTelegramHeartbeatAccountId(params: {
    heartbeat: Record<string, unknown>;
    telegram: Record<string, unknown>;
    expectedAccountId: string | undefined;
  }): Promise<void> {
    await withTempTelegramHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createHeartbeatConfig({
        tmpDir,
        storePath,
        heartbeat: params.heartbeat,
        channels: { telegram: params.telegram },
      });
      await seedMainSession(storePath, cfg, {
        lastChannel: "telegram",
        lastProvider: "telegram",
        lastTo: "123456",
      });

      replySpy.mockResolvedValue({ text: "Hello from heartbeat" });
      const sendTelegram = vi.fn().mockResolvedValue({
        messageId: "m1",
        chatId: "123456",
      });

      await runHeartbeatOnce({
        cfg,
        deps: makeTelegramDeps({ sendTelegram }),
      });

      expect(sendTelegram).toHaveBeenCalledTimes(1);
      expect(sendTelegram).toHaveBeenCalledWith(
        "123456",
        "Hello from heartbeat",
        expect.objectContaining({ accountId: params.expectedAccountId, verbose: false }),
      );
    });
  }

  it.each([
    {
      title: "passes through accountId for telegram heartbeats",
      heartbeat: { every: "5m", target: "telegram" },
      telegram: { botToken: "test-bot-token-123" },
      expectedAccountId: undefined,
    },
    {
      title: "does not pre-resolve telegram accountId (allows config-only account tokens)",
      heartbeat: { every: "5m", target: "telegram" },
      telegram: {
        accounts: {
          work: { botToken: "test-bot-token-123" },
        },
      },
      expectedAccountId: undefined,
    },
    {
      title: "uses explicit heartbeat accountId for telegram delivery",
      heartbeat: { every: "5m", target: "telegram", accountId: "work" },
      telegram: {
        accounts: {
          work: { botToken: "test-bot-token-123" },
        },
      },
      expectedAccountId: "work",
    },
  ])("$title", async ({ heartbeat, telegram, expectedAccountId }) => {
    await expectTelegramHeartbeatAccountId({ heartbeat, telegram, expectedAccountId });
  });
});
