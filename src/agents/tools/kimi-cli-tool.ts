/**
 * Kimi CLI Tool - Core agent tool for software engineering tasks
 *
 * Exposes Kimi CLI as a first-class agent tool with full PTY support for
 * interactive mode. Kimi CLI is an interactive terminal application that
 * requires a pseudo-terminal (PTY) to work correctly.
 */

import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

const execFileAsync = promisify(execFile);

const KIMI_CLI_ACTIONS = [
  "run", // One-shot task with print mode (non-interactive)
  "start", // Start interactive PTY session
  "send", // Send input to interactive session
  "poll", // Get recent output from session
  "resize", // Resize PTY terminal
  "send_key", // Send special key (Ctrl+C, etc.)
  "close", // Close session
] as const;

const KIMI_KEY_NAMES = [
  "enter",
  "ctrl_c",
  "ctrl_d",
  "ctrl_z",
  "escape",
  "tab",
  "up",
  "down",
  "left",
  "right",
] as const;

// Kimi CLI tool schema
const KimiCliToolSchema = Type.Object({
  action: stringEnum(KIMI_CLI_ACTIONS),
  message: Type.Optional(Type.String()),
  workdir: Type.Optional(Type.String()),
  session_id: Type.Optional(Type.String()),
  // For run action
  yolo: Type.Optional(Type.Boolean()),
  thinking: Type.Optional(Type.Boolean()),
  quiet: Type.Optional(Type.Boolean()),
  // For resize action
  cols: Type.Optional(Type.Number()),
  rows: Type.Optional(Type.Number()),
  // For send_key action
  key: Type.Optional(stringEnum(KIMI_KEY_NAMES)),
  // For poll action
  lines: Type.Optional(Type.Number()),
});

type KimiCliSession = {
  id: string;
  workdir: string;
  pty: import("../../process/supervisor/adapters/pty.js").PtyAdapter;
  buffer: string[];
  isRunning: boolean;
  exitCode: number | null;
};

// In-memory session store
const sessions = new Map<string, KimiCliSession>();

function generateSessionId(agentId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${agentId}-${timestamp}-${random}`;
}

async function kimiExists(): Promise<boolean> {
  try {
    await execFileAsync("kimi", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function runPrintMode(
  message: string,
  workdir: string,
  flags: { yolo?: boolean; thinking?: boolean; quiet?: boolean },
): Promise<string> {
  const args = ["--print", "-p", message];

  if (flags.yolo) {
    args.push("--yolo");
  }
  if (flags.thinking) {
    args.push("--thinking");
  }
  if (flags.quiet) {
    args.push("--quiet");
  }

  const { stdout, stderr } = await execFileAsync("kimi", args, {
    cwd: workdir,
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stderr) {
    return `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
  }
  return stdout;
}

async function startInteractiveSession(
  sessionId: string,
  workdir: string,
  cols?: number,
  rows?: number,
): Promise<KimiCliSession> {
  const { createPtyAdapter } = await import("../../process/supervisor/adapters/pty.js");

  const pty = await createPtyAdapter({
    shell: "kimi",
    args: [],
    cwd: workdir,
    cols: cols ?? 120,
    rows: rows ?? 30,
  });

  const session: KimiCliSession = {
    id: sessionId,
    workdir,
    pty,
    buffer: [],
    isRunning: true,
    exitCode: null,
  };

  // Capture PTY output (unified stdout/stderr)
  pty.onStdout((chunk) => {
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line) {
        session.buffer.push(line);
      }
    }
    // Keep buffer size manageable
    if (session.buffer.length > 2000) {
      session.buffer = session.buffer.slice(-1000);
    }
  });

  // Wait for exit (fire-and-forget, handle errors silently)
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  pty.wait().then(
    (result) => {
      session.isRunning = false;
      session.exitCode = result.code;
      session.buffer.push(`[Session ended with code ${result.code}]`);
    },
    () => {
      // Ignore promise rejection on kill
    },
  );

  sessions.set(sessionId, session);
  return session;
}

function sendToSession(sessionId: string, message: string): string {
  const session = sessions.get(sessionId);
  if (!session) {
    return `Error: Session ${sessionId} not found`;
  }
  if (!session.isRunning) {
    return `Error: Session ${sessionId} is not running (exit code: ${session.exitCode})`;
  }

  session.pty.stdin?.write(message + "\r");

  return `Sent to session ${sessionId}`;
}

