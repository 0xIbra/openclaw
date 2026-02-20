/**
 * Ares Master Control Agent
 *
 * Export the Ares control plane for team/task/project management.
 */

export { ares, createAresRuntime } from "./runtime.js";
export { classifyIntent, shouldHandleAsAres } from "./intents.js";
export { buildAresPrompt, ARES_IDENTITY } from "./prompts.js";
export type { AresIntent, AresContext, AresResult, AresRuntime } from "./types.js";
