/**
 * Agent Supervision CLI
 *
 * Commands for monitoring and controlling agent workers.
 * Part of Phase 3: Supervision & Resilience
 */

import type { Command } from "commander";
import { loadConfig } from "../config/config.js";
import { callGateway } from "../gateway/call.js";
import { info, success, danger as errorLog } from "../globals.js";
import { defaultRuntime } from "../runtime.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";
import { withProgress } from "./progress.js";

type TaskWorkerStatus = {
  agentId: string;
  teamIds: string[];
  state: string;
  currentTaskId: string | null;
  lastHeartbeatAtMs: number | null;
  errorStreak: number;
  lastError: string | null;
  updatedAtMs: number;
  memoryUsageMb?: number;
  maxMemoryMb?: number;
  lastHealthCheckAtMs?: number | null;
  consecutiveErrors?: number;
  lastSuccessfulTaskAtMs?: number | null;
};

type TaskRuntimeStatus = {
  workers: TaskWorkerStatus[];
  leads: Array<{
    teamId: string;
    teamName: string;
    leadAgentId: string;
    state: string;
    lastError: string | null;
    waitingQuestionCount: number;
    updatedAtMs: number;
  }>;
  updatedAtMs: number;
};

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${Math.floor(ms / 1000)}s`;
  }
  if (ms < 3600000) {
    return `${Math.floor(ms / 60000)}m`;
  }
  return `${Math.floor(ms / 3600000)}h`;
}

function formatWorkerStatus(worker: TaskWorkerStatus): string {
  const lines: string[] = [];
  const stateEmoji =
    {
      idle: "⚪",
      claiming: "🔵",
      running: "🟢",
      recovering: "🟡",
      paused: "⏸️",
      unhealthy: "🔴",
    }[worker.state] ?? "⚪";

  lines.push(`${stateEmoji} ${worker.agentId} (${worker.state})`);

  if (worker.currentTaskId) {
    lines.push(`  Current task: ${worker.currentTaskId}`);
  }

  if (worker.teamIds.length > 0) {
    lines.push(`  Teams: ${worker.teamIds.join(", ")}`);
  }

  if (worker.memoryUsageMb !== undefined && worker.maxMemoryMb !== undefined) {
    const memPercent = Math.round((worker.memoryUsageMb / worker.maxMemoryMb) * 100);
    let memEmoji: string;
    if (memPercent > 90) {
      memEmoji = "🔴";
    } else if (memPercent > 70) {
      memEmoji = "🟡";
    } else {
      memEmoji = "🟢";
    }
    lines.push(
      `  Memory: ${memEmoji} ${worker.memoryUsageMb}MB / ${worker.maxMemoryMb}MB (${memPercent}%)`,
    );
  }

  if (worker.consecutiveErrors && worker.consecutiveErrors > 0) {
    lines.push(`  Consecutive errors: ${worker.consecutiveErrors}`);
  }

  if (worker.lastHeartbeatAtMs) {
    const ago = Date.now() - worker.lastHeartbeatAtMs;
    lines.push(`  Last heartbeat: ${formatDuration(ago)} ago`);
  }

  if (worker.lastError) {
    const errorSuffix = worker.lastError.length > 100 ? "..." : "";
    lines.push(`  Last error: ${worker.lastError.slice(0, 100)}${errorSuffix}`);
  }

  return lines.join("\n");
}

/**
 * Register agent supervision CLI commands
 */
export function registerAgentSupervisionCli(program: Command) {
  // Add --agent option to existing health command via a new command
  program
    .command("agent:health")
    .description("Show runtime health for a specific agent (or all agents)")
    .option("--agent <id>", "Agent ID to check (default: all agents)")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const cfg = loadConfig();
        const agentId = opts.agent as string | undefined;

        const status = await withProgress(
          {
            label: agentId
              ? `Checking health for ${agentId}...`
              : "Checking agent runtime status...",
            indeterminate: true,
            enabled: !opts.json,
          },
          async () =>
            await callGateway<TaskRuntimeStatus>({
              method: "tasks.runtime.status",
              params: {},
              config: cfg,
            }),
        );

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(status, null, 2));
          return;
        }

        const workers = agentId
          ? status.workers.filter((w) => w.agentId === agentId)
          : status.workers;

        if (workers.length === 0) {
          defaultRuntime.log(
            info(agentId ? `No worker found for agent "${agentId}"` : "No active workers"),
          );
          return;
        }

        defaultRuntime.log(theme.heading(agentId ? `Agent: ${agentId}` : "Agent Workers"));
        for (const worker of workers) {
          defaultRuntime.log(formatWorkerStatus(worker));
          defaultRuntime.log("");
        }

        if (status.leads.length > 0 && !agentId) {
          defaultRuntime.log(theme.heading("Team Leads"));
          for (const lead of status.leads) {
            const stateEmoji =
              {
                idle: "⚪",
                processing: "🟢",
                delegating: "🔵",
                waiting: "🟡",
                paused: "⏸️",
              }[lead.state] ?? "⚪";
            defaultRuntime.log(
              `${stateEmoji} ${lead.leadAgentId} (${lead.teamName}) - ${lead.state}`,
            );
            if (lead.waitingQuestionCount > 0) {
              defaultRuntime.log(`  Waiting questions: ${lead.waitingQuestionCount}`);
            }
          }
        }
      });
    });

  // Agent restart command
  program
    .command("agent:restart <agent-id>")
    .description("Restart an agent worker (pause and resume)")
    .option("--json", "Output as JSON")
    .action(async (agentId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const cfg = loadConfig();
        const id = String(agentId).trim();

        if (!id) {
          defaultRuntime.log(errorLog("Agent ID is required"));
          defaultRuntime.exit(1);
          return;
        }

        const result = await withProgress(
          {
            label: `Restarting agent ${id}...`,
            indeterminate: true,
            enabled: !opts.json,
          },
          async () =>
            await callGateway<{ worker: TaskWorkerStatus | null }>({
              method: "tasks.runtime.restartAgent",
              params: { agentId: id },
              config: cfg,
            }),
        );

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.worker) {
          defaultRuntime.log(success(`Agent ${id} restarted successfully`));
          defaultRuntime.log(formatWorkerStatus(result.worker));
        } else {
          defaultRuntime.log(errorLog(`Failed to restart agent ${id} - worker not found`));
          defaultRuntime.exit(1);
        }
      });
    });

  // Agent pause command
  program
    .command("agent:pause <agent-id>")
    .description("Pause an agent worker")
    .option("--json", "Output as JSON")
    .action(async (agentId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const cfg = loadConfig();
        const id = String(agentId).trim();

        if (!id) {
          defaultRuntime.log(errorLog("Agent ID is required"));
          defaultRuntime.exit(1);
          return;
        }

        const result = await withProgress(
          {
            label: `Pausing agent ${id}...`,
            indeterminate: true,
            enabled: !opts.json,
          },
          async () =>
            await callGateway<{ worker: TaskWorkerStatus | null }>({
              method: "tasks.runtime.pauseAgent",
              params: { agentId: id },
              config: cfg,
            }),
        );

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.worker) {
          defaultRuntime.log(success(`Agent ${id} paused`));
          defaultRuntime.log(formatWorkerStatus(result.worker));
        } else {
          defaultRuntime.log(errorLog(`Failed to pause agent ${id} - worker not found`));
          defaultRuntime.exit(1);
        }
      });
    });

  // Agent resume command
  program
    .command("agent:resume <agent-id>")
    .description("Resume a paused agent worker")
    .option("--json", "Output as JSON")
    .action(async (agentId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const cfg = loadConfig();
        const id = String(agentId).trim();

        if (!id) {
          defaultRuntime.log(errorLog("Agent ID is required"));
          defaultRuntime.exit(1);
          return;
        }

        const result = await withProgress(
          {
            label: `Resuming agent ${id}...`,
            indeterminate: true,
            enabled: !opts.json,
          },
          async () =>
            await callGateway<{ worker: TaskWorkerStatus | null }>({
              method: "tasks.runtime.resumeAgent",
              params: { agentId: id },
              config: cfg,
            }),
        );

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.worker) {
          defaultRuntime.log(success(`Agent ${id} resumed`));
          defaultRuntime.log(formatWorkerStatus(result.worker));
        } else {
          defaultRuntime.log(errorLog(`Failed to resume agent ${id} - worker not found`));
          defaultRuntime.exit(1);
        }
      });
    });

  // Task recover command
  program
    .command("task:recover <task-id>")
    .description("Recover a failed or stuck task by requeuing it")
    .option("--assignee <agent-id>", "Assign to specific agent (optional)")
    .option("--json", "Output as JSON")
    .action(async (taskId, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const cfg = loadConfig();
        const id = String(taskId).trim();

        if (!id) {
          defaultRuntime.log(errorLog("Task ID is required"));
          defaultRuntime.exit(1);
          return;
        }

        const result = await withProgress(
          {
            label: `Recovering task ${id}...`,
            indeterminate: true,
            enabled: !opts.json,
          },
          async () =>
            await callGateway<{ task: { id: string; title: string; status: string } }>({
              method: "tasks.requeue",
              params: {
                taskId: id,
                assignedAgentId: opts.assignee as string | undefined,
              },
              config: cfg,
            }),
        );

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.task) {
          defaultRuntime.log(success(`Task "${result.task.title}" (${result.task.id}) requeued`));
          defaultRuntime.log(`Status: ${result.task.status}`);
          if (opts.assignee) {
            defaultRuntime.log(`Assigned to: ${opts.assignee}`);
          }
        } else {
          defaultRuntime.log(errorLog(`Failed to recover task ${id}`));
          defaultRuntime.exit(1);
        }
      });
    });
}
