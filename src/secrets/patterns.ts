/**
 * Built-in detection patterns for common secret formats (SPEC §4.7.4).
 *
 * Users can add custom patterns via config.  These are the defaults that
 * ship with every installation.
 */

import type { DetectionPattern } from "./types.js";

// ── Prefix-based patterns ───────────────────────────────────────────────

const PREFIX_PATTERNS: DetectionPattern[] = [
  { kind: "prefix", label: "OpenAI API Key", value: "sk-proj-" },
  { kind: "prefix", label: "OpenAI API Key (legacy)", value: "sk-" },
  { kind: "prefix", label: "Anthropic API Key", value: "sk-ant-" },
  { kind: "prefix", label: "GitHub PAT", value: "ghp_" },
  { kind: "prefix", label: "GitHub OAuth Token", value: "gho_" },
  { kind: "prefix", label: "GitHub User Token", value: "ghu_" },
  { kind: "prefix", label: "GitHub Server Token", value: "ghs_" },
  { kind: "prefix", label: "GitHub Refresh Token", value: "ghr_" },
  { kind: "prefix", label: "AWS Access Key ID", value: "AKIA" },
  { kind: "prefix", label: "Slack Bot Token", value: "xoxb-" },
  { kind: "prefix", label: "Slack User Token", value: "xoxp-" },
  { kind: "prefix", label: "GitLab PAT", value: "glpat-" },
  { kind: "prefix", label: "npm Token", value: "npm_" },
  { kind: "prefix", label: "PyPI Token", value: "pypi-" },
  { kind: "prefix", label: "Stripe Secret Key", value: "sk_live_" },
  { kind: "prefix", label: "Stripe Test Key", value: "sk_test_" },
  { kind: "prefix", label: "Telegram Bot Token", value: "bot" }, // handled via regex below more precisely
];

// ── Regex-based patterns ────────────────────────────────────────────────

const REGEX_PATTERNS: DetectionPattern[] = [
  {
    kind: "regex",
    label: "Private Key Block",
    value: "-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----",
  },
  {
    kind: "regex",
    label: "AWS Secret Access Key",
    // 40-char base64 following known prefixes
    value: "(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\\s*[=:]\\s*[A-Za-z0-9/+=]{40}",
  },
  {
    kind: "regex",
    label: "Generic Connection String",
    value: "(?:postgres|mysql|mongodb|redis|amqp)://[^\\s]+:[^\\s]+@[^\\s]+",
  },
];

// ── Env-var name patterns ───────────────────────────────────────────────

const ENV_VAR_PATTERNS: DetectionPattern[] = [
  { kind: "env_var", label: "Secret Env Var (*_SECRET)", value: "_SECRET$" },
  { kind: "env_var", label: "Key Env Var (*_KEY)", value: "_KEY$" },
  { kind: "env_var", label: "Token Env Var (*_TOKEN)", value: "_TOKEN$" },
  { kind: "env_var", label: "Password Env Var (*_PASSWORD)", value: "_PASSWORD$" },
  { kind: "env_var", label: "Credential Env Var (*_CREDENTIAL)", value: "_CREDENTIAL$" },
  { kind: "env_var", label: "API Key Env Var (*_API_KEY)", value: "_API_KEY$" },
  { kind: "env_var", label: "Database URL", value: "^DATABASE_URL$" },
  { kind: "env_var", label: "Redis URL", value: "^REDIS_URL$" },
  { kind: "env_var", label: "MongoDB URI", value: "^MONGO_URI$" },
  { kind: "env_var", label: "Secret Key Base", value: "^SECRET_KEY_BASE$" },
];

// ── File deny-list (files that should never be read) ────────────────────

/**
 * Glob patterns for files that should never be sent to cloud LLMs.
 * The scrubber enforces these as a pre-check before allowing file reads.
 */
export const DENIED_FILE_PATTERNS: string[] = [
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "id_dsa",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.jks",
  ".env.production",
  ".env.local",
  ".env.*.local",
  "*credentials*",
  "*.keystore",
  "service-account*.json",
];

// ── Aggregated export ───────────────────────────────────────────────────

/** All built-in detection patterns shipped with the system. */
export const BUILTIN_PATTERNS: readonly DetectionPattern[] = [
  ...PREFIX_PATTERNS,
  ...REGEX_PATTERNS,
  ...ENV_VAR_PATTERNS,
];

/**
 * Minimum length for a prefix-matched token to be considered a secret.
 * Prevents false positives on very short strings that happen to start
 * with a known prefix.
 */
export const MIN_PREFIX_TOKEN_LENGTH = 10;
