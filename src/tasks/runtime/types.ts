import type { OpenClawConfig } from "../../config/config.js";
import type { TaskService } from "../service.js";
import type {
  TaskAttemptRecord,
  TaskClaimRecord,
  TaskDecompositionPlan,
  TaskPendingReviewRecord,
  TaskRecord,
  TaskReviewRecord,
} from "../types.js";

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
  workspaceDir?: string;
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

export type TaskDecomposerInput = {
  leadAgentId: string;
  teamId: string;
  task: TaskRecord;
  signal?: AbortSignal;
};

export type TaskDecomposerResult = {
  plan: TaskDecompositionPlan;
  plannerBackend?: string | null;
  plannerSessionId?: string | null;
};

export interface TaskDecomposer {
  decompose(input: TaskDecomposerInput): Promise<TaskDecomposerResult>;
}

export type TaskQuestionAnswererInput = {
  leadAgentId: string;
  teamId: string;
  teamName: string;
  requesterAgentId: string;
  questionBody: string;
  taskId: string | null;
};

export type TaskQuestionAnswererResult = {
  answer: string;
};

export interface TaskQuestionAnswerer {
  answer(input: TaskQuestionAnswererInput): Promise<TaskQuestionAnswererResult>;
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
  // Phase 3: Supervision fields (optional for backward compatibility)
  memoryUsageMb?: number;
  maxMemoryMb?: number;
  lastHealthCheckAtMs?: number | null;
  consecutiveErrors?: number;
  lastSuccessfulTaskAtMs?: number | null;
};

export type TaskWorkerEventReason = "started" | "status" | "stopped";

export type TaskWorkerEvent = {
  reason: TaskWorkerEventReason;
  worker: TaskWorkerStatus;
};

export type TaskWorkerOptions = {
  taskService: TaskService;
  executor: TaskExecutor;
  config?: OpenClawConfig;
  agentId: string;
  teamIds?: string[];
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  idlePollMs?: number;
  maxBackoffMs?: number;
  // Phase 3: Supervision options
  maxMemoryMb?: number;
  memoryCheckIntervalMs?: number;
  maxConsecutiveErrors?: number;
  errorResetIntervalMs?: number;
  onMemoryLimit?: () => void;
  onConsecutiveErrors?: () => void;
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
  config?: OpenClawConfig;
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
  pauseAgent: (agentId: string) => Promise<TaskWorkerStatus | null>;
  resumeAgent: (agentId: string) => Promise<TaskWorkerStatus | null>;
  restartAgent: (agentId: string) => Promise<TaskWorkerStatus | null>;
};

export type TaskRuntimeTeamStatus = {
  teamId: string;
  teamName: string;
  leadAgentId: string | null;
  memberAgentIds: string[];
};

export type TaskRuntimeStatus = {
  workers: TaskWorkerStatus[];
  leads: TaskLeadStatus[];
  teams: TaskRuntimeTeamStatus[];
  updatedAtMs: number;
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
export type TaskReviewDecisionReason =
  | "pending_lead"
  | "pending_human"
  | "approved"
  | "rejected"
  | "blocked";

export type TaskLeadEvent = {
  reason: TaskLeadEventReason;
  lead: TaskLeadStatus;
  payload?: Record<string, unknown>;
};

export type TaskLeadOptions = {
  taskService: TaskService;
  config?: OpenClawConfig;
  teamId: string;
  teamName: string;
  leadAgentId: string;
  decomposer?: TaskDecomposer;
  questionAnswerer?: TaskQuestionAnswerer;
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

export type TaskLeadReviewResult = {
  parentTask: TaskRecord;
  review: TaskReviewRecord;
  pending: TaskPendingReviewRecord[];
};

export type TaskLeadSupervisorOptions = {
  taskService: TaskService;
  config?: OpenClawConfig;
  createLead?: (options: TaskLeadOptions) => TaskLead;
  /** Use the LLM-driven lead instead of the deterministic lead. */
  useLLMLead?: boolean;
  /** Question answerer — passed down to each lead instance. */
  questionAnswerer?: TaskQuestionAnswerer;
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
