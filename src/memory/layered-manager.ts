import type { OpenClawConfig } from "../config/config.js";
import type { MemorySearchConfig } from "../config/types.tools.js";
import type { LayeredMemoryResult, LayeredMemoryScope } from "./layered-types.js";
import {
  ensureLayeredScopeWorkspace,
  resolveLayeredMemoryRoot,
  resolveLayeredScopeIndexPath,
  toLayeredSyntheticAgentId,
} from "./layered-paths.js";
import { getMemorySearchManager } from "./search-manager.js";

const DEFAULT_LAYER_WEIGHTS = {
  agent: 0.55,
  project: 0.3,
  team: 0.15,
} as const;
const LAYERED_PATH_PREFIX = "layered";
const LAYERED_SEARCH_METRICS = {
  searches: 0,
  results: 0,
  failures: 0,
};

const DEFAULT_OPENROUTER_MODEL = "qwen/qwen3-embedding-8b";
const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_GEMINI_MODEL = "gemini-embedding-001";
const DEFAULT_VOYAGE_MODEL = "voyage-4-large";

function normalizeLayerWeights(input: { agent?: number; project?: number; team?: number }): {
  agent: number;
  project: number;
  team: number;
} {
  const agent = Number.isFinite(input.agent) ? Math.max(0, input.agent ?? 0) : 0;
  const project = Number.isFinite(input.project) ? Math.max(0, input.project ?? 0) : 0;
  const team = Number.isFinite(input.team) ? Math.max(0, input.team ?? 0) : 0;
  const sum = agent + project + team;
  if (sum <= 0) {
    return { ...DEFAULT_LAYER_WEIGHTS };
  }
  return {
    agent: agent / sum,
    project: project / sum,
    team: team / sum,
  };
}

function resolveProviderDefaultModel(provider: string): string {
  if (provider === "openrouter") {
    return DEFAULT_OPENROUTER_MODEL;
  }
  if (provider === "openai") {
    return DEFAULT_OPENAI_MODEL;
  }
  if (provider === "openai-compatible") {
    return DEFAULT_OPENAI_MODEL;
  }
  if (provider === "gemini") {
    return DEFAULT_GEMINI_MODEL;
  }
  if (provider === "voyage") {
    return DEFAULT_VOYAGE_MODEL;
  }
  return "";
}

function resolveScopeProvider(params: {
  scope: LayeredMemoryScope;
  defaultProvider: NonNullable<MemorySearchConfig["provider"]>;
}): NonNullable<MemorySearchConfig["provider"]> {
  if (params.scope.providerOverride) {
    return params.scope.providerOverride;
  }
  if (params.scope.sensitive) {
    return "local";
  }
  return params.defaultProvider === "local" ||
    params.defaultProvider === "openai" ||
    params.defaultProvider === "openai-compatible" ||
    params.defaultProvider === "gemini" ||
    params.defaultProvider === "voyage" ||
    params.defaultProvider === "openrouter"
    ? params.defaultProvider
    : "openrouter";
}

function resolveScopeFallback(params: {
  scope: LayeredMemoryScope;
  defaultFallback: NonNullable<MemorySearchConfig["fallback"]>;
}): NonNullable<MemorySearchConfig["fallback"]> {
  if (params.scope.sensitive) {
    return "local";
  }
  return params.defaultFallback;
}

function resolveFreshnessBoost(pathname: string): number {
  const match = pathname.match(/entries\/(\d{4})\/(\d{2})\//);
  if (!match) {
    return 0;
  }
  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return 0;
  }
  const now = new Date();
  const monthsSince = Math.max(
    0,
    (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month),
  );
  if (monthsSince <= 0) {
    return 0.05;
  }
  return Math.max(0, 0.05 - monthsSince * 0.005);
}

function rankToScore(index: number): number {
  return 1 / (index + 1);
}

