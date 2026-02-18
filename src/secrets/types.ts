/**
 * Types for the Secrets Safety system (SPEC §4.7).
 *
 * Secrets are never sent to cloud LLMs.  The vault tracks known secrets,
 * the scrubber replaces them with placeholders, and the audit log records
 * every access.
 */

// ── Classification ──────────────────────────────────────────────────────

/** How a piece of data is classified before being sent to an LLM. */
export type SecretClassification = "NEVER_SEND" | "REDACT" | "SAFE";

// ── Detection patterns ──────────────────────────────────────────────────

/** How a pattern matches text. */
export type PatternKind = "exact" | "env_var" | "regex" | "prefix";

/** A single detection rule for identifying secrets in text. */
export type DetectionPattern = {
  kind: PatternKind;
  /** Human-readable label (e.g. "OpenAI API Key"). */
  label: string;
  /**
   * The pattern payload — interpreted according to `kind`:
   *  - exact:   literal string
   *  - env_var: environment variable name
   *  - regex:   regex source string
   *  - prefix:  prefix string (e.g. "sk-")
   */
  value: string;
};

// ── Vault entries ───────────────────────────────────────────────────────

/** How a secret was discovered. */
export type SecretSource = "env" | "config" | "dotenv" | "manual" | "auto_scan";

/** A secret tracked by the vault. */
export type SecretEntry = {
  id: string;
  name: string;
  pattern: DetectionPattern;
  /** Encrypted/stored value — only available locally, never sent to LLMs. */
  encryptedValue: string | null;
  source: SecretSource;
  createdAtMs: number;
};

// ── Scrubber results ────────────────────────────────────────────────────

/** A single redaction performed by the scrubber. */
export type Redaction = {
  /** Name of the secret that was redacted. */
  secretName: string;
  /** Start offset in the original text. */
  start: number;
  /** End offset in the original text (exclusive). */
  end: number;
  /** The placeholder that replaced the secret, e.g. "[REDACTED: OpenAI API Key]". */
  placeholder: string;
};

/** Result of a scrub operation. */
export type ScrubResult = {
  /** The text with secrets replaced by placeholders. */
  scrubbed: string;
  /** All redactions performed. */
  redactions: Redaction[];
};

// ── Audit log ───────────────────────────────────────────────────────────

/** What happened with a secret. */
export type SecretAction = "scrubbed" | "injected" | "blocked" | "detected";

/** Where the secret was encountered. */
export type SecretContext = "prompt" | "file" | "env" | "terminal" | "memory" | "browser";

/** A single audit log entry. */
export type SecretAccessLog = {
  id: string;
  timestampMs: number;
  secretName: string;
  agentId: string | null;
  taskId: string | null;
  action: SecretAction;
  context: SecretContext;
};
