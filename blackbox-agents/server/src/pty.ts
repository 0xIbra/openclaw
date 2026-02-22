import type { IPty } from "@lydell/node-pty";
import { spawn } from "@lydell/node-pty";
import type { Agent, AgentAuth, AgentType } from "./types.ts";

type PtySession = {
  pty: IPty;
  buffer: string;
  subscribers: Set<(data: string) => void>;
  exitListeners: Set<(code: number) => void>;
};

export class PtyManager {
  private sessions = new Map<string, PtySession>();

  spawn(agent: Agent): void {
    if (this.sessions.has(agent.id)) {
      this.kill(agent.id);
    }

    const env = buildEnv(agent.auth);
    const [cmd, args] = buildCommand(agent.type);

    const pty = spawn(cmd, args, {
      name: "xterm-256color",
      cols: 220,
      rows: 50,
      cwd: agent.workspaceDir,
      env,
    });

    const session: PtySession = {
      pty,
      buffer: "",
      subscribers: new Set(),
      exitListeners: new Set(),
    };

    pty.onData((data) => {
      session.buffer = (session.buffer + data).slice(-50_000);
      for (const sub of session.subscribers) {
        try {
          sub(data);
        } catch {}
      }
    });

    pty.onExit(({ exitCode }) => {
      for (const listener of session.exitListeners) {
        try {
          listener(exitCode ?? 0);
        } catch {}
      }
      this.sessions.delete(agent.id);
    });

    this.sessions.set(agent.id, session);
  }

  write(agentId: string, text: string): void {
    this.sessions.get(agentId)?.pty.write(text);
  }

  /** Send Ctrl+C to interrupt the current process */
  interrupt(agentId: string): void {
    this.sessions.get(agentId)?.pty.write("\x03");
  }

  /** Resize the PTY terminal */
  resize(agentId: string, cols: number, rows: number): void {
    this.sessions.get(agentId)?.pty.resize(cols, rows);
  }

  kill(agentId: string): void {
    const session = this.sessions.get(agentId);
    if (session) {
      try {
        session.pty.kill();
      } catch {}
      this.sessions.delete(agentId);
    }
  }

  getBuffer(agentId: string): string {
    return this.sessions.get(agentId)?.buffer ?? "";
  }

  isRunning(agentId: string): boolean {
    return this.sessions.has(agentId);
  }

  subscribe(agentId: string, cb: (data: string) => void): () => void {
    const session = this.sessions.get(agentId);
    if (!session) {
      return () => {};
    }
    session.subscribers.add(cb);
    return () => session.subscribers.delete(cb);
  }

  onExit(agentId: string, cb: (code: number) => void): () => void {
    const session = this.sessions.get(agentId);
    if (!session) {
      return () => {};
    }
    session.exitListeners.add(cb);
    return () => session.exitListeners.delete(cb);
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCommand(type: AgentType): [string, string[]] {
  switch (type) {
    case "claude-code":
      return ["claude", ["--dangerously-skip-permissions"]];
    case "kimi-cli":
      return ["kimi", []];
    default:
      throw new Error(`Unknown agent type: ${String(type)}`);
  }
}

function buildEnv(auth: AgentAuth): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;

  if (auth.type === "claude-openrouter") {
    env["ANTHROPIC_API_KEY"] = auth.apiKey;
    env["ANTHROPIC_BASE_URL"] = auth.baseUrl ?? "https://openrouter.ai/api/v1";
    if (auth.model) {
      env["CLAUDE_MODEL"] = auth.model;
    }
  }

  if (auth.type === "kimi-api") {
    env["KIMI_API_KEY"] = auth.apiKey;
  }

  return env;
}
