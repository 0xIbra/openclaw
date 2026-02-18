/**
 * Secret Injection — lets agents USE secrets without SEEING them (SPEC §4.7.7).
 *
 * The key insight: agents can _use_ secrets without _seeing_ them.
 * The system injects secret values at the execution layer (env vars for
 * commands, headers for API calls), NOT in the LLM prompt.
 */

import type { SecretAuditLogger } from "./audit.js";
import type { SecretVault } from "./vault.js";

export type SecretInjector = ReturnType<typeof createSecretInjector>;

export function createSecretInjector(vault: SecretVault, audit: SecretAuditLogger) {
  /**
   * Get a secret value by name for execution-time injection.
   *
   * Returns the raw value if the requesting agent is authorized.
   * The value is NEVER included in LLM context — only used for
   * command env vars, API headers, etc.
   *
   * @returns `{ value, confirmation }` or `{ blocked, reason }`.
   */
  function get(params: {
    name: string;
    agentId: string;
    taskId?: string;
  }): { value: string; confirmation: string } | { blocked: true; reason: string } {
    const value = vault.getValue(params.name);

    if (value === null) {
      audit.log({
        secretName: params.name,
        agentId: params.agentId,
        taskId: params.taskId ?? null,
        action: "blocked",
        context: "env",
      });
      return {
        blocked: true,
        reason: `secret not found: ${params.name}`,
      };
    }

    // TODO: In the future, add per-team authorization checks here.
    // For now, any registered agent can access any registered secret.

    audit.log({
      secretName: params.name,
      agentId: params.agentId,
      taskId: params.taskId ?? null,
      action: "injected",
      context: "env",
    });

    return {
      value,
      confirmation: `[Using secret: ${params.name}]`,
    };
  }

  /**
   * Build an environment object with secrets injected by name.
   *
   * Accepts a map of `{ ENV_VAR_NAME: secretName }` and returns
   * an env object with the actual secret values filled in.
   * This is used when spawning commands that need credentials.
   */
  function buildEnv(params: {
    secretBindings: Record<string, string>;
    agentId: string;
    taskId?: string;
  }): { env: Record<string, string>; errors: string[] } {
    const env: Record<string, string> = {};
    const errors: string[] = [];

    for (const [envVar, secretName] of Object.entries(params.secretBindings)) {
      const result = get({
        name: secretName,
        agentId: params.agentId,
        taskId: params.taskId,
      });

      if ("blocked" in result) {
        errors.push(`${envVar}: ${result.reason}`);
      } else {
        env[envVar] = result.value;
      }
    }

    return { env, errors };
  }

  return { get, buildEnv };
}
