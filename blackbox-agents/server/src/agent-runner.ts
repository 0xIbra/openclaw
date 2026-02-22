import fs from "node:fs";
import type { AgentStatus, Message } from "./types.ts";
import * as db from "./db.ts";
import { PtyManager } from "./pty.ts";

export type EmitFn = (event: string, payload: unknown) => void;

export class AgentRunner {
  constructor(
    private pty: PtyManager,
    private emit: EmitFn,
  ) {}

  async start(agentId: string): Promise<void> {
    const agent = db.getAgent(agentId);
    fs.mkdirSync(agent.workspaceDir, { recursive: true });

    this.pty.spawn(agent);

    // Watch for unexpected exit → update status
    this.pty.onExit(agentId, (_code) => {
      try {
        db.updateAgent(agentId, { status: "offline" });
        this.emitStatus(agentId, "offline");
      } catch {}
    });

    const updated = db.updateAgent(agentId, { status: "idle" });
    this.emitStatus(agentId, "idle");
    return void updated;
  }

  async stop(agentId: string): Promise<void> {
    this.pty.kill(agentId);
    db.updateAgent(agentId, { status: "offline" });
    this.emitStatus(agentId, "offline");
  }

  async restart(agentId: string): Promise<void> {
    await this.stop(agentId);
    await this.start(agentId);
  }

  sendMessage(agentId: string, content: string): Message {
    // Write content then \r as two separate PTY writes with an event-loop yield
    // between them. This mimics actual typing (content chunk → Enter chunk) so
    // Claude Code's readline submits the line instead of treating it as a paste.
    this.pty.write(agentId, content);
    setTimeout(() => this.pty.write(agentId, "\r"), 0);

    // Persist
    const msg = db.createMessage({ agentId, direction: "user", content });
    this.emit("message.new", { message: msg });
    return msg;
  }

  interrupt(agentId: string): void {
    this.pty.interrupt(agentId);
  }

  getBuffer(agentId: string): string {
    return this.pty.getBuffer(agentId);
  }

  isRunning(agentId: string): boolean {
    return this.pty.isRunning(agentId);
  }

  subscribeToOutput(agentId: string, cb: (data: string) => void): () => void {
    return this.pty.subscribe(agentId, cb);
  }

  resize(agentId: string, cols: number, rows: number): void {
    this.pty.resize(agentId, cols, rows);
  }

  private emitStatus(agentId: string, status: AgentStatus): void {
    this.emit("agent.status", { agentId, status });
  }
}

// ─── Ensure agents marked as non-offline are reset on server start ────────────

export function resetAgentStatuses(): void {
  const agents = db.getAgents();
  for (const agent of agents) {
    if (agent.status !== "offline") {
      db.updateAgent(agent.id, { status: "offline" });
    }
  }
}
