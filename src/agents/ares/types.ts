/**
 * Ares Master Control Agent Types
 *
 * Ares is the global control plane for OpenClaw - it processes natural language
 * requests to manage teams, tasks, and projects.
 */

export type AresContext = {
  agentId: string;
  sessionKey: string;
  workspaceDir: string;
  agentDir: string;
  config: import("../../config/config.js").OpenClawConfig;
  provider?: string;
  model?: string;
  gatewayUrl?: string;
  gatewayToken?: string;
};

export type AresResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; error: string; suggestion?: string };

export type AresRuntime = {
  processMessage: (message: string, context: AresContext) => Promise<AresResult>;
};
