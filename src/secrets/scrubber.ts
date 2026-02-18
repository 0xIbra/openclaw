/**
 * Secret Scrubber — replaces all known secrets with placeholders (SPEC §4.7.5).
 *
 * This is the core defense layer that prevents secrets from leaking to
 * cloud LLMs.  Enforced at:
 *  1. System prompt construction
 *  2. File content reads
 *  3. Environment variable access
 *  4. Terminal output
 *  5. Memory ingestion
 *  6. Browser session data
 */

import type { SecretAuditLogger } from "./audit.js";
import type { ScrubResult, Redaction, SecretClassification, SecretContext } from "./types.js";
import type { SecretVault } from "./vault.js";
import { BUILTIN_PATTERNS, MIN_PREFIX_TOKEN_LENGTH } from "./patterns.js";

// ── Scrubber ────────────────────────────────────────────────────────────

export type SecretScrubber = ReturnType<typeof createSecretScrubber>;

type ScrubCallMeta = {
  context?: SecretContext;
  agentId?: string | null;
  taskId?: string | null;
};

export function createSecretScrubber(
  vault: SecretVault,
  opts?: {
    audit?: SecretAuditLogger;
    context?: SecretContext;
    agentId?: string | null;
    taskId?: string | null;
  },
) {
  const resolveMeta = (meta?: ScrubCallMeta) => ({
    context: meta?.context ?? opts?.context ?? "prompt",
    agentId: meta?.agentId ?? opts?.agentId ?? null,
    taskId: meta?.taskId ?? opts?.taskId ?? null,
  });

  const logAction = (
    action: "scrubbed" | "detected",
    names: Iterable<string>,
    meta?: ScrubCallMeta,
  ) => {
    if (!opts?.audit) {
      return;
    }
    const resolved = resolveMeta(meta);
    for (const name of names) {
      opts.audit.log({
        secretName: name,
        agentId: resolved.agentId,
        taskId: resolved.taskId,
        action,
        context: resolved.context,
      });
    }
  };

  /**
   * Scrub all known secrets from a string.
   * Returns the scrubbed text and a list of all redactions performed.
   */
  function scrub(text: string, meta?: ScrubCallMeta): ScrubResult {
    if (!text) {
      return { scrubbed: text, redactions: [] };
    }

    const entries = vault.list();
    const redactions: Redaction[] = [];
    let result = text;

    // Sort entries by value length descending so longer matches take priority
    const sortedEntries = entries
      .filter((e) => e.encryptedValue && e.encryptedValue.length > 0)
      .toSorted((a, b) => (b.encryptedValue?.length ?? 0) - (a.encryptedValue?.length ?? 0));

    for (const entry of sortedEntries) {
      const secretValue = entry.encryptedValue;
      if (!secretValue) {
        continue;
      }

      const placeholder = `[REDACTED: ${entry.name}]`;
      let searchFrom = 0;

      while (true) {
        const idx = result.indexOf(secretValue, searchFrom);
        if (idx < 0) {
          break;
        }

        redactions.push({
          secretName: entry.name,
          start: idx,
          end: idx + secretValue.length,
          placeholder,
        });

        result = result.slice(0, idx) + placeholder + result.slice(idx + secretValue.length);
        searchFrom = idx + placeholder.length;
      }
    }

    // Also scan for built-in prefix patterns that might not be registered yet
    result = scrubUnregisteredPatterns(result, redactions);

    if (redactions.length > 0) {
      logAction("scrubbed", new Set(redactions.map((redaction) => redaction.secretName)), meta);
    }

    return { scrubbed: result, redactions };
  }

  /**
   * Scrub patterns that might not be in the vault yet.
   * This catches secrets that were missed by auto-discovery — defense in depth.
   */
  function scrubUnregisteredPatterns(text: string, redactions: Redaction[]): string {
    let result = text;
    const prefixPatterns = BUILTIN_PATTERNS.filter((p) => p.kind === "prefix");

    for (const pattern of prefixPatterns) {
      // Find word-like tokens starting with this prefix
      const escapedPrefix = escapeRegex(pattern.value);
      const re = new RegExp(
        `${escapedPrefix}[A-Za-z0-9_\\-/+=]{${MIN_PREFIX_TOKEN_LENGTH - pattern.value.length},}`,
        "g",
      );
      let match: RegExpExecArray | null;

      while ((match = re.exec(result)) !== null) {
        const token = match[0];
        // Don't re-redact already-redacted placeholders
        if (result.slice(Math.max(0, match.index - 10), match.index).includes("[REDACTED:")) {
          continue;
        }
        // Check if this exact value is already registered — if so the earlier pass handled it
        const alreadyRedacted = redactions.some(
          (r) => r.start <= match!.index && r.end >= match!.index + token.length,
        );
        if (alreadyRedacted) {
          continue;
        }

        const placeholder = `[REDACTED: ${pattern.label}]`;
        redactions.push({
          secretName: pattern.label,
          start: match.index,
          end: match.index + token.length,
          placeholder,
        });
        result =
          result.slice(0, match.index) + placeholder + result.slice(match.index + token.length);
        // Adjust regex lastIndex since the string changed
        re.lastIndex = match.index + placeholder.length;
      }
    }

    // Scan for regex patterns too
    const regexPatterns = BUILTIN_PATTERNS.filter((p) => p.kind === "regex");
    for (const pattern of regexPatterns) {
      try {
        const re = new RegExp(pattern.value, "g");
        let match: RegExpExecArray | null;
        while ((match = re.exec(result)) !== null) {
          if (result.slice(Math.max(0, match.index - 10), match.index).includes("[REDACTED:")) {
            continue;
          }
          const token = match[0];
          const placeholder = `[REDACTED: ${pattern.label}]`;
          redactions.push({
            secretName: pattern.label,
            start: match.index,
            end: match.index + token.length,
            placeholder,
          });
          result =
            result.slice(0, match.index) + placeholder + result.slice(match.index + token.length);
          re.lastIndex = match.index + placeholder.length;
        }
      } catch {
        // invalid regex — skip
      }
    }

    return result;
  }

  /**
   * Check whether a string contains any known secrets.
   */
  function contains(text: string, meta?: ScrubCallMeta): boolean {
    if (!text) {
      return false;
    }
    const detected = new Set<string>();

    // Check registered secrets
    const entries = vault.list();
    for (const entry of entries) {
      if (entry.encryptedValue && text.includes(entry.encryptedValue)) {
        detected.add(entry.name);
      }
    }

    // Check built-in prefix patterns
    const prefixPatterns = BUILTIN_PATTERNS.filter((p) => p.kind === "prefix");
    for (const pattern of prefixPatterns) {
      const escapedPrefix = escapeRegex(pattern.value);
      const re = new RegExp(
        `${escapedPrefix}[A-Za-z0-9_\\-/+=]{${MIN_PREFIX_TOKEN_LENGTH - pattern.value.length},}`,
      );
      if (re.test(text)) {
        detected.add(pattern.label);
      }
    }

    // Check regex patterns
    const regexPatterns = BUILTIN_PATTERNS.filter((p) => p.kind === "regex");
    for (const pattern of regexPatterns) {
      try {
        if (new RegExp(pattern.value).test(text)) {
          detected.add(pattern.label);
        }
      } catch {
        // skip
      }
    }

    if (detected.size > 0) {
      logAction("detected", detected, meta);
      return true;
    }
    return false;
  }

  /**
   * Classify a piece of text for LLM sending.
   */
  function classify(text: string, meta?: ScrubCallMeta): SecretClassification {
    if (!text) {
      return "SAFE";
    }
    if (contains(text, meta)) {
      return "NEVER_SEND";
    }
    return "SAFE";
  }

  return { scrub, contains, classify };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
