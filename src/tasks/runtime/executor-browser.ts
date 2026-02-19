/**
 * Browser Task Executor
 *
 * Executes web automation tasks using Playwright CLI.
 * Provides browser capabilities (navigation, screenshots, actions) for task workers.
 */

import type { OpenClawConfig } from "../../config/config.js";
import type { TaskExecutor, TaskExecutionInput, TaskExecutionResult } from "./types.js";
import { BrowserClient, isPlaywrightCliAvailable } from "../../browser-cli/client.js";

interface BrowserTaskParams {
  /** URL to navigate to */
  url?: string;
  /** Sequence of actions to perform */
  actions?: BrowserAction[];
  /** Take screenshot at end */
  screenshot?: boolean;
  /** Wait for specific condition */
  waitFor?: {
    selector?: string;
    text?: string;
    timeout?: number;
  };
  /** Extract data from page */
  extract?: {
    selector: string;
    attribute?: string;
    multiple?: boolean;
  };
  /** Evaluate JavaScript on page */
  evaluate?: string;
}

type BrowserAction =
  | { type: "navigate"; url: string }
  | {
      type: "click";
      ref: string;
      options?: { button?: "left" | "right" | "middle"; doubleClick?: boolean };
    }
  | { type: "type"; ref: string; text: string; submit?: boolean }
  | { type: "press"; key: string }
  | { type: "hover"; ref: string }
  | { type: "scrollIntoView"; ref: string }
  | { type: "selectOption"; ref: string; values: string[] }
  | { type: "wait"; time?: number; selector?: string; text?: string; url?: string }
  | { type: "snapshot" };

export interface BrowserTaskExecutorOptions {
  agentId: string;
  config?: OpenClawConfig;
  /** Headless mode (default: false) */
  headless?: boolean;
  /** Default viewport (default: 1280x720) */
  viewport?: { width: number; height: number };
  /** Keep browser open between tasks (default: true) */
  persistentContext?: boolean;
}

export function createBrowserTaskExecutor(options: BrowserTaskExecutorOptions): TaskExecutor {
  let client: BrowserClient | null = null;

  async function getClient(): Promise<BrowserClient> {
    if (!client) {
      const available = await isPlaywrightCliAvailable();
      if (!available) {
        throw new Error("playwright-cli not installed. Run: npm install -g @playwright/cli");
      }
      client = new BrowserClient({
        agentId: options.agentId,
        headless: options.headless ?? false,
        viewport: options.viewport ?? { width: 1280, height: 720 },
      });
      await client.start();
    }
    return client;
  }

  return {
    execute: async (input: TaskExecutionInput): Promise<TaskExecutionResult> => {
      const startTime = Date.now();
      const changedFiles: string[] = [];
      const notes: string[] = [];

      try {
        // Parse task description for browser commands
        const params = parseTaskDescription(input.task.description);

        // Start browser
        let client: BrowserClient | null = await getClient();

        // Execute actions
        const results: unknown[] = [];

        // Navigate if URL provided
        if (params.url) {
          const nav = await client.navigate(params.url);
          notes.push(`Navigated to: ${nav.url} (${nav.title})`);
        }

        // Execute action sequence
        if (params.actions) {
          for (const action of params.actions) {
            const result = await executeAction(client, action);
            results.push(result);
          }
        }

        // Wait for condition
        if (params.waitFor) {
          await client.wait({
            selector: params.waitFor.selector,
            text: params.waitFor.text,
            timeout: params.waitFor.timeout,
          });
        }

        // Extract data
        let extractedData: unknown = null;
        if (params.extract) {
          const script = params.extract.multiple
            ? `Array.from(document.querySelectorAll('${params.extract.selector}')).map(el => '${params.extract.attribute}' ? el.getAttribute('${params.extract.attribute}') : el.textContent)`
            : `document.querySelector('${params.extract.selector}')?.${params.extract.attribute ? `getAttribute('${params.extract.attribute}')` : "textContent"}`;
          extractedData = await client.evaluate(script);
        }

        // Evaluate custom script
        if (params.evaluate) {
          const evalResult = await client.evaluate(params.evaluate);
          results.push({ evaluate: evalResult });
        }

        // Take screenshot
        if (params.screenshot) {
          const _screenshot = await client.screenshot({ fullPage: true });
          // TODO: Save screenshot to file and add to changedFiles
          notes.push("Screenshot captured");
        }

        // Get final page state
        const finalState = await client.getUrl();

        // Close browser if not persistent
        if (options.persistentContext === false) {
          await client.stop();
          client = null;
        }

        const duration = Date.now() - startTime;

        return {
          status: "success",
          summary: `Browser automation completed: ${finalState.title} (${finalState.url})`,
          notes: notes.join("\n"),
          changedFiles,
          metrics: {
            durationMs: duration,
            actionsExecuted: params.actions?.length ?? 0,
            extractedData,
            results,
          },
          session: {
            backend: "playwright-cli",
            id: options.agentId,
          },
        };
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);

        // Try to capture final state even on error
        let finalUrl = "unknown";
        try {
          finalUrl = client ? (await client.getUrl()).url : "unknown";
        } catch {
          // Ignore
        }

        // Close browser on error
        await client?.stop().catch(() => {});

        return {
          status: "failed",
          errorText,
          summary: `Browser automation failed at ${finalUrl}`,
          notes: notes.join("\n"),
          changedFiles,
          metrics: {
            durationMs: Date.now() - startTime,
          },
          session: {
            backend: "playwright-cli",
            id: options.agentId,
          },
        };
      }
    },
  };
}

