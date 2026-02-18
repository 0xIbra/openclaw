import { describe, expect, it } from "vitest";
import { applyPluginAutoEnable } from "./plugin-auto-enable.js";

describe("applyPluginAutoEnable", () => {
  it("auto-enables channel plugins and updates allowlist", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { discord: { token: "x" } },
        plugins: { allow: ["telegram"] },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.discord?.enabled).toBe(true);
    expect(result.config.plugins?.allow).toEqual(["telegram", "discord"]);
    expect(result.changes.join("\n")).toContain("configured, enabled automatically.");
  });

  it("respects explicit disable", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { discord: { token: "x" } },
        plugins: { entries: { discord: { enabled: false } } },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.discord?.enabled).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it("auto-enables provider auth plugins when profiles exist", () => {
    const result = applyPluginAutoEnable({
      config: {
        auth: {
          profiles: {
            "google-antigravity:default": {
              provider: "google-antigravity",
              mode: "oauth",
            },
          },
        },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.["google-antigravity-auth"]?.enabled).toBe(true);
  });

  it("skips when plugins are globally disabled", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { discord: { token: "x" } },
        plugins: { enabled: false },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.discord?.enabled).toBeUndefined();
    expect(result.changes).toEqual([]);
  });
});