function dedupeLayeredResults(results: LayeredMemoryResult[]): LayeredMemoryResult[] {
  const byKey = new Map<string, LayeredMemoryResult>();
  for (const entry of results) {
    const key = `${entry.path}:${entry.startLine}:${entry.endLine}:${entry.snippet.trim()}`;
    const existing = byKey.get(key);
    if (!existing || existing.finalScore < entry.finalScore) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function formatLayeredResultPath(params: {
  scopeKind: LayeredMemoryScope["kind"];
  scopeId: string;
  relPath: string;
}): string {
  return [
    LAYERED_PATH_PREFIX,
    encodePathPart(params.scopeKind),
    encodePathPart(params.scopeId),
    params.relPath.replace(/^\/+/, ""),
  ].join("/");
}

export function parseLayeredResultPath(pathname: string): {
  scopeKind: LayeredMemoryScope["kind"];
  scopeId: string;
  relPath: string;
} | null {
  const trimmed = pathname.trim().replace(/^\/+/, "");
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length < 4) {
    return null;
  }
  if (segments[0] !== LAYERED_PATH_PREFIX) {
    return null;
  }
  const kind = decodePathPart(segments[1] ?? "") as LayeredMemoryScope["kind"];
  if (kind !== "agent" && kind !== "project" && kind !== "team") {
    return null;
  }
  const scopeId = decodePathPart(segments[2] ?? "");
  const relPath = segments.slice(3).join("/");
  if (!scopeId || !relPath) {
    return null;
  }
  return { scopeKind: kind, scopeId, relPath };
}

async function buildScopedConfig(params: {
  cfg: OpenClawConfig;
  scope: LayeredMemoryScope;
  rootDir: string;
}): Promise<{ cfg: OpenClawConfig; agentId: string; scopeDir: string }> {
  const defaultsMemory = params.cfg.agents?.defaults?.memorySearch;
  const defaultProvider = ((defaultsMemory?.provider as string | undefined) ??
    "openrouter") as NonNullable<MemorySearchConfig["provider"]>;
  const defaultFallback = (defaultsMemory?.fallback ?? "none") as NonNullable<
    MemorySearchConfig["fallback"]
  >;
  const scopeProvider = resolveScopeProvider({
    scope: params.scope,
    defaultProvider,
  });
  const scopeFallback = resolveScopeFallback({
    scope: params.scope,
    defaultFallback,
  });
  const scopeModel =
    defaultsMemory?.provider === scopeProvider && defaultsMemory?.model?.trim()
      ? defaultsMemory.model
      : resolveProviderDefaultModel(scopeProvider);

  const scopeDir = await ensureLayeredScopeWorkspace({
    rootDir: params.rootDir,
    scopeKind: params.scope.kind,
    scopeId: params.scope.id,
  });
  const scopeIndexPath = resolveLayeredScopeIndexPath({
    rootDir: params.rootDir,
    scopeKind: params.scope.kind,
    scopeId: params.scope.id,
  });
  const syntheticAgentId = toLayeredSyntheticAgentId({
    scopeKind: params.scope.kind,
    scopeId: params.scope.id,
  });

  const scopeMemory: MemorySearchConfig = {
    ...defaultsMemory,
    enabled: true,
    provider: scopeProvider,
    model: scopeModel,
    fallback: scopeFallback,
    sources: ["memory"],
    experimental: { sessionMemory: false },
    store: {
      ...defaultsMemory?.store,
      driver: "sqlite",
      path: scopeIndexPath,
    },
    sync: {
      ...defaultsMemory?.sync,
      onSearch: true,
      onSessionStart: true,
      watch: true,
    },
  };

  const list = params.cfg.agents?.list ?? [];
  const filtered = list.filter((entry) => entry.id !== syntheticAgentId);
  return {
    cfg: {
      ...params.cfg,
      agents: {
        ...params.cfg.agents,
        list: [
          ...filtered,
          {
            id: syntheticAgentId,
            workspace: scopeDir,
            memorySearch: scopeMemory,
          },
        ],
      },
    },
    agentId: syntheticAgentId,
    scopeDir,
  };
}

export function resolveLayeredMemoryEnabled(cfg: OpenClawConfig): boolean {
  return cfg.memory?.layered?.enabled ?? true;
}

export function getLayeredMemorySearchMetrics(): {
  searches: number;
  results: number;
  failures: number;
} {
  return { ...LAYERED_SEARCH_METRICS };
}

export function resolveLayeredScopes(params: {
  cfg: OpenClawConfig;
  agentId: string;
  projectId?: string | null;
  teamId?: string | null;
}): LayeredMemoryScope[] {
  const scopeCfg = params.cfg.memory?.layered?.scopes;
  const weights = normalizeLayerWeights({
    agent: params.cfg.memory?.layered?.weights?.agent ?? DEFAULT_LAYER_WEIGHTS.agent,
    project: params.cfg.memory?.layered?.weights?.project ?? DEFAULT_LAYER_WEIGHTS.project,
    team: params.cfg.memory?.layered?.weights?.team ?? DEFAULT_LAYER_WEIGHTS.team,
  });
  const scopes: LayeredMemoryScope[] = [
    {
      kind: "agent",
      id: params.agentId,
      weight: weights.agent,
      sensitive: scopeCfg?.agent?.sensitive ?? false,
      providerOverride: scopeCfg?.agent?.providerOverride,
    },
  ];
  const projectId = params.projectId?.trim();
  if (projectId) {
    scopes.push({
      kind: "project",
      id: projectId,
      weight: weights.project,
      sensitive: scopeCfg?.project?.sensitive ?? false,
      providerOverride: scopeCfg?.project?.providerOverride,
    });
  }
  const teamId = params.teamId?.trim();
  if (teamId) {
    scopes.push({
      kind: "team",
      id: teamId,
      weight: weights.team,
      sensitive: scopeCfg?.team?.sensitive ?? false,
      providerOverride: scopeCfg?.team?.providerOverride,
    });
  }
  return scopes;
}

export async function searchLayeredMemory(params: {
  cfg: OpenClawConfig;
  agentId: string;
  query: string;
  scopes: LayeredMemoryScope[];
  maxResults?: number;
  minScore?: number;
  sessionKey?: string;
}): Promise<LayeredMemoryResult[]> {
  LAYERED_SEARCH_METRICS.searches += 1;
  if (!params.query.trim() || params.scopes.length === 0) {
    return [];
  }
  const rootDir = resolveLayeredMemoryRoot(params.cfg);
  const maxResults = Math.max(1, Math.floor(params.maxResults ?? 6));
  const minScore = typeof params.minScore === "number" ? params.minScore : 0;

  const perScopeResults = await Promise.all(
    params.scopes.map(async (scope) => {
      try {
        const scoped = await buildScopedConfig({
          cfg: params.cfg,
          scope,
          rootDir,
        });
        const { manager, error } = await getMemorySearchManager({
          cfg: scoped.cfg,
          agentId: scoped.agentId,
        });
        if (!manager) {
          if (error) {
            LAYERED_SEARCH_METRICS.failures += 1;
          }
          return { scope, results: [] as LayeredMemoryResult[], error };
        }
        const hits = await manager.search(params.query, {
          maxResults,
          minScore,
          sessionKey: params.sessionKey,
        });
        const mapped = hits.map((hit, index) => {
          const rankScore = rankToScore(index);
          const freshnessBoost = resolveFreshnessBoost(hit.path);
          const finalScore = scope.weight * rankScore + freshnessBoost;
          return {
            ...hit,
            path: formatLayeredResultPath({
              scopeKind: scope.kind,
              scopeId: scope.id,
              relPath: hit.path,
            }),
            score: finalScore,
            scopeKind: scope.kind,
            scopeId: scope.id,
            rankScore,
            freshnessBoost,
            finalScore,
          } satisfies LayeredMemoryResult;
        });
        return { scope, results: mapped };
      } catch {
        LAYERED_SEARCH_METRICS.failures += 1;
        return { scope, results: [] as LayeredMemoryResult[] };
      }
    }),
  );

  const merged = dedupeLayeredResults(perScopeResults.flatMap((entry) => entry.results))
    .filter((entry) => entry.finalScore >= minScore)
    .toSorted((a, b) => b.finalScore - a.finalScore)
    .slice(0, maxResults);
  LAYERED_SEARCH_METRICS.results += merged.length;
  return merged;
}

export async function readLayeredMemoryFile(params: {
  cfg: OpenClawConfig;
  layeredPath: string;
  from?: number;
  lines?: number;
}): Promise<{ text: string; path: string } | null> {
  const parsed = parseLayeredResultPath(params.layeredPath);
  if (!parsed) {
    return null;
  }
  const rootDir = resolveLayeredMemoryRoot(params.cfg);
  const scope: LayeredMemoryScope = {
    kind: parsed.scopeKind,
    id: parsed.scopeId,
    weight: 1,
    sensitive: false,
  };
  const scoped = await buildScopedConfig({
    cfg: params.cfg,
    scope,
    rootDir,
  });
  const { manager } = await getMemorySearchManager({
    cfg: scoped.cfg,
    agentId: scoped.agentId,
  });
  if (!manager) {
    return null;
  }
  return await manager.readFile({
    relPath: parsed.relPath,
    from: params.from,
    lines: params.lines,
  });
}

export async function syncLayeredMemoryScope(params: {
  cfg: OpenClawConfig;
  scopeKind: LayeredMemoryScope["kind"];
  scopeId: string;
  force?: boolean;
  reason?: string;
}): Promise<{
  scopeKind: LayeredMemoryScope["kind"];
  scopeId: string;
  provider: string;
  model?: string;
  files?: number;
  chunks?: number;
}> {
  const scopeId = params.scopeId.trim();
  if (!scopeId) {
    throw new Error("Layered scope id is required.");
  }
  const scopeCfg = params.cfg.memory?.layered?.scopes;
  const scope: LayeredMemoryScope = {
    kind: params.scopeKind,
    id: scopeId,
    weight: 1,
    sensitive:
      (params.scopeKind === "agent"
        ? scopeCfg?.agent?.sensitive
        : params.scopeKind === "project"
          ? scopeCfg?.project?.sensitive
          : scopeCfg?.team?.sensitive) ?? false,
    providerOverride:
      params.scopeKind === "agent"
        ? scopeCfg?.agent?.providerOverride
        : params.scopeKind === "project"
          ? scopeCfg?.project?.providerOverride
          : scopeCfg?.team?.providerOverride,
  };
  const rootDir = resolveLayeredMemoryRoot(params.cfg);
  const scoped = await buildScopedConfig({
    cfg: params.cfg,
    scope,
    rootDir,
  });
  const managerResult = await getMemorySearchManager({
    cfg: scoped.cfg,
    agentId: scoped.agentId,
    purpose: "default",
  });
  const manager = managerResult.manager;
  if (!manager) {
    throw new Error(managerResult.error ?? "Layered memory manager unavailable.");
  }
  try {
    if (!manager.sync) {
      throw new Error("Memory backend does not support manual reindex.");
    }
    await manager.sync({
      reason: params.reason ?? "cli-layered",
      force: Boolean(params.force),
    });
    const status = manager.status();
    return {
      scopeKind: params.scopeKind,
      scopeId,
      provider: status.provider,
      model: status.model,
      files: status.files,
      chunks: status.chunks,
    };
  } finally {
    await manager.close?.();
  }
}
