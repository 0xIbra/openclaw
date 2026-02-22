"use client";

import { Bot, CheckSquare, Activity } from "lucide-react";
import type { TaskStatus } from "@/lib/types";
import { AgentCard } from "@/components/agent-card";
import { Card, CardContent } from "@/components/ui/card";
import { useAgents, useTasks } from "@/lib/ws";

const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  queued: "bg-zinc-700 text-zinc-300",
  running: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
  cancelled: "bg-zinc-700/50 text-zinc-500",
};

export default function DashboardPage() {
  const { agents, loading: agentsLoading } = useAgents();
  const { tasks } = useTasks();

  const activeAgents = agents.filter((a) => a.status !== "offline");
  const recentTasks = [...tasks].toSorted((a, b) => b.createdAt - a.createdAt).slice(0, 8);

  const stats = {
    total: agents.length,
    active: activeAgents.length,
    working: agents.filter((a) => a.status === "working").length,
    queued: tasks.filter((t) => t.status === "queued").length,
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of all agent instances and task activity.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Agents", value: stats.total, icon: Bot },
            { label: "Online", value: stats.active, icon: Activity },
            { label: "Working", value: stats.working, icon: Activity },
            { label: "Tasks Queued", value: stats.queued, icon: CheckSquare },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Agent grid */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Agents
          </h2>
          {agentsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : agents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Bot className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No agents yet.{" "}
                  <a href="/agents" className="text-primary underline">
                    Create one
                  </a>{" "}
                  to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </div>

        {/* Recent tasks */}
        {recentTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              Recent Tasks
            </h2>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                        Title
                      </th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                        Agent
                      </th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTasks.map((task) => {
                      const agent = agents.find((a) => a.id === task.agentId);
                      return (
                        <tr
                          key={task.id}
                          className="border-b border-border last:border-0 hover:bg-accent/30"
                        >
                          <td className="p-3 font-medium">{task.title}</td>
                          <td className="p-3 text-muted-foreground">{agent?.name ?? "—"}</td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TASK_STATUS_BADGE[task.status]}`}
                            >
                              {task.status}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs font-mono">
                            {new Date(task.createdAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
