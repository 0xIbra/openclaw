import type { SessionSendPolicyConfig } from "./types.base.js";

export type MemoryBackend = "builtin" | "qmd";
export type MemoryCitationsMode = "auto" | "on" | "off";
export type MemoryQmdSearchMode = "query" | "search" | "vsearch";
export type LayeredMemoryScopeKind = "agent" | "project" | "team";
export type LayeredMemoryProvider =
  | "openrouter"
  | "openai"
  | "openai-compatible"
  | "gemini"
  | "voyage"
  | "local";

export type LayeredMemoryScopeConfig = {
  sensitive?: boolean;
  providerOverride?: LayeredMemoryProvider;
};

export type LayeredMemoryConfig = {
  enabled?: boolean;
  storage?: {
    root?: string;
  };
  weights?: {
    agent?: number;
    project?: number;
    team?: number;
  };
  scopes?: {
    agent?: LayeredMemoryScopeConfig;
    project?: LayeredMemoryScopeConfig;
    team?: LayeredMemoryScopeConfig;
  };
};

export type MemoryConfig = {
  backend?: MemoryBackend;
  citations?: MemoryCitationsMode;
  qmd?: MemoryQmdConfig;
  layered?: LayeredMemoryConfig;
};

export type MemoryQmdConfig = {
  command?: string;
  searchMode?: MemoryQmdSearchMode;
  includeDefaultMemory?: boolean;
  paths?: MemoryQmdIndexPath[];
  sessions?: MemoryQmdSessionConfig;
  update?: MemoryQmdUpdateConfig;
  limits?: MemoryQmdLimitsConfig;
  scope?: SessionSendPolicyConfig;
};

export type MemoryQmdIndexPath = {
  path: string;
  name?: string;
  pattern?: string;
};

export type MemoryQmdSessionConfig = {
  enabled?: boolean;
  exportDir?: string;
  retentionDays?: number;
};

export type MemoryQmdUpdateConfig = {
  interval?: string;
  debounceMs?: number;
  onBoot?: boolean;
  waitForBootSync?: boolean;
  embedInterval?: string;
  commandTimeoutMs?: number;
  updateTimeoutMs?: number;
  embedTimeoutMs?: number;
};

export type MemoryQmdLimitsConfig = {
  maxResults?: number;
  maxSnippetChars?: number;
  maxInjectedChars?: number;
  timeoutMs?: number;
};
