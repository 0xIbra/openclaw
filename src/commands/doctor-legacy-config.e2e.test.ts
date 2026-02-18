import { describe, expect, it } from "vitest";
import { normalizeLegacyConfigValues } from "./doctor-legacy-config.js";

describe("normalizeLegacyConfigValues", () => {
  it("migrates Discord dm.policy/dm.allowFrom aliases", () => {
    const res = normalizeLegacyConfigValues({
      channels: {
        discord: {
          dm: { policy: "open", allowFrom: ["123"] },
        },
      },
    });

    expect(res.config.channels?.discord?.dmPolicy).toBe("open");
    expect(res.config.channels?.discord?.allowFrom).toEqual(["123"]);
    expect(res.config.channels?.discord?.dm).toEqual({});
    expect(res.changes).toEqual([
      "Moved channels.discord.dm.policy → channels.discord.dmPolicy.",
      "Moved channels.discord.dm.allowFrom → channels.discord.allowFrom.",
      "Removed empty channels.discord.dm after migration.",
    ]);
  });

  it("migrates Discord account-level dm aliases", () => {
    const res = normalizeLegacyConfigValues({
      channels: {
        discord: {
          accounts: {
            work: {
              dm: { policy: "allowlist", allowFrom: ["123"], groupEnabled: true },
            },
          },
        },
      },
    });

    expect(res.config.channels?.discord?.accounts?.work?.dmPolicy).toBe("allowlist");
    expect(res.config.channels?.discord?.accounts?.work?.allowFrom).toEqual(["123"]);
    expect(res.config.channels?.discord?.accounts?.work?.dm).toEqual({ groupEnabled: true });
    expect(res.changes).toEqual([
      "Moved channels.discord.accounts.work.dm.policy → channels.discord.accounts.work.dmPolicy.",
      "Moved channels.discord.accounts.work.dm.allowFrom → channels.discord.accounts.work.allowFrom.",
    ]);
  });
});
