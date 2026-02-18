import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import type { DiscordProbe } from "../../discord/probe.js";
import type { DiscordTokenResolution } from "../../discord/token.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { TelegramProbe } from "../../telegram/probe.js";
import type { TelegramTokenResolution } from "../../telegram/token.js";
import type { ChannelOutboundAdapter, ChannelPlugin } from "./types.js";
import type { BaseProbeResult, BaseTokenResolution } from "./types.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createTestRegistry } from "../../test-utils/channel-plugins.js";
import { listChannelPluginCatalogEntries } from "./catalog.js";
import { resolveChannelConfigWrites } from "./config-writes.js";
import {
  listDiscordDirectoryGroupsFromConfig,
  listDiscordDirectoryPeersFromConfig,
  listTelegramDirectoryGroupsFromConfig,
  listTelegramDirectoryPeersFromConfig,
} from "./directory-config.js";
import { listChannelPlugins } from "./index.js";
import { loadChannelPlugin } from "./load.js";
import { loadChannelOutboundAdapter } from "./outbound/load.js";

describe("channel plugin registry", () => {
  const emptyRegistry = createTestRegistry([]);

  const createPlugin = (id: string): ChannelPlugin => ({
    id,
    meta: {
      id,
      label: id,
      selectionLabel: id,
      docsPath: `/channels/${id}`,
      blurb: "test",
    },
    capabilities: { chatTypes: ["direct"] },
    config: {
      listAccountIds: () => [],
      resolveAccount: () => ({}),
    },
  });

  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("sorts channel plugins by configured order", () => {
    const registry = createTestRegistry(
      ["discord", "telegram"].map((id) => ({
        pluginId: id,
        plugin: createPlugin(id),
        source: "test",
      })),
    );
    setActivePluginRegistry(registry);
    const pluginIds = listChannelPlugins().map((plugin) => plugin.id);
    expect(pluginIds).toEqual(["telegram", "discord"]);
  });
});

describe("channel plugin catalog", () => {
  it("includes external catalog entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-catalog-"));
    const catalogPath = path.join(dir, "catalog.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        entries: [
          {
            name: "@openclaw/demo-channel",
            openclaw: {
              channel: {
                id: "demo-channel",
                label: "Demo Channel",
                selectionLabel: "Demo Channel",
                docsPath: "/channels/demo-channel",
                blurb: "Demo entry",
                order: 999,
              },
              install: {
                npmSpec: "@openclaw/demo-channel",
              },
            },
          },
        ],
      }),
    );

    const ids = listChannelPluginCatalogEntries({ catalogPaths: [catalogPath] }).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("demo-channel");
  });
});

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

const emptyRegistry = createRegistry([]);

const testOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  sendText: async () => ({ channel: "test-channel", messageId: "m1" }),
  sendMedia: async () => ({ channel: "test-channel", messageId: "m2" }),
};

const testPlugin: ChannelPlugin = {
  id: "test-channel",
  meta: {
    id: "test-channel",
    label: "Test Channel",
    selectionLabel: "Test Channel",
    docsPath: "/channels/test-channel",
    blurb: "Test channel plugin.",
  },
  capabilities: { chatTypes: ["direct"] },
  config: {
    listAccountIds: () => [],
    resolveAccount: () => ({}),
  },
  outbound: testOutbound,
};

const registryWithTestPlugin = createRegistry([
  { pluginId: "test-channel", plugin: testPlugin, source: "test" },
]);

describe("channel plugin loader", () => {
  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("loads channel plugins from the active registry", async () => {
    setActivePluginRegistry(registryWithTestPlugin);
    const plugin = await loadChannelPlugin("test-channel");
    expect(plugin).toBe(testPlugin);
  });

  it("loads outbound adapters from registered plugins", async () => {
    setActivePluginRegistry(registryWithTestPlugin);
    const outbound = await loadChannelOutboundAdapter("test-channel");
    expect(outbound).toBe(testOutbound);
  });
});

describe("BaseProbeResult assignability", () => {
  it("TelegramProbe satisfies BaseProbeResult", () => {
    expectTypeOf<TelegramProbe>().toMatchTypeOf<BaseProbeResult>();
  });

  it("DiscordProbe satisfies BaseProbeResult", () => {
    expectTypeOf<DiscordProbe>().toMatchTypeOf<BaseProbeResult>();
  });
});

describe("BaseTokenResolution assignability", () => {
  it("TelegramTokenResolution satisfies BaseTokenResolution", () => {
    expectTypeOf<TelegramTokenResolution>().toMatchTypeOf<BaseTokenResolution>();
  });

  it("DiscordTokenResolution satisfies BaseTokenResolution", () => {
    expectTypeOf<DiscordTokenResolution>().toMatchTypeOf<BaseTokenResolution>();
  });
});

describe("resolveChannelConfigWrites", () => {
  it("defaults to allow when unset", () => {
    const cfg = {};
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram" })).toBe(true);
  });

  it("blocks when channel config disables writes", () => {
    const cfg = { channels: { telegram: { configWrites: false } } };
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram" })).toBe(false);
  });

  it("account override wins over channel default", () => {
    const cfg = {
      channels: {
        telegram: {
          configWrites: true,
          accounts: {
            work: { configWrites: false },
          },
        },
      },
    };
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram", accountId: "work" })).toBe(
      false,
    );
  });

  it("matches account ids case-insensitively", () => {
    const cfg = {
      channels: {
        telegram: {
          configWrites: true,
          accounts: {
            Work: { configWrites: false },
          },
        },
      },
    };
    expect(resolveChannelConfigWrites({ cfg, channelId: "telegram", accountId: "work" })).toBe(
      false,
    );
  });
});

describe("directory (config-backed)", () => {
  it("lists Discord peers/groups from config (numeric ids only)", async () => {
    const cfg = {
      channels: {
        discord: {
          token: "discord-test",
          dm: { allowFrom: ["<@111>", "nope"] },
          dms: { "222": {} },
          guilds: {
            "123": {
              users: ["<@12345>", "not-an-id"],
              channels: {
                "555": {},
                "channel:666": {},
                general: {},
              },
            },
          },
        },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
    } as any;

    const peers = await listDiscordDirectoryPeersFromConfig({
      cfg,
      accountId: "default",
      query: null,
      limit: null,
    });
    expect(peers?.map((e) => e.id).toSorted()).toEqual(["user:111", "user:12345", "user:222"]);

    const groups = await listDiscordDirectoryGroupsFromConfig({
      cfg,
      accountId: "default",
      query: null,
      limit: null,
    });
    expect(groups?.map((e) => e.id).toSorted()).toEqual(["channel:555", "channel:666"]);
  });

  it("lists Telegram peers/groups from config", async () => {
    const cfg = {
      channels: {
        telegram: {
          botToken: "telegram-test",
          allowFrom: ["123", "alice", "tg:@bob"],
          dms: { "456": {} },
          groups: { "-1001": {}, "*": {} },
        },
      },
      // oxlint-disable-next-line typescript/no-explicit-any
    } as any;

    const peers = await listTelegramDirectoryPeersFromConfig({
      cfg,
      accountId: "default",
      query: null,
      limit: null,
    });
    expect(peers?.map((e) => e.id).toSorted()).toEqual(["123", "456", "@alice", "@bob"]);

    const groups = await listTelegramDirectoryGroupsFromConfig({
      cfg,
      accountId: "default",
      query: null,
      limit: null,
    });
    expect(groups?.map((e) => e.id)).toEqual(["-1001"]);
  });
});
