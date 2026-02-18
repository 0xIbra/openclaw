import type { TaskService } from "../service.js";
import type { TaskAttemptRecord, TaskClaimRecord, TaskRecord } from "../types.js";

export type TaskWorkerState =
  | "idle"
  | "claiming"
  | "running"
  | "recovering"
  | "paused"
  | "unhealthy";

export type TaskExecutionInput = {
  agentId: string;
  task: TaskRecord;
  claim: TaskClaimRecord;
  attempt: TaskAttemptRecord;
  signal: AbortSignal;
};

export type TaskExecutionSuccess = {
  status: "success";
  summary: string;
  notes?: string | null;
  commandOutcome?: Record<string, unknown>;
  testOutcome?: Record<string, unknown>;
  changedFiles?: string[];
  metrics?: Record<string, unknown>;
  session?: {
    backend?: string | null;
    id?: string | null;
  };
};

export type TaskExecutionFailure = {
  status: "failed";
  errorText: string;
  summary?: string | null;
  notes?: string | null;
  commandOutcome?: Record<string, unknown>;
  testOutcome?: Record<string, unknown>;
  changedFiles?: string[];
  metrics?: Record<string, unknown>;
  session?: {
    backend?: string | null;
    id?: string | null;
  };
};

export type TaskExecutionResult = TaskExecutionSuccess | TaskExecutionFailure;

export interface TaskExecutor {
  execute(input: TaskExecutionInput): Promise<TaskExecutionResult>;
}

export type TaskWorkerStatus = {
  agentId: string;
  teamIds: string[];
  state: TaskWorkerState;
  currentTaskId: string | null;
  lastHeartbeatAtMs: number | null;
  errorStreak: number;
  lastError: string | null;
  updatedAtMs: number;
};

export type TaskWorkerEventReason = "started" | "status" | "stopped";

export type TaskWorkerEvent = {
  reason: TaskWorkerEventReason;
  worker: TaskWorkerStatus;
};

export type TaskWorkerOptions = {
  taskService: TaskService;
  executor: TaskExecutor;
  agentId: string;
  teamIds?: string[];
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  idlePollMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  onEvent?: (event: TaskWorkerEvent) => void;
};

export type TaskWorker = {
  start: () => void;
  stop: () => Promise<void>;
  getStatus: () => TaskWorkerStatus;
  setTeamIds: (teamIds: string[]) => void;
};

export type TaskRuntimeSupervisorOptions = {
  taskService: TaskService;
  createExecutor: (agentId: string) => TaskExecutor;
  createWorker?: (options: TaskWorkerOptions) => TaskWorker;
  reconcileIntervalMs?: number;
  onWorkerEvent?: (event: TaskWorkerEvent) => void;
};

export type TaskRuntimeSupervisor = {
  start: () => void;
  stop: () => Promise<void>;
  getWorkerStatuses: () => TaskWorkerStatus[];
  reconcileNow: () => Promise<void>;
};

export type TaskLeadState = "idle" | "processing" | "delegating" | "waiting" | "paused";

export type TaskLeadStatus = {
  teamId: string;
  teamName: string;
  leadAgentId: string;
  state: TaskLeadState;
  lastError: string | null;
  lastPolledAtMs: number | null;
  waitingQuestionCount: number;
  updatedAtMs: number;
};

export type TaskLeadEventReason = "started" | "status" | "stopped" | "delegated" | "escalated";

export type TaskLeadEvent = {
  reason: TaskLeadEventReason;
  lead: TaskLeadStatus;
  payload?: Record<string, unknown>;
};

export type TaskLeadOptions = {
  taskService: TaskService;
  teamId: string;
  teamName: string;
  leadAgentId: string;
  pollMs?: number;
  busVisibilityTimeoutMs?: number;
  questionReminderMs?: number;
  questionEscalationMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  onEvent?: (event: TaskLeadEvent) => void;
};

export type TaskLead = {
  start: () => void;
  stop: () => Promise<void>;
  getStatus: () => TaskLeadStatus;
};

export type TaskLeadSupervisorOptions = {
  taskService: TaskService;
  createLead?: (options: TaskLeadOptions) => TaskLead;
  reconcileIntervalMs?: number;
  onLeadEvent?: (event: TaskLeadEvent) => void;
  onEscalation?: (event: Record<string, unknown>) => void;
};

export type TaskLeadSupervisor = {
  start: () => void;
  stop: () => Promise<void>;
  getLeadStatuses: () => TaskLeadStatus[];
  reconcileNow: () => Promise<void>;
};
