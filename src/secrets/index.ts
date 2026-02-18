/**
 * Secrets module barrel export.
 */

export type {
  SecretClassification,
  PatternKind,
  DetectionPattern,
  SecretSource,
  SecretEntry,
  Redaction,
  ScrubResult,
  SecretAction,
  SecretContext,
  SecretAccessLog,
} from "./types.js";

export { BUILTIN_PATTERNS, DENIED_FILE_PATTERNS, MIN_PREFIX_TOKEN_LENGTH } from "./patterns.js";

export {
  type SecretsDatabase,
  SECRETS_SCHEMA_VERSION,
  resolveSecretsDbPath,
  openSecretsDatabase,
  initializeSecretsSchema,
} from "./sqlite.js";

export { type SecretVault, createSecretVault } from "./vault.js";
export { type SecretScrubber, createSecretScrubber } from "./scrubber.js";
export { type SecretAuditLogger, createSecretAuditLogger } from "./audit.js";
export { type SecretInjector, createSecretInjector } from "./inject.js";
export { scrubText, containsSecrets, createScrubMiddleware } from "./scrub-middleware.js";
export { createSecretsCrypto } from "./crypto.js";
