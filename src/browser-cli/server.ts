/**
 * Playwright CLI Server
 *
 * Uses playwright-cli shell commands for browser automation.
 * Each task gets isolated session with persistent profile.
 */

import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { createSubsystemLogger } from "../logging/subsystem.js";

const execAsync = promisify(exec);
const log = createSubsystemLogger("browser-cli");

export interface BrowserCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface BrowserSession {
  sessionId: string;
  profileDir: string;
  execute(command: string, args?: string[]): Promise<BrowserCommandResult>;
  stop(): Promise<void>;
}

function runPlaywrightCli(
  sessionId: string,
  command: string,
  args: string[] = [],
  timeoutMs = 60000,
): Promise<BrowserCommandResult> {
  return new Promise((resolve, reject) => {
    const cmd = `playwright-cli -s=${sessionId} ${command} ${args.join(" ")}`;
    log.debug(`Executing: ${cmd}`);

    const child = spawn("playwright-cli", [`-s=${sessionId}`, command, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
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

async function ensurePlaywrightCliAvailable(): Promise<void> {
  try {
    await execAsync("playwright-cli --version");
  } catch {
    throw new Error(
      "playwright-cli is not installed. Install with: npm install -g @playwright/cli",
    );
  }
}

export async function createBrowserSession(options: {
  sessionId: string;
  profileDir: string;
  headless?: boolean;
}): Promise<BrowserSession> {
  await ensurePlaywrightCliAvailable();

  const { sessionId, profileDir, headless = true } = options;

  // Ensure profile directory exists
  await execAsync(`mkdir -p "${profileDir}"`);

  // Open browser with persistent profile
  const openArgs = ["--persistent", `--profile=${profileDir}`, ...(headless ? [] : ["--headed"])];

  log.info(`Opening browser session: ${sessionId}`);
  const result = await runPlaywrightCli(sessionId, "open", openArgs, 30000);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to open browser: ${result.stderr || result.stdout}`);
  }

  log.info(`Browser session opened: ${sessionId}`);

  return {
    sessionId,
    profileDir,

    async execute(command: string, args: string[] = []): Promise<BrowserCommandResult> {
      return runPlaywrightCli(sessionId, command, args);
    },

    async stop(): Promise<void> {
      log.info(`Closing browser session: ${sessionId}`);
      try {
        await runPlaywrightCli(sessionId, "close", [], 10000);
      } catch {
        // Force kill if close fails
        try {
          await execAsync(`playwright-cli kill-all`);
        } catch {
          // Ignore
        }
      }
    },
  };
}

// High-level browser actions using playwright-cli
export async function navigate(session: BrowserSession, url: string): Promise<void> {
  const result = await session.execute("goto", [url]);
  if (result.exitCode !== 0) {
    throw new Error(`Navigation failed: ${result.stderr}`);
  }
}

export async function click(session: BrowserSession, ref: string): Promise<void> {
  const result = await session.execute("click", [ref]);
  if (result.exitCode !== 0) {
    throw new Error(`Click failed: ${result.stderr}`);
  }
}

export async function typeText(session: BrowserSession, text: string): Promise<void> {
  const result = await session.execute("type", [text]);
  if (result.exitCode !== 0) {
    throw new Error(`Type failed: ${result.stderr}`);
  }
}

export async function fill(session: BrowserSession, ref: string, text: string): Promise<void> {
  const result = await session.execute("fill", [ref, text]);
  if (result.exitCode !== 0) {
    throw new Error(`Fill failed: ${result.stderr}`);
  }
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: Array<{
    ref: string;
    role: string;
    name?: string;
    text?: string;
  }>;
  rawOutput: string;
}

export async function getSnapshot(session: BrowserSession): Promise<PageSnapshot> {
  const result = await session.execute("snapshot");
  if (result.exitCode !== 0) {
    throw new Error(`Snapshot failed: ${result.stderr}`);
  }

  // Parse snapshot output - playwright-cli outputs YAML-like format
  const lines = result.stdout.split("\n");
  let url = "";
  let title = "";
  const elements: PageSnapshot["elements"] = [];

  for (const line of lines) {
    const urlMatch = line.match(/Page URL:\s*(.+)/);
    if (urlMatch) {
      url = urlMatch[1].trim();
    }

    const titleMatch = line.match(/Page Title:\s*(.+)/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Parse element refs like "- link 'Example' [ref=e2]"
    const elementMatch = line.match(/-\s*(\w+)\s*(?:'([^']+)')?\s*\[ref=(\w+)\]/);
    if (elementMatch) {
      elements.push({
        role: elementMatch[1],
        name: elementMatch[2],
        ref: elementMatch[3],
      });
    }
  }

  return { url, title, elements, rawOutput: result.stdout };
}

export async function evaluate(session: BrowserSession, expression: string): Promise<unknown> {
  const result = await session.execute("eval", [expression]);
  if (result.exitCode !== 0) {
    throw new Error(`Evaluate failed: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout;
  }
}

export async function screenshot(session: BrowserSession, filepath?: string): Promise<string> {
  const args = filepath ? [`--filename=${filepath}`] : [];
  const result = await session.execute("screenshot", args);
  if (result.exitCode !== 0) {
    throw new Error(`Screenshot failed: ${result.stderr}`);
  }

  // Extract filename from output
  const match = result.stdout.match(/\[Snapshot\]\(([^)]+)\)/);
  return match?.[1] ?? filepath ?? "screenshot.png";
}

export async function pressKey(session: BrowserSession, key: string): Promise<void> {
  const result = await session.execute("press", [key]);
  if (result.exitCode !== 0) {
    throw new Error(`Key press failed: ${result.stderr}`);
  }
}

export async function waitFor(
  session: BrowserSession,
  options: { timeout?: number; selector?: string } = {},
): Promise<void> {
  // playwright-cli doesn't have a direct wait command
  // Use eval with setTimeout as a workaround
  const timeout = options.timeout ?? 1000;
  await session.execute("eval", [`new Promise(r => setTimeout(r, ${timeout}))`]);
}
