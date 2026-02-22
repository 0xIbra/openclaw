import type { AgentRunner } from "./agent-runner.ts";
import type { EmitFn } from "./agent-runner.ts";
import * as db from "./db.ts";

export class TaskDispatcher {
  constructor(
    private runner: AgentRunner,
    private emit: EmitFn,
  ) {}

  dispatch(taskId: string): void {
    const task = db.getTask(taskId);
    if (task.status !== "queued") {
      throw new Error(`Task ${taskId} is not queued (status: ${task.status})`);
    }

    const agent = db.getAgent(task.agentId);
    if (agent.status !== "idle") {
      throw new Error(`Agent ${agent.name} is not idle (status: ${agent.status})`);
    }

    if (!this.runner.isRunning(task.agentId)) {
      throw new Error(`Agent ${agent.name} is not running — start it first`);
    }

    const prompt =
      `## Task: ${task.title}\n\n${task.description}\n\n` +
      `When you have fully completed this task, say exactly: TASK COMPLETE`;

    this.runner.sendMessage(task.agentId, prompt);

    db.updateTask(taskId, { status: "running", startedAt: Date.now() });
    db.updateAgent(task.agentId, { status: "working" });

    this.emit("task.updated", { task: db.getTask(taskId) });
    this.emit("agent.status", { agentId: task.agentId, status: "working" });
  }

  complete(taskId: string): void {
    const task = db.getTask(taskId);
    db.updateTask(taskId, { status: "completed", completedAt: Date.now() });
    db.updateAgent(task.agentId, { status: "idle" });
    this.emit("task.updated", { task: db.getTask(taskId) });
    this.emit("agent.status", { agentId: task.agentId, status: "idle" });
  }

  fail(taskId: string): void {
    const task = db.getTask(taskId);
    db.updateTask(taskId, { status: "failed", completedAt: Date.now() });
    db.updateAgent(task.agentId, { status: "idle" });
    this.emit("task.updated", { task: db.getTask(taskId) });
    this.emit("agent.status", { agentId: task.agentId, status: "idle" });
  }

  cancel(taskId: string): void {
    const task = db.getTask(taskId);
    // If running, set agent back to idle
    if (task.status === "running") {
      db.updateAgent(task.agentId, { status: "idle" });
      this.emit("agent.status", { agentId: task.agentId, status: "idle" });
    }
    db.updateTask(taskId, { status: "cancelled", completedAt: Date.now() });
    this.emit("task.updated", { task: db.getTask(taskId) });
  }
}
