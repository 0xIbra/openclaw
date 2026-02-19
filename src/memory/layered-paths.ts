import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { LayeredMemoryScopeKind } from "./layered-types.js";
import { resolveStateDir } from "../config/paths.js";

const DEFAULT_LAYERED_ROOT_SEGMENTS = ["memory", "layers"];

function sanitizeScopeToken(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "unknown";
  }
  const safe = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "unknown";
}

export function resolveLayeredMemoryRoot(cfg: OpenClawConfig): string {
  const configured = cfg.memory?.layered?.storage?.root?.trim();
  if (configured) {
    if (configured.startsWith("~")) {
      return path.join(os.homedir(), configured.slice(1));
    }
    return path.resolve(configured);
  }
  return path.join(resolveStateDir(process.env, os.homedir), ...DEFAULT_LAYERED_ROOT_SEGMENTS);
}

export function resolveLayeredScopeDir(params: {
  rootDir: string;
  scopeKind: LayeredMemoryScopeKind;
  scopeId: string;
}): string {
  return path.join(params.rootDir, params.scopeKind, sanitizeScopeToken(params.scopeId));
}

export function resolveLayeredScopeIndexPath(params: {
  rootDir: string;
  scopeKind: LayeredMemoryScopeKind;
  scopeId: string;
}): string {
  return path.join(resolveLayeredScopeDir(params), "index.sqlite");
}

export function resolveLayeredScopeEntriesDir(params: {
  rootDir: string;
  scopeKind: LayeredMemoryScopeKind;
  scopeId: string;
  atMs: number;
}): string {
  const date = new Date(params.atMs);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return path.join(resolveLayeredScopeDir(params), "memory", "entries", year, month);
}

export async function ensureLayeredScopeWorkspace(params: {
  rootDir: string;
  scopeKind: LayeredMemoryScopeKind;
  scopeId: string;
}): Promise<string> {
  const scopeDir = resolveLayeredScopeDir(params);
  await fs.mkdir(path.join(scopeDir, "memory"), { recursive: true });
  const memoryFile = path.join(scopeDir, "MEMORY.md");
  try {
    await fs.access(memoryFile);
  } catch {
    await fs.writeFile(
      memoryFile,
      `# ${params.scopeKind}:${params.scopeId}\n\nLayered memory scope bootstrap.\n`,
      "utf-8",
    );
  }
  return scopeDir;
}

export async function writeLayeredScopeEntry(params: {
  rootDir: string;
  scopeKind: LayeredMemoryScopeKind;
  scopeId: string;
  entryId: string;
  atMs: number;
  markdown: string;
}): Promise<string> {
  const dir = resolveLayeredScopeEntriesDir({
    rootDir: params.rootDir,
    scopeKind: params.scopeKind,
    scopeId: params.scopeId,
    atMs: params.atMs,
  });
  await fs.mkdir(dir, { recursive: true });
  const safeEntryId = sanitizeScopeToken(params.entryId);
  const target = path.join(dir, `${safeEntryId}.md`);
  await fs.writeFile(target, params.markdown, "utf-8");
  return target;
}

export function toLayeredSyntheticAgentId(params: {
  scopeKind: LayeredMemoryScopeKind;
  scopeId: string;
}): string {
  return `layer-${params.scopeKind}-${sanitizeScopeToken(params.scopeId)}`;
}
