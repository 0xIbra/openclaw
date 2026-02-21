export type TaskRuntimeWorkerDto = {
  agentId: string;
  teamIds: string[];
  state: "idle" | "claiming" | "running" | "recovering" | "paused" | "unhealthy";
  currentTaskId: string | null;
  lastHeartbeatAtMs: number | null;
  errorStreak: number;
  lastError: string | null;
  updatedAtMs: number;
};

export type TaskRuntimeLeadDto = {
  teamId: string;
  teamName: string;
  leadAgentId: string;
  state: "idle" | "processing" | "delegating" | "waiting" | "paused";
  lastError: string | null;
  lastPolledAtMs: number | null;
  waitingQuestionCount: number;
  updatedAtMs: number;
};

export type TaskRuntimeTeamDto = {
  teamId: string;
  teamName: string;
  leadAgentId: string | null;
  memberAgentIds: string[];
};

export type TaskRuntimeStatusDto = {
  workers: TaskRuntimeWorkerDto[];
  leads: TaskRuntimeLeadDto[];
  teams: TaskRuntimeTeamDto[];
  updatedAtMs: number;
};

export type TaskEscalationDto = {
  teamId: string;
  leadAgentId: string;
  threadId: string;
  taskId: string | null;
  requesterAgentId?: string;
  escalatedAtMs: number;
};

export type GatewayAgentRow = {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
};

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: GatewayAgentRow[];
};