function sendKeyToSession(sessionId: string, key: (typeof KIMI_KEY_NAMES)[number]): string {
  const session = sessions.get(sessionId);
  if (!session) {
    return `Error: Session ${sessionId} not found`;
  }
  if (!session.isRunning) {
    return `Error: Session ${sessionId} is not running`;
  }

  const keyMap: Record<(typeof KIMI_KEY_NAMES)[number], string> = {
    enter: "\r",
    ctrl_c: "\x03",
    ctrl_d: "\x04",
    ctrl_z: "\x1a",
    escape: "\x1b",
    tab: "\t",
    up: "\x1b[A",
    down: "\x1b[B",
    left: "\x1b[D",
    right: "\x1b[C",
  };

  const sequence = keyMap[key];
  if (sequence) {
    session.pty.stdin?.write(sequence);
    return `Sent ${key} to session ${sessionId}`;
  }

  return `Error: Unknown key ${key}`;
}

function resizeSession(sessionId: string, cols: number, rows: number): string {
  const session = sessions.get(sessionId);
  if (!session) {
    return `Error: Session ${sessionId} not found`;
  }
  // PTY resize not implemented in current adapter, but we can track it
  return `Session ${sessionId} resize requested (${cols}x${rows}) - not yet implemented`;
}

function pollSession(sessionId: string, lines = 50): string {
  const session = sessions.get(sessionId);
  if (!session) {
    return `Error: Session ${sessionId} not found`;
  }

  const recentLines = session.buffer.slice(-lines);
  return recentLines.join("\n") || "(no output yet)";
}

function closeSession(sessionId: string): string {
  const session = sessions.get(sessionId);
  if (!session) {
    return `Error: Session ${sessionId} not found`;
  }

  session.pty.kill("SIGKILL");
  session.pty.dispose();
  sessions.delete(sessionId);

  return `Session ${sessionId} closed`;
}

// Cleanup all sessions
export async function cleanupKimiCliSessions(): Promise<void> {
  for (const [sessionId, session] of sessions.entries()) {
    try {
      session.pty.kill("SIGKILL");
      session.pty.dispose();
      console.log(`Cleaned up Kimi CLI session: ${sessionId}`);
    } catch {
      // Ignore cleanup errors
    }
  }
  sessions.clear();
}

