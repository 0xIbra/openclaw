// Mirrored from server/src/types.ts

export type AgentType = "claude-code" | "kimi-cli";
export type AgentStatus = "offline" | "idle" | "working" | "paused";

export type AgentAuth =
  | { type: "claude-subscription" }
  | { type: "claude-openrouter"; apiKey: string; baseUrl?: string; model?: string }
  | { type: "kimi-api"; apiKey: string };

export type Agent = {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  workspaceDir: string;
  auth: AgentAuth;
  createdAt: number;
  updatedAt: number;
};

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type Task = {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
};

export type MessageDirection = "user" | "agent";

export type Message = {
  id: string;
  agentId: string;
  direction: MessageDirection;
  content: string;
  ts: number;
};

// WebSocket frames
export type WsReqFrame = { type: "req"; id: string; method: string; params: unknown };
export type WsResFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
};
export type WsEvtFrame = { type: "event"; event: string; payload: unknown };
export type WsFrame = WsReqFrame | WsResFrame | WsEvtFrame;
