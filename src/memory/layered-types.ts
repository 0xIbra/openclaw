import type { MemorySearchResult } from "./types.js";

export type LayeredMemoryScopeKind = "agent" | "project" | "team";

export type LayeredMemoryScope = {
  kind: LayeredMemoryScopeKind;
  id: string;
  weight: number;
  sensitive: boolean;
  providerOverride?: "openrouter" | "openai" | "openai-compatible" | "gemini" | "voyage" | "local";
};

export type LayeredMemoryQuery = {
  query: string;
  maxResults?: number;
  minScore?: number;
  sessionKey?: string;
  scopes: LayeredMemoryScope[];
};

export type LayeredMemoryResult = MemorySearchResult & {
  scopeKind: LayeredMemoryScopeKind;
  scopeId: string;
  rankScore: number;
  freshnessBoost: number;
  finalScore: number;
};

export type LayeredMemoryScopeRef = {
  agentId: string;
  projectId?: string | null;
  teamId?: string | null;
};

export type LayeredMemoryWriteEntry = {
  eventType: "attempt:finished" | "attempt:failed" | "question:resolved" | "project:indexed";
  taskId?: string | null;
  attemptId?: string | null;
  summary: string;
  errorText?: string | null;
  testOutcome?: Record<string, unknown>;
  changedFiles?: string[];
  resolutionTags?: string[];
  metadata?: Record<string, unknown>;
  occurredAtMs?: number;
};
