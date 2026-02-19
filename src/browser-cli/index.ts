/**
 * Browser CLI Module
 *
 * Playwright-cli based browser automation for OpenClaw.
 */

export {
  createBrowserSession,
  navigate,
  click,
  typeText,
  fill,
  getSnapshot,
  screenshot,
  pressKey,
  evaluate,
  waitFor,
} from "./server.js";

export type { BrowserSession, BrowserCommandResult, PageSnapshot } from "./server.js";

export { BrowserClient, runPlaywrightCli, isPlaywrightCliAvailable } from "./client.js";
export type { BrowserClientOptions, NavigateResult, SnapshotResult } from "./client.js";

export { createBrowserTaskExecutor } from "./task-executor.js";

export {
  isBrowserTask,
  isBrowserTaskType,
  createBrowserExecutor,
  BROWSER_TASK_TYPES,
  getAgentBrowserProfileDir,
  cleanupAgentBrowserProfiles,
} from "./integration.js";
export type { BrowserExecutorFactoryOptions } from "./integration.js";
