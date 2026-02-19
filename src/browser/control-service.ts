/**
 * Browser Control Service Stub
 *
 * This module previously implemented the legacy CDP-based browser control server.
 * The legacy browser infrastructure has been replaced by the new playwright-cli
 * based browser automation system in `src/browser-cli/`.
 *
 * This stub maintains compatibility with existing imports while the migration
 * to the new system is completed. The new browser automation is integrated
 * directly into the task runtime via `createBrowserTaskExecutor`.
 *
 * @deprecated Use `src/browser-cli/` for new browser automation tasks.
 */

import type { BrowserTab } from "./client.js";
import type {
  BrowserRouteContext,
  BrowserServerState,
  ProfileStatus,
  ProfileContext,
} from "./server-context.types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("browser");

// Stub state for compatibility
let state: BrowserServerState | null = null;

const STUB_PROFILE: ProfileContext = {
  profile: {
    name: "stub",
    cdpPort: 0,
    cdpUrl: "",
    cdpHost: "",
    cdpIsLoopback: true,
    color: "#000000",
    driver: "openclaw" as const,
  },
  ensureBrowserAvailable: async () => {},
  ensureTabAvailable: async (): Promise<BrowserTab> => ({
    targetId: "stub",
    url: "about:blank",
    title: "Stub",
    type: "page",
  }),
  isHttpReachable: async () => false,
  isReachable: async () => false,
  listTabs: async () => [],
  openTab: async (): Promise<BrowserTab> => ({
    targetId: "stub",
    url: "about:blank",
    title: "Stub",
    type: "page",
  }),
  focusTab: async () => {},
  closeTab: async () => {},
  stopRunningBrowser: async () => ({ stopped: false }),
  resetProfile: async () => ({ moved: false, from: "" }),
};

/**
 * Stub context for legacy browser control.
 * @deprecated Use browser-cli task executor instead.
 */
export function createBrowserControlContext(): BrowserRouteContext {
  return {
    state: () => state!,
    forProfile: () => STUB_PROFILE,
    listProfiles: async (): Promise<ProfileStatus[]> => [],
    ensureBrowserAvailable: async () => {},
    ensureTabAvailable: async (): Promise<BrowserTab> => ({
      targetId: "stub",
      url: "about:blank",
      title: "Stub",
      type: "page",
    }),
    isHttpReachable: async () => false,
    isReachable: async () => false,
    listTabs: async () => [],
    openTab: async (): Promise<BrowserTab> => ({
      targetId: "stub",
      url: "about:blank",
      title: "Stub",
      type: "page",
    }),
    focusTab: async () => {},
    closeTab: async () => {},
    stopRunningBrowser: async () => ({ stopped: false }),
    resetProfile: async () => ({ moved: false, from: "" }),
    mapTabError: () => null,
  };
}

export type BrowserControlService = {
  stop: () => Promise<void>;
};

/**
 * No-op stub for legacy browser control service.
 * The new browser-cli system handles browser automation directly in the task runtime.
 */
export async function startBrowserControlServiceFromConfig(): Promise<BrowserControlService | null> {
  log.info("Legacy browser control server skipped - using playwright-cli based browser automation");
  return {
    stop: async () => {
      // No-op: browsers are managed per-task by browser-cli
    },
  };
}

/**
 * @deprecated Use `startBrowserControlServiceFromConfig` instead.
 */
export async function startBrowserControlServerFromConfig(): Promise<BrowserControlService | null> {
  return startBrowserControlServiceFromConfig();
}

/**
 * No-op stub for stopping the legacy browser control service.
 */
export async function stopBrowserControlService(): Promise<void> {
  // No-op: browsers are managed per-task by browser-cli
}

/**
 * @deprecated Use `stopBrowserControlService` instead.
 */
export async function stopBrowserControlServer(): Promise<void> {
  return stopBrowserControlService();
}

/**
 * Stub for getting browser control state.
 * @deprecated Legacy browser control is disabled.
 */
export function getBrowserControlState(): BrowserServerState | null {
  return state;
}
