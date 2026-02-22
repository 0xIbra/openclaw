"use client";

import { CheckSquare, Play, X, CheckCircle, XCircle, Clock, CircleDot } from "lucide-react";
import { useState } from "react";
import type { TaskStatus } from "@/lib/types";
import { TaskForm } from "@/components/task-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAgents, useTasks, useWs } from "@/lib/ws";

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  queued: <Clock className="h-3.5 w-3.5 text-zinc-500" />,
  running: <CircleDot className="h-3.5 w-3.5 text-blue-400" />,
  completed: <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-400" />,
  cancelled: <XCircle className="h-3.5 w-3.5 text-zinc-600" />,
};

const STATUS_FILTERS = ["all", "queued", "running", "completed", "failed", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function TasksPage() {
  const { agents } = useAgents();
  const { tasks, refetch } = useTasks();
  const { request } = useWs();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const sorted = [...filtered].toSorted((a, b) => b.createdAt - a.createdAt);

  const dispatch = (taskId: string) => {
    void request("tasks.dispatch", { id: taskId })
      .then(() => refetch())
      .catch((e: unknown) => alert(e instanceof Error ? e.message : String(e)));
  };

  const complete = (taskId: string) => {
    void request("tasks.complete", { id: taskId }).then(() => refetch());
  };

  const cancel = (taskId: string) => {
    void request("tasks.cancel", { id: taskId }).then(() => refetch());
  };

  const remove = (taskId: string) => {
    void request("tasks.delete", { id: taskId }).then(() => refetch());
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">All tasks across all agents.</p>
          </div>
          <TaskForm agents={agents} onCreated={refetch} />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "secondary" : "ghost"}
              className="h-7 text-xs capitalize"
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        {/* Task list */}
        {sorted.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CheckSquare className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {filter === "all" ? "No tasks yet." : `No ${filter} tasks.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {sorted.map((task) => {
                  const agent = agents.find((a) => a.id === task.agentId);
                  return (
                    <div key={task.id} className="p-4 hover:bg-accent/20 flex gap-3">
                      <span className="mt-0.5 shrink-0">{STATUS_ICONS[task.status]}</span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{task.title}</p>
                          {agent && (
                            <span className="text-xs text-muted-foreground bg-zinc-800 px-1.5 py-0.5 rounded">
                              {agent.name}
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-zinc-600 font-mono">
                          <span>Created {new Date(task.createdAt).toLocaleString()}</span>
                          {task.startedAt && (
                            <span>Started {new Date(task.startedAt).toLocaleTimeString()}</span>
                          )}
                          {task.completedAt && (
                            <span>Done {new Date(task.completedAt).toLocaleTimeString()}</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1.5 mt-2">
                          {task.status === "queued" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs gap-1"
                                onClick={() => dispatch(task.id)}
                              >
                                <Play className="h-3 w-3" /> Dispatch
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs gap-1"
                                onClick={() => cancel(task.id)}
                              >
                                <X className="h-3 w-3" /> Cancel
                              </Button>
                            </>
                          )}
                          {task.status === "running" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs gap-1 text-green-400 border-green-500/30"
                                onClick={() => complete(task.id)}
                              >
                                <CheckCircle className="h-3 w-3" /> Mark Done
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs gap-1"
                                onClick={() => cancel(task.id)}
                              >
                                <X className="h-3 w-3" /> Cancel
                              </Button>
                            </>
                          )}
                          {(task.status === "completed" ||
                            task.status === "failed" ||
                            task.status === "cancelled") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs gap-1 text-zinc-600 hover:text-destructive"
                              onClick={() => remove(task.id)}
                            >
                              <X className="h-3 w-3" /> Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
