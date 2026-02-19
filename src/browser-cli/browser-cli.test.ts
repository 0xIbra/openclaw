/**
 * Browser CLI Tests
 *
 * Tests for playwright-cli based browser automation.
 * Skips if playwright-cli is not installed.
 */

import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { isPlaywrightCliAvailable, runPlaywrightCli } from "./client.js";
import { isBrowserTask, isBrowserTaskType } from "./integration.js";
import { createBrowserSession } from "./server.js";

describe("browser-cli", () => {
  describe("integration", () => {
    it("detects browser task types", () => {
      expect(isBrowserTaskType("web")).toBe(true);
      expect(isBrowserTaskType("research")).toBe(true);
      expect(isBrowserTaskType("test:e2e")).toBe(true);
      expect(isBrowserTaskType("code")).toBe(false);
      expect(isBrowserTaskType("generic")).toBe(false);
    });

    it("detects browser tasks from payload", () => {
      expect(isBrowserTask("generic", "https://example.com")).toBe(true);
      expect(isBrowserTask("generic", "search for cats")).toBe(true);
      expect(isBrowserTask("code", { url: "https://example.com" })).toBe(true);
      expect(isBrowserTask("code", "just some code")).toBe(false);
    });
  });

  describe("client", () => {
    let playwrightAvailable = false;

    beforeAll(async () => {
      playwrightAvailable = await isPlaywrightCliAvailable();
    });

    it("checks playwright-cli availability", { skip: !playwrightAvailable }, async () => {
      const available = await isPlaywrightCliAvailable();
      expect(available).toBe(true);
    });

    it("runs playwright-cli --version", { skip: !playwrightAvailable }, async () => {
      const result = await runPlaywrightCli("--version");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("1.");
    });
  });

  describe("session", () => {
    const testSessionId = `test-${Date.now()}`;
    const profileDir = path.join(os.tmpdir(), "openclaw-test-profiles", testSessionId);
    let playwrightAvailable = false;

    beforeAll(async () => {
      playwrightAvailable = await isPlaywrightCliAvailable();
    });

    it("creates and closes browser session", { skip: !playwrightAvailable }, async () => {
      const session = await createBrowserSession({
        sessionId: testSessionId,
        profileDir,
        headless: true,
      });

      expect(session.sessionId).toBe(testSessionId);
      expect(session.profileDir).toBe(profileDir);

      await session.stop();
    });

    it("navigates to a page", { skip: !playwrightAvailable }, async () => {
      const session = await createBrowserSession({
        sessionId: `${testSessionId}-nav`,
        profileDir: path.join(os.tmpdir(), "openclaw-test-profiles", `${testSessionId}-nav`),
        headless: true,
      });

      try {
        // Navigate to example.com
        const result = await session.execute("goto", ["https://example.com"]);
        expect(result.exitCode).toBe(0);

        // Get snapshot
        const snapshotResult = await session.execute("snapshot");
        expect(snapshotResult.exitCode).toBe(0);
        expect(snapshotResult.stdout).toContain("example.com");
      } finally {
        await session.stop();
      }
    });

    it("takes a screenshot", { skip: !playwrightAvailable }, async () => {
      const session = await createBrowserSession({
        sessionId: `${testSessionId}-ss`,
        profileDir: path.join(os.tmpdir(), "openclaw-test-profiles", `${testSessionId}-ss`),
        headless: true,
      });

      try {
        await session.execute("goto", ["https://example.com"]);
        const result = await session.execute("screenshot", ["--filename=/tmp/test-ss.png"]);
        expect(result.exitCode).toBe(0);
      } finally {
        await session.stop();
      }
    });
  });
});
