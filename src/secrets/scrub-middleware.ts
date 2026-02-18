/**
 * Scrub middleware — wraps text-producing operations to ensure secrets
 * are redacted before the text enters LLM context (SPEC §4.7.5).
 *
 * Usage:
 *   import { scrubText } from "../secrets/scrub-middleware.js";
 *   const safe = scrubText(rawInput);          // quick one-shot
 *   const mw  = createScrubMiddleware();       // reusable, caches vault
 *   const safe2 = mw.scrub(rawInput);
 */

import type { ScrubResult, SecretContext } from "./types.js";
import { createSecretAuditLogger } from "./audit.js";
import { BUILTIN_PATTERNS, MIN_PREFIX_TOKEN_LENGTH } from "./patterns.js";
import { createSecretScrubber } from "./scrubber.js";
import { createSecretVault, type SecretVault } from "./vault.js";

type Scrubber = {
  scrub: (text: string, meta?: ScrubCallMeta) => ScrubResult;
  contains: (text: string, meta?: ScrubCallMeta) => boolean;
};

type ScrubMiddleware = Scrubber & {
  close: () => void;
};

export type ScrubCallMeta = {
  context?: SecretContext;
  agentId?: string | null;
  taskId?: string | null;
};

let globalMiddleware: ScrubMiddleware | null = null;
const fallbackScrubber = createSecretScrubber({
  list: () => [],
} as unknown as SecretVault);

function scrubWithFallback(text: string): ScrubResult {
  return fallbackScrubber.scrub(text);
}

function containsWithFallback(text: string): boolean {
  if (!text) {
    return false;
  }
  if (fallbackScrubber.contains(text)) {
    return true;
  }
  const envPatterns = BUILTIN_PATTERNS.filter((pattern) => pattern.kind === "env_var");
  for (const pattern of envPatterns) {
    if (new RegExp(pattern.value).test(text)) {
      return true;
    }
  }
  const prefixPatterns = BUILTIN_PATTERNS.filter((pattern) => pattern.kind === "prefix");
  for (const pattern of prefixPatterns) {
    const escaped = pattern.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `${escaped}[A-Za-z0-9_\\-/+=]{${Math.max(1, MIN_PREFIX_TOKEN_LENGTH - pattern.value.length)},}`,
    );
    if (re.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Create a reusable scrub middleware backed by the default vault.
 * The vault & scrubber are lazily initialised and should be closed
 * when no longer needed.
 */
export function createScrubMiddleware(): ScrubMiddleware {
  const vault = createSecretVault();
  const audit = createSecretAuditLogger();
  const scrubber = createSecretScrubber(vault, { audit });

  return {
    scrub: (text: string, meta?: ScrubCallMeta) => scrubber.scrub(text, meta),
    contains: (text: string, meta?: ScrubCallMeta) => scrubber.contains(text, meta),
    close: () => {
      audit.close();
      vault.close();
    },
  };
}

/**
 * Quick one-shot: scrub a string using a shared middleware instance.
 * Designed for call sites that do not manage their own lifecycle.
 */
export function scrubText(text: string, meta?: ScrubCallMeta): string {
  if (!text) {
    return text;
  }
  try {
    if (!globalMiddleware) {
      globalMiddleware = createScrubMiddleware();
    }
    return globalMiddleware.scrub(text, meta).scrubbed;
  } catch {
    // Never fail-open: if persistent vault/audit is unavailable, still apply
    // defense-in-depth pattern scrubbing to avoid leaking secrets.
    return scrubWithFallback(text).scrubbed;
  }
}

/**
 * Quick one-shot: check whether a string contains any known secrets.
 */
export function containsSecrets(text: string, meta?: ScrubCallMeta): boolean {
  if (!text) {
    return false;
  }
  try {
    if (!globalMiddleware) {
      globalMiddleware = createScrubMiddleware();
    }
    return globalMiddleware.contains(text, meta);
  } catch {
    return containsWithFallback(text);
  }
}
