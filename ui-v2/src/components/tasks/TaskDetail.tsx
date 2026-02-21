import { useEffect } from "react";
import type { TaskDto } from "@/types";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { STATUS_CONFIG } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { useTasksStore } from "@/stores";
import { TaskAttemptList } from "./TaskAttemptList";
import { TaskBadges } from "./TaskBadges";
import { TaskReviewPanel } from "./TaskReviewPanel";

type TaskDetailProps = {
  task: TaskDto;
};

export function TaskDetail({ task }: TaskDetailProps) {
  const loadTaskDetail = useTasksStore((s) => s.loadTaskDetail);
  const attempts = useTasksStore((s) => s.attempts[task.id] ?? []);
  const review = useTasksStore((s) => s.reviews[task.id]);

  useEffect(() => {
    void loadTaskDetail(task.id);
  }, [task.id, loadTaskDetail]);

  const statusCfg = STATUS_CONFIG[task.status];

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <NeonBadge variant="cyan">{statusCfg?.label ?? task.status}</NeonBadge>
          <TaskBadges priority={task.priority} type={task.type} tags={task.tags} />
        </div>
        <h2 className="font-display text-lg font-bold text-foreground">{task.title}</h2>
        <p className="text-sm text-tron-muted-fg whitespace-pre-wrap">{task.description}</p>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-tron-muted-fg">Project</span>
          <p className="font-mono text-foreground mt-0.5 truncate">{task.projectId}</p>
        </div>
        {task.assignedAgentId && (
          <div>
            <span className="text-tron-muted-fg">Agent</span>
            <p className="font-mono text-tron-cyan mt-0.5 truncate">{task.assignedAgentId}</p>
          </div>
        )}
        <div>
          <span className="text-tron-muted-fg">Created</span>
          <p className="text-foreground mt-0.5">{timeAgo(task.createdAtMs)}</p>
        </div>
        <div>
          <span className="text-tron-muted-fg">Attempts</span>
          <p className="text-foreground mt-0.5">
            {task.attemptCount} / {task.maxAttempts}
          </p>
        </div>
      </div>

      {/* Relevant paths */}
      {task.relevantPaths.length > 0 && (
        <div>
          <p className="text-xs text-tron-muted-fg uppercase tracking-widest mb-1.5">
            Relevant Paths
          </p>
          <div className="space-y-0.5">
            {task.relevantPaths.map((p) => (
              <p
                key={p}
                className="text-xs font-mono text-tron-cyan bg-tron-surface2 px-2 py-1 rounded-sm"
              >
                {p}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Review */}
      {review && <TaskReviewPanel review={review} />}

      {/* Attempts */}
      <div>
        <p className="text-xs text-tron-muted-fg uppercase tracking-widest mb-2">
          Attempts ({attempts.length})
        </p>
        <TaskAttemptList attempts={attempts} />
      </div>
    </div>
  );
}
