/**
 * Browser Task Executor using playwright-cli
 *
 * Executes browser automation tasks via playwright-cli shell commands.
 */

import path from "node:path";
import type {
  TaskExecutionInput,
  TaskExecutionResult,
  TaskExecutor,
} from "../tasks/runtime/types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  createBrowserSession,
  navigate,
  getSnapshot,
  click,
  typeText,
  fill,
  screenshot,
  pressKey,
  evaluate,
} from "./server.js";

const log = createSubsystemLogger("browser-cli");

export interface BrowserTaskExecutorOptions {
  agentId: string;
  dataDir: string;
  headless?: boolean;
}

interface BrowserStep {
  action:
    | "navigate"
    | "click"
    | "type"
    | "fill"
    | "screenshot"
    | "evaluate"
    | "press"
    | "wait"
    | "snapshot";
  url?: string;
  ref?: string;
  text?: string;
  expression?: string;
  key?: string;
  timeout?: number;
}

function parseTaskDescription(description: string): BrowserStep[] {
  const steps: BrowserStep[] = [];
  const lines = description.split(/\n/).filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();

    // Navigate
    if (trimmed.match(/^https?:\/\//)) {
      steps.push({ action: "navigate", url: trimmed });
      continue;
    }

    // Click: "click e2" or "click button 'Submit'"
    const clickMatch = trimmed.match(/^click\s+(\w+)/i);
    if (clickMatch) {
      steps.push({ action: "click", ref: clickMatch[1] });
      continue;
    }

    // Type: "type 'hello world'"
    const typeMatch = trimmed.match(/^type\s+['"](.+)['"]$/i);
    if (typeMatch) {
      steps.push({ action: "type", text: typeMatch[1] });
      continue;
    }

    // Fill: "fill e2 'value'"
    const fillMatch = trimmed.match(/^fill\s+(\w+)\s+['"](.+)['"]$/i);
    if (fillMatch) {
      steps.push({ action: "fill", ref: fillMatch[1], text: fillMatch[2] });
      continue;
    }

    // Screenshot
    if (trimmed.match(/^screenshot/i)) {
      steps.push({ action: "screenshot" });
      continue;
    }

    // Snapshot
    if (trimmed.match(/^snapshot/i)) {
      steps.push({ action: "snapshot" });
      continue;
    }

    // Press: "press Enter"
    const pressMatch = trimmed.match(/^press\s+(\w+)$/i);
    if (pressMatch) {
      steps.push({ action: "press", key: pressMatch[1] });
      continue;
    }

    // Evaluate
    const evalMatch = trimmed.match(/^eval\s+(.+)$/i);
    if (evalMatch) {
      steps.push({ action: "evaluate", expression: evalMatch[1] });
      continue;
    }

    // Wait
    const waitMatch = trimmed.match(/^wait\s+(\d+)$/i);
    if (waitMatch) {
      steps.push({ action: "wait", timeout: parseInt(waitMatch[1], 10) });
      continue;
    }

    // Default: navigate if looks like URL
    if (trimmed.includes(".") && !trimmed.includes(" ")) {
      steps.push({ action: "navigate", url: trimmed });
    }
  }

  return steps;
}

async function executeBrowserTask(
  session: Awaited<ReturnType<typeof createBrowserSession>>,
  description: string,
): Promise<{ summary: string; actions: number }> {
  const steps = parseTaskDescription(description);
  const results: string[] = [];
  let actions = 0;

  for (const step of steps) {
    log.info(`Executing: ${step.action}`);

    switch (step.action) {
      case "navigate": {
        if (step.url) {
          await navigate(session, step.url);
          results.push(`Navigated to ${step.url}`);
          actions++;
        }
        break;
      }

      case "click": {
        if (step.ref) {
          await click(session, step.ref);
          results.push(`Clicked ${step.ref}`);
          actions++;
        }
        break;
      }

      case "type": {
        if (step.text) {
          await typeText(session, step.text);
          results.push(`Typed text`);
          actions++;
        }
        break;
      }

      case "fill": {
        if (step.ref && step.text) {
          await fill(session, step.ref, step.text);
          results.push(`Filled ${step.ref}`);
          actions++;
        }
        break;
      }

      case "screenshot": {
        const filepath = await screenshot(session);
        results.push(`Screenshot saved: ${filepath}`);
        actions++;
        break;
      }

      case "snapshot": {
        const snapshot = await getSnapshot(session);
        results.push(
          `Page: ${snapshot.title} (${snapshot.url}) - ${snapshot.elements.length} elements`,
        );
        actions++;
        break;
      }

      case "press": {
        if (step.key) {
          await pressKey(session, step.key);
          results.push(`Pressed ${step.key}`);
          actions++;
        }
        break;
      }

      case "evaluate": {
        if (step.expression) {
          const result = await evaluate(session, step.expression);
          results.push(`Evaluated: ${JSON.stringify(result).slice(0, 100)}`);
          actions++;
        }
        break;
      }

      case "wait": {
        await new Promise((r) => setTimeout(r, step.timeout ?? 1000));
        results.push(`Waited ${step.timeout}ms`);
        break;
      }
    }
  }

  // Always end with a snapshot
  if (steps.length === 0 || steps[steps.length - 1].action !== "snapshot") {
    try {
      const snapshot = await getSnapshot(session);
      results.push(`Final page: ${snapshot.title} (${snapshot.url})`);
    } catch {
      // Ignore snapshot errors at end
    }
  }

  return {
    summary: results.join("; ") || "No actions performed",
    actions,
  };
}

export function createBrowserTaskExecutor(options: BrowserTaskExecutorOptions): TaskExecutor {
  return {
    async execute(input: TaskExecutionInput): Promise<TaskExecutionResult> {
      const startTime = Date.now();
      const sessionId = `${options.agentId}-${input.task.id}`;
      const profileDir = path.join(
        options.dataDir,
        "browser-profiles",
        options.agentId,
        input.task.id,
      );

      log.info(
        `Creating browser task executor for agent ${options.agentId}, task ${input.task.id}`,
      );

      const session = await createBrowserSession({
        sessionId,
        profileDir,
        headless: options.headless ?? true,
      });

      try {
        const result = await executeBrowserTask(session, input.task.description);
        const durationMs = Date.now() - startTime;

        return {
          status: "success",
          summary: result.summary,
          metrics: {
            durationMs,
            toolCalls: result.actions,
          },
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorText = error instanceof Error ? error.message : String(error);

        log.error(`Browser task failed: ${errorText}`);

        return {
          status: "failed",
          errorText,
          metrics: {
            durationMs,
            toolCalls: 0,
          },
        };
      } finally {
        await session.stop();
      }
    },
  };
}
