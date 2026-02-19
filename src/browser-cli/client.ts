/**
 * Playwright CLI Client
 *
 * High-level client for browser automation via playwright-cli.
 */

import { spawn } from "node:child_process";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createSubsystemLogger } from "../logging/subsystem.js";

const execAsync = promisify(exec);
const log = createSubsystemLogger("browser-cli");

export interface CliOptions {
  session?: string;
  timeout?: number;
}

export function runPlaywrightCli(
  command: string,
  args: string[] = [],
  options: CliOptions = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { session, timeout = 60000 } = options;

  return new Promise((resolve, reject) => {
    const cliArgs = session ? [`-s=${session}`, command, ...args] : [command, ...args];
    log.debug(`playwright-cli ${cliArgs.join(" ")}`);

    const child = spawn("playwright-cli", cliArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

export async function isPlaywrightCliAvailable(): Promise<boolean> {
  try {
    const result = await runPlaywrightCli("--version", [], { timeout: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export interface BrowserClientOptions {
  agentId: string;
  headless?: boolean;
  viewport?: { width: number; height: number };
  profileDir?: string;
}

export interface NavigateResult {
  url: string;
  title: string;
}

export interface SnapshotResult {
  url: string;
  title: string;
  elements: Array<{
    ref: string;
    role: string;
    name?: string;
  }>;
}

/**
 * High-level browser client using playwright-cli sessions.
 */
export class BrowserClient {
  private sessionId: string;
  private options: BrowserClientOptions;
  private started = false;

  constructor(options: BrowserClientOptions) {
    this.sessionId = `openclaw-${options.agentId}`;
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const available = await isPlaywrightCliAvailable();
    if (!available) {
      throw new Error(
        "playwright-cli is not installed. Install with: npm install -g @playwright/cli",
      );
    }

    // Open browser session
    const args: string[] = [];
    if (this.options.profileDir) {
      args.push("--persistent", `--profile=${this.options.profileDir}`);
    }

    const result = await runPlaywrightCli("open", args, {
      session: this.sessionId,
      timeout: 30000,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start browser: ${result.stderr || result.stdout}`);
    }

    this.started = true;
    log.info(`Browser session started: ${this.sessionId}`);
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      await runPlaywrightCli("close", [], { session: this.sessionId, timeout: 10000 });
    } catch {
      // Force kill if needed
      try {
        await execAsync("playwright-cli kill-all");
      } catch {
        // Ignore
      }
    }
    this.started = false;
  }

  async navigate(url: string): Promise<NavigateResult> {
    this.ensureStarted();
    const result = await runPlaywrightCli("goto", [url], { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Navigation failed: ${result.stderr}`);
    }
    return this.getUrl();
  }

  async getUrl(): Promise<NavigateResult> {
    this.ensureStarted();
    // Use eval to get current URL and title
    const urlResult = await runPlaywrightCli("eval", ["window.location.href"], {
      session: this.sessionId,
    });
    const titleResult = await runPlaywrightCli("eval", ["document.title"], {
      session: this.sessionId,
    });

    return {
      url: urlResult.stdout.trim().replace(/^"|"$/g, ""),
      title: titleResult.stdout.trim().replace(/^"|"$/g, ""),
    };
  }

  async click(
    ref: string,
    options?: { button?: "left" | "right" | "middle"; doubleClick?: boolean },
  ): Promise<void> {
    this.ensureStarted();
    const cmd = options?.doubleClick ? "dblclick" : "click";
    const args = options?.button ? [ref, options.button] : [ref];
    const result = await runPlaywrightCli(cmd, args, { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Click failed: ${result.stderr}`);
    }
  }

  async type(ref: string, text: string, options?: { submit?: boolean }): Promise<void> {
    this.ensureStarted();
    const result = await runPlaywrightCli("fill", [ref, text], { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Type failed: ${result.stderr}`);
    }
    if (options?.submit) {
      await this.press("Enter");
    }
  }

  async press(key: string): Promise<void> {
    this.ensureStarted();
    const result = await runPlaywrightCli("press", [key], { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Key press failed: ${result.stderr}`);
    }
  }

  async hover(ref: string): Promise<void> {
    this.ensureStarted();
    const result = await runPlaywrightCli("hover", [ref], { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Hover failed: ${result.stderr}`);
    }
  }

  async scrollIntoView(ref: string): Promise<void> {
    this.ensureStarted();
    // Use eval to scroll element into view
    const result = await runPlaywrightCli(
      "eval",
      [`document.querySelector('[ref="${ref}"]')?.scrollIntoView()`],
      { session: this.sessionId },
    );
    if (result.exitCode !== 0) {
      throw new Error(`Scroll failed: ${result.stderr}`);
    }
  }

  async selectOption(ref: string, values: string[]): Promise<void> {
    this.ensureStarted();
    const result = await runPlaywrightCli("select", [ref, values.join(",")], {
      session: this.sessionId,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Select failed: ${result.stderr}`);
    }
  }

  async snapshot(): Promise<SnapshotResult> {
    this.ensureStarted();
    const result = await runPlaywrightCli("snapshot", [], { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Snapshot failed: ${result.stderr}`);
    }

    // Parse snapshot output
    const lines = result.stdout.split("\n");
    let url = "";
    let title = "";
    const elements: SnapshotResult["elements"] = [];

    for (const line of lines) {
      const urlMatch = line.match(/Page URL:\s*(.+)/);
      if (urlMatch) {
        url = urlMatch[1].trim();
      }

      const titleMatch = line.match(/Page Title:\s*(.+)/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      // Parse element refs
      const elementMatch = line.match(/-\s*(\w+)\s*(?:'([^']+)')?\s*\[ref=(\w+)\]/);
      if (elementMatch) {
        elements.push({
          role: elementMatch[1],
          name: elementMatch[2],
          ref: elementMatch[3],
        });
      }
    }

    return { url, title, elements };
  }

  async screenshot(options?: { fullPage?: boolean; path?: string }): Promise<string> {
    this.ensureStarted();
    const args: string[] = [];
    if (options?.path) {
      args.push(`--filename=${options.path}`);
    }
    const result = await runPlaywrightCli("screenshot", args, { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Screenshot failed: ${result.stderr}`);
    }

    // Extract filename from output
    const match = result.stdout.match(/\[Snapshot\]\(([^)]+)\)/);
    return match?.[1] ?? options?.path ?? "screenshot.png";
  }

  async evaluate(script: string): Promise<unknown> {
    this.ensureStarted();
    const result = await runPlaywrightCli("eval", [script], { session: this.sessionId });
    if (result.exitCode !== 0) {
      throw new Error(`Evaluate failed: ${result.stderr}`);
    }
    try {
      return JSON.parse(result.stdout);
    } catch {
      return result.stdout.trim();
    }
  }

  async wait(options?: {
    time?: number;
    selector?: string;
    text?: string;
    url?: string;
    timeout?: number;
  }): Promise<void> {
    this.ensureStarted();
    if (options?.time) {
      await new Promise((r) => setTimeout(r, options.time));
      return;
    }
    // For other waits, use eval with polling
    const timeout = options?.timeout ?? 5000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (options?.selector) {
        const result = await runPlaywrightCli(
          "eval",
          [`!!document.querySelector('${options.selector}')`],
          { session: this.sessionId },
        );
        if (result.stdout.includes("true")) {
          return;
        }
      }
      if (options?.text) {
        const result = await runPlaywrightCli(
          "eval",
          [`document.body.innerText.includes('${options.text}')`],
          { session: this.sessionId },
        );
        if (result.stdout.includes("true")) {
          return;
        }
      }
      if (options?.url) {
        const current = await this.getUrl();
        if (current.url.includes(options.url)) {
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Wait timeout after ${timeout}ms`);
  }

  private ensureStarted(): void {
    if (!this.started) {
      throw new Error("Browser not started. Call start() first.");
    }
  }
}