async function executeAction(client: BrowserClient, action: BrowserAction): Promise<unknown> {
  switch (action.type) {
    case "navigate":
      return client.navigate(action.url);

    case "click":
      return client.click(action.ref, action.options);

    case "type":
      return client.type(action.ref, action.text, { submit: action.submit });

    case "press":
      return client.press(action.key);

    case "hover":
      return client.hover(action.ref);

    case "scrollIntoView":
      return client.scrollIntoView(action.ref);

    case "selectOption":
      return client.selectOption(action.ref, action.values);

    case "wait":
      return client.wait({
        time: action.time,
        selector: action.selector,
        text: action.text,
        url: action.url,
      });

    case "snapshot":
      return client.snapshot();

    default:
      throw new Error(`Unknown action type: ${(action as { type: string }).type}`);
  }
}

/**
 * Parse task description for browser automation parameters.
 * Supports JSON format or natural language instructions.
 */
function parseTaskDescription(description: string): BrowserTaskParams {
  // Try to parse as JSON first
  try {
    const json = JSON.parse(description);
    if (typeof json === "object" && json !== null) {
      return json as BrowserTaskParams;
    }
  } catch {
    // Not JSON, continue to NLP parsing
  }

  // Extract URL from description
  const urlMatch = description.match(/https?:\/\/[^\s]+/);
  const url = urlMatch ? urlMatch[0] : undefined;

  // Simple heuristic: look for "navigate to", "click on", "type" patterns
  const actions: BrowserAction[] = [];

  // Navigate
  if (url) {
    actions.push({ type: "navigate", url });
  }

  // Click patterns
  const clickMatches = description.matchAll(
    /click\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+(?:button|link))?$/gim,
  );
  for (const match of clickMatches) {
    // This is simplified - real implementation would use snapshot refs
    console.log("Detected click intent:", match[1]);
  }

  // Screenshot
  const screenshot = /screenshot|capture.*screen/i.test(description);

  return {
    url,
    actions: actions.length > 0 ? actions : undefined,
    screenshot,
  };
}

/**
 * Factory for creating browser executors per agent
 */
export function createBrowserTaskExecutorFactory(params?: {
  config?: OpenClawConfig;
  headless?: boolean;
  viewport?: { width: number; height: number };
  persistentContext?: boolean;
}): (agentId: string) => TaskExecutor {
  return (agentId: string) =>
    createBrowserTaskExecutor({
      agentId,
      config: params?.config,
      headless: params?.headless,
      viewport: params?.viewport,
      persistentContext: params?.persistentContext,
    });
}
