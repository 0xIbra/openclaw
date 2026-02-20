/**
 * Ares Master Control Agent Types
 *
 * Ares is the global control plane for OpenClaw - it processes natural language
 * requests to manage teams, tasks, and projects.
 */

export type AresIntent =
  | { type: "team_create"; name: string; description?: string; leadAgentId?: string }
  | { type: "team_list" }
  | { type: "team_get"; id?: string; name?: string }
  | {
      type: "team_update";
      id: string;
      updates: Partial<{ name: string; description: string; leadAgentId: string | null }>;
    }
  | { type: "team_delete"; id: string }
  | { type: "team_add_member"; teamId: string; agentId: string; role: "lead" | "member" }
  | { type: "team_remove_member"; teamId: string; agentId: string }
  | { type: "task_create"; projectId: string; title: string; description: string; taskType: string }
  | {
      type: "task_list";
      filters?: { projectId?: string; status?: string; assignedAgentId?: string };
    }
  | { type: "task_get"; id: string }
  | { type: "task_assign"; taskId: string; assignedAgentId: string }
  | { type: "project_create"; name: string; description?: string; repoRoot?: string }
  | { type: "project_list" }
  | { type: "project_get"; id?: string; name?: string }
  | { type: "status_overview" }
  | { type: "help"; topic?: string }
  | { type: "unknown"; raw: string };

export type AresContext = {
  agentId: string;
  sessionKey: string;
  workspaceDir: string;
  config: import("../../config/config.js").OpenClawConfig;
  gatewayUrl?: string;
  gatewayToken?: string;
};

export type AresResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; error: string; suggestion?: string };

export type AresRuntime = {
  processMessage: (message: string, context: AresContext) => Promise<AresResult>;
};
