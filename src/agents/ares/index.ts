/**
 * Ares Master Control Agent
 *
 * Export the Ares control plane for team/task/project management.
 */

export { ares, createAresRuntime } from "./runtime.js";
export { shouldHandleAsAres } from "./intents.js";
export { ARES_SYSTEM_PROMPT } from "./prompts.js";
export type { AresContext, AresResult, AresRuntime } from "./types.js";
