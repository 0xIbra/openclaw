/**
 * Integration module for browser-cli into the task runtime.
 *
 * Provides utilities for determining when to use browser executor
 * and factory functions for creating executors with proper configuration.
 */

import path from "node:path";
import type { TaskExecutor } from "../tasks/runtime/types.js";

/**
 * Task types that should use browser automation.
 */
export const BROWSER_TASK_TYPES = [
  "browser",
  "web",
  "research",
  "test:e2e",
  "ui-test",
  "scraping",
] as const;

/**
 * Check if a task type is a browser task type.
 * @deprecated Use isBrowserTask instead.
 */
export function isBrowserTaskType(taskType: string): boolean {
  return BROWSER_TASK_TYPES.includes(taskType as (typeof BROWSER_TASK_TYPES)[number]);
}

/**
 * Check if a task should use browser automation.
 */
export function isBrowserTask(taskType: string, payload?: unknown): boolean {
  // Check explicit task type
  if (BROWSER_TASK_TYPES.includes(taskType as (typeof BROWSER_TASK_TYPES)[number])) {
    return true;
  }

  // Check payload for browser indicators
  if (typeof payload === "string") {
    const p = payload.toLowerCase();
    // URL-like strings (anywhere in the text)
    if (p.includes("http://") || p.includes("https://")) {
      return true;
    }
    // Search queries
    if (p.startsWith("search ") || p.startsWith("find ") || p.startsWith("look up ")) {
      return true;
    }
  }

  if (typeof payload === "object" && payload !== null) {
    const obj = payload as Record<string, unknown>;
    // Has URL field
    if (typeof obj.url === "string" && obj.url.startsWith("http")) {
      return true;
    }
    // Has explicit browser steps
    if (Array.isArray(obj.steps) && obj.steps.length > 0) {
      return true;
    }
  }

  return false;
}

export interface BrowserExecutorFactoryOptions {
  agentId: string;
  dataDir: string;
  headless?: boolean;
  timeoutMs?: number;
}

/**
 * Create a browser executor with configuration from agent settings.
 */
export function createBrowserExecutor(options: BrowserExecutorFactoryOptions): TaskExecutor {
  // Import here to avoid circular dependency
  const { createBrowserTaskExecutor } = require("./task-executor.js");
  return createBrowserTaskExecutor({
    agentId: options.agentId,
    dataDir: options.dataDir,
    headless: options.headless ?? false,
  });
}

/**
 * Get the default browser profile directory for an agent.
 */
export function getAgentBrowserProfileDir(dataDir: string, agentId: string): string {
  return path.join(dataDir, "browser-profiles", agentId);
}

/**
 * Clean up browser profiles for an agent.
 */
export async function cleanupAgentBrowserProfiles(dataDir: string, agentId: string): Promise<void> {
  const fs = await import("node:fs/promises");
  const profileDir = getAgentBrowserProfileDir(dataDir, agentId);

  try {
    await fs.rm(profileDir, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
}