export function createKimiCliTool(): AnyAgentTool {
  return {
    label: "Kimi CLI",
    name: "kimi_cli",
    description: `Kimi CLI - AI-powered software engineering assistant with full PTY/interactive support.

## Actions

**run** - One-shot task execution (non-interactive, print mode)
- Use for quick tasks that don't need interaction
- Auto-exits after completion
- Example: {"action":"run", "message":"Explain src/auth.ts", "workdir":"/project", "yolo":true}

**start** - Start interactive PTY session
- REQUIRED for interactive Kimi CLI usage
- Returns session_id for send/poll/close
- Full terminal emulation with colors, progress bars, etc.
- Example: {"action":"start", "workdir":"/project"}

**send** - Send text input to interactive session
- The message is sent as if user typed it + Enter
- Example: {"action":"send", "session_id":"xxx", "message":"refactor to use async/await"}

**send_key** - Send special keys (Ctrl+C, etc.)
- Keys: enter, ctrl_c, ctrl_d, ctrl_z, escape, tab, up, down, left, right
- Example: {"action":"send_key", "session_id":"xxx", "key":"ctrl_c"}

**poll** - Get recent output from session
- Non-blocking check for responses
- Use lines parameter to control how many lines (default 50)
- Example: {"action":"poll", "session_id":"xxx", "lines":100}

**resize** - Resize PTY terminal (if supported)
- Example: {"action":"resize", "session_id":"xxx", "cols":160, "rows":40}

**close** - Close interactive session
- Clean up PTY resources
- Example: {"action":"close", "session_id":"xxx"}

## Interactive Mode Workflow

1. **Start**: {"action":"start", "workdir":"/project"} → returns session_id
2. **Interact**: {"action":"send", "session_id":"xxx", "message":"your prompt"}
3. **Poll**: {"action":"poll", "session_id":"xxx"} → check for output
4. **Interrupt**: {"action":"send_key", "session_id":"xxx", "key":"ctrl_c"}
5. **Close**: {"action":"close", "session_id":"xxx"}

## Run Mode vs Interactive Mode

**Use run when:**
- One-shot tasks (explain, summarize, quick fix)
- No back-and-forth needed
- You want auto-exit

**Use interactive (start/send/poll) when:**
- Multi-turn conversation
- Kimi asks clarifying questions
- Long-running tasks with progress updates
- Need to interrupt (Ctrl+C) if stuck

## Kimi CLI Features Available

- File reading/writing/editing with @ path completion
- Shell command execution with approvals
- Codebase search (Grep, Glob)
- Web search and fetch
- Multi-line input (handled automatically)
- Image paste support
- Session persistence (/sessions, /resume)
- Skills loading (/skill:name, /flow:name)
- YOLO mode (--yolo: skip confirmations)
- Thinking mode (--thinking: deeper reasoning)`,
    parameters: KimiCliToolSchema,
    execute: async (_toolCallId, args) => {
      const hasKimi = await kimiExists();
      if (!hasKimi) {
        return jsonResult({
          error: "Kimi CLI not found",
          install: "curl -LsSf https://code.kimi.com/install.sh | bash",
        });
      }

      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true }) as
        | (typeof KIMI_CLI_ACTIONS)[number]
        | undefined;
      const workdir = readStringParam(params, "workdir") ?? process.cwd();
      const message = readStringParam(params, "message");
      const sessionId = readStringParam(params, "session_id");
      const keyName = readStringParam(params, "key") as (typeof KIMI_KEY_NAMES)[number] | undefined;
      const yolo = params.yolo === true;
      const thinking = params.thinking === true;
      const quiet = params.quiet === true;
      const cols = typeof params.cols === "number" ? params.cols : undefined;
      const rows = typeof params.rows === "number" ? params.rows : undefined;
      const lines = typeof params.lines === "number" && params.lines > 0 ? params.lines : 50;

      const agentId = "openclaw-agent";

      switch (action) {
        case "run": {
          if (!message) {
            return jsonResult({ error: "'message' required for run action" });
          }
          const output = await runPrintMode(message, workdir, {
            yolo,
            thinking,
            quiet,
          });
          return jsonResult({ output });
        }

        case "start": {
          const newSessionId = generateSessionId(agentId);
          const session = await startInteractiveSession(newSessionId, workdir, cols, rows);
          return jsonResult({
            session_id: session.id,
            workdir: session.workdir,
            is_running: session.isRunning,
            message: "Interactive PTY session started. Use send/poll/close.",
          });
        }

        case "send": {
          if (!sessionId || !message) {
            return jsonResult({
              error: "'session_id' and 'message' required for send action",
            });
          }
          const result = sendToSession(sessionId, message);
          const session = sessions.get(sessionId);
          return jsonResult({
            result,
            session_id: sessionId,
            is_running: session?.isRunning ?? false,
          });
        }

        case "send_key": {
          if (!sessionId || !keyName) {
            return jsonResult({
              error: "'session_id' and 'key' required for send_key action",
            });
          }
          const result = sendKeyToSession(sessionId, keyName);
          const session = sessions.get(sessionId);
          return jsonResult({
            result,
            session_id: sessionId,
            is_running: session?.isRunning ?? false,
          });
        }

        case "poll": {
          if (!sessionId) {
            return jsonResult({
              error: "'session_id' required for poll action",
            });
          }
          const output = pollSession(sessionId, lines);
          const session = sessions.get(sessionId);
          return jsonResult({
            output,
            session_id: sessionId,
            is_running: session?.isRunning ?? false,
            exit_code: session?.exitCode,
            buffer_lines: session?.buffer.length ?? 0,
          });
        }

        case "resize": {
          if (!sessionId || cols === undefined || rows === undefined) {
            return jsonResult({
              error: "'session_id', 'cols', and 'rows' required for resize action",
            });
          }
          const result = resizeSession(sessionId, cols, rows);
          return jsonResult({ result, session_id: sessionId });
        }

        case "close": {
          if (!sessionId) {
            return jsonResult({
              error: "'session_id' required for close action",
            });
          }
          const result = closeSession(sessionId);
          return jsonResult({ result });
        }

        default: {
          const unknownAction: string = action ?? "unknown";
          return jsonResult({ error: `Unknown action ${unknownAction}` });
        }
      }
    },
  };
}
