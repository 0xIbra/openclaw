export type ChannelsStatusSnapshot = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  channels: Record<string, unknown>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
};

export type ChannelUiMetaEntry = {
  id: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
};

export const CRON_CHANNEL_LAST = "last";

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  dmPolicy?: string | null;
  allowFrom?: string[] | null;
  tokenSource?: string | null;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  allowUnmentionedGroups?: boolean | null;
  cliPath?: string | null;
  dbPath?: string | null;
  port?: number | null;
  probe?: unknown;
  audit?: unknown;
  application?: unknown;
};

export type TelegramBot = {
  id?: number | null;
  username?: string | null;
};

export type TelegramWebhook = {
  url?: string | null;
  hasCustomCert?: boolean | null;
};

export type TelegramProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: TelegramBot | null;
  webhook?: TelegramWebhook | null;
};

export type TelegramStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  mode?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: TelegramProbe | null;
  lastProbeAt?: number | null;
};

export type DiscordBot = {
  id?: string | null;
  username?: string | null;
};

export type DiscordProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: DiscordBot | null;
};

export type DiscordStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: DiscordProbe | null;
  lastProbeAt?: number | null;
};

export type ConfigSnapshotIssue = {
  path: string;
  message: string;
};

export type ConfigSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  raw?: string | null;
  hash?: string | null;
  parsed?: unknown;
  valid?: boolean | null;
  config?: Record<string, unknown> | null;
  issues?: ConfigSnapshotIssue[] | null;
};

export type ConfigUiHint = {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

export type ConfigSchemaResponse = {
  schema: unknown;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type PresenceEntry = {
  instanceId?: string | null;
  host?: string | null;
  ip?: string | null;
  version?: string | null;
  platform?: string | null;
  deviceFamily?: string | null;
  modelIdentifier?: string | null;
  roles?: string[] | null;
  scopes?: string[] | null;
  mode?: string | null;
  lastInputSeconds?: number | null;
  reason?: string | null;
  text?: string | null;
  ts?: number | null;
};

export type GatewaySessionsDefaults = {
  model: string | null;
  contextTokens: number | null;
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

export type AgentIdentityResult = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

export type AgentsFilesGetResult = {
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type AgentsFilesSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type GatewaySessionRow = {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  surface?: string;
  subject?: string;
  room?: string;
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
};

export type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  defaults: GatewaySessionsDefaults;
  sessions: GatewaySessionRow[];
};

export type SessionsPatchResult = {
  ok: true;
  path: string;
  key: string;
  entry: {
    sessionId: string;
    updatedAt?: number;
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    elevatedLevel?: string;
  };
};

export type {
  CostUsageDailyEntry,
  CostUsageSummary,
  SessionsUsageEntry,
  SessionsUsageResult,
  SessionsUsageTotals,
  SessionUsageTimePoint,
  SessionUsageTimeSeries,
} from "./usage-types.ts";

export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type CronSessionTarget = "main" | "isolated";
export type CronWakeMode = "next-heartbeat" | "now";

export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      thinking?: string;
      timeoutSeconds?: number;
    };

export type CronDelivery = {
  mode: "none" | "announce" | "webhook";
  channel?: string;
  to?: string;
  bestEffort?: boolean;
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
};

export type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  status: "ok" | "error" | "skipped";
  durationMs?: number;
  error?: string;
  summary?: string;
  sessionId?: string;
  sessionKey?: string;
};

export type ProjectDto = {
  id: string;
  name: string;
  description?: string;
  repoRoot?: string;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

export type TaskType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "review"
  | "research"
  | "devops";
export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskComplexity = "trivial" | "small" | "medium" | "large" | "epic";
export type TaskStatus =
  | "created"
  | "backlog"
  | "assigned"
  | "running"
  | "review"
  | "blocked"
  | "failed"
  | "done";

export type TaskDto = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  complexity: TaskComplexity | null;
  status: TaskStatus;
  parentTaskId: string | null;
  dependsOnTaskIds: string[];
  blockedByTaskIds: string[];
  assignedAgentId: string | null;
  teamId: string | null;
  currentAttemptId: string | null;
  maxAttempts: number;
  attemptCount: number;
  relevantPaths: string[];
  tags: string[];
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  startedAtMs: number | null;
  completedAtMs: number | null;
};

export type TaskAttemptDto = {
  id: string;
  taskId: string;
  status: string;
  startedAtMs: number;
  endedAtMs: number | null;
  agentId: string | null;
  notes: string | null;
  attemptNumber: number | null;
  claimId: string | null;
  teamId: string | null;
  sessionBackend: string | null;
  sessionId: string | null;
  summary: string | null;
  errorText: string | null;
  commandOutcome: Record<string, unknown>;
  testOutcome: Record<string, unknown>;
  changedFiles: string[];
  metrics: Record<string, unknown>;
  createdAtMs: number | null;
  updatedAtMs: number | null;
};

export type TaskDecompositionRunStatus = "planned" | "applied" | "failed" | "superseded";

export type TaskDecompositionRunDto = {
  id: string;
  parentTaskId: string;
  teamId: string | null;
  leadAgentId: string;
  status: TaskDecompositionRunStatus;
  plannerBackend: string | null;
  plannerSessionId: string | null;
  plan: Record<string, unknown>;
  childTaskIds: string[];
  errorText: string | null;
  dedupeKey: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type TaskReviewStatus =
  | "pending_lead"
  | "pending_human"
  | "approved"
  | "rejected"
  | "blocked";

export type TaskReviewDto = {
  id: string;
  taskId: string;
  teamId: string | null;
  leadAgentId: string;
  status: TaskReviewStatus;
  requireHumanApproval: boolean;
  autoApproveOnClean: boolean;
  decisionActor: string | null;
  decisionReason: string | null;
  verdict: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  resolvedAtMs: number | null;
};

export type TaskPendingReviewItemDto = {
  review: TaskReviewDto;
  task: TaskDto;
};

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

export type SessionPreviewItem = {
  role: "user" | "assistant" | "tool" | "system" | "other";
  text: string;
};

export type SessionsPreviewEntry = {
  key: string;
  status: "ok" | "empty" | "missing" | "error";
  items: SessionPreviewItem[];
};

export type TranscriptEntryType = "text" | "thinking" | "tool_call" | "tool_result";

export type TranscriptEntry = {
  idx: number;
  role: string;
  type: TranscriptEntryType;
  text?: string;
  thinking?: string;
  toolName?: string;
  toolId?: string;
  input?: unknown;
  toolUseId?: string;
  content?: unknown;
};

export type AgentTranscriptResult = {
  key: string;
  entries: TranscriptEntry[];
};

export type TimelineEvent = {
  id: string;
  idx: number;
  ts: number;
  agentId: string;
  sessionKey: string;
  source: "live" | "transcript";
  type: TranscriptEntryType;
  text?: string;
  thinking?: string;
  toolName?: string;
  toolId?: string;
  input?: unknown;
  toolUseId?: string;
  content?: unknown;
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

export type SkillsStatusConfigCheck = {
  path: string;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type StatusSummary = Record<string, unknown>;

export type HealthSnapshot = Record<string, unknown>;

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogEntry = {
  raw: string;
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};

export type TeamDto = {
  id: string;
  name: string;
  description?: string;
  leadAgentId: string | null;
  settings: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

export type TeamMemberDto = {
  teamId: string;
  agentId: string;
  role: "lead" | "member";
  createdAtMs: number;
  updatedAtMs: number;
};

export type TeamsListResult = { teams: TeamDto[] };

export type TeamWithMembersResult = { team: TeamDto; members: TeamMemberDto[] };
