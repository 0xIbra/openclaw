/**
 * Composite TaskExecutor that routes tasks to the appropriate executor.
 *
 * - Browser tasks (web, research, etc.) -> BrowserTaskExecutor
 * - All other tasks -> EmbeddedTaskExecutor
 */

import type { OpenClawConfig } from "../../config/config.js";
import type { TaskExecutionInput, TaskExecutionResult, TaskExecutor } from "./types.js";
import { createBrowserExecutor, isBrowserTask } from "../../browser-cli/index.js";
import { TASK_WORKER_EXECUTION_TIMEOUT_MS } from "./defaults.js";
import { createEmbeddedTaskExecutor } from "./executor-embedded.js";

export interface CompositeTaskExecutorOptions {
  agentId: string;
  dataDir: string;
  config?: OpenClawConfig;
  loadCurrentConfig?: () => OpenClawConfig;
  timeoutMs?: number;
  /** Force headless mode (useful in CI/server environments) */
  headless?: boolean;
}

/**
 * Create a TaskExecutor that automatically routes tasks to the appropriate
 * implementation based on task type and payload.
 */
export function createCompositeTaskExecutor(options: CompositeTaskExecutorOptions): TaskExecutor {
  // Create the embedded executor for general tasks
  const embeddedExecutor = createEmbeddedTaskExecutor({
    agentId: options.agentId,
    config: options.config,
    loadCurrentConfig: options.loadCurrentConfig,
    timeoutMs: options.timeoutMs ?? TASK_WORKER_EXECUTION_TIMEOUT_MS,
  });

  // Create the browser executor for web automation tasks
  const browserExecutor = createBrowserExecutor({
    agentId: options.agentId,
    dataDir: options.dataDir,
    headless: options.headless ?? false,
    timeoutMs: options.timeoutMs ?? TASK_WORKER_EXECUTION_TIMEOUT_MS,
  });

  return {
    async execute(input: TaskExecutionInput): Promise<TaskExecutionResult> {
      // Route based on task type
      if (isBrowserTask(input.task.type, input.task.description)) {
        console.log(
          `[CompositeExecutor] Routing task ${input.task.id} (${input.task.type}) to BrowserExecutor`,
        );
        return browserExecutor.execute(input);
      }

      // Default to embedded executor
      return embeddedExecutor.execute(input);
    },
  };
}

/**
 * Factory for creating composite executors for different agents.
 */
export function createCompositeTaskExecutorFactory(params?: {
  dataDir: string;
  config?: OpenClawConfig;
  loadCurrentConfig?: () => OpenClawConfig;
  timeoutMs?: number;
  headless?: boolean;
}): (agentId: string) => TaskExecutor {
  return (agentId: string) =>
    createCompositeTaskExecutor({
      agentId,
      dataDir: params?.dataDir ?? ".openclaw",
      config: params?.config,
      loadCurrentConfig: params?.loadCurrentConfig,
      timeoutMs: params?.timeoutMs,
      headless: params?.headless,
    });
}
