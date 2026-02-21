import type { TaskDto } from "@/types";
import { PulseRing } from "@/components/tron/PulseRing";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores";
import { TaskBadges } from "./TaskBadges";

type TaskCardProps = {
  task: TaskDto;
  onDragStart?: (e: React.DragEvent, taskId: string) => void;
};

export function TaskCard({ task, onDragStart }: TaskCardProps) {
  const openTaskDrawer = useUiStore((s) => s.openTaskDrawer);
  const isRunning = task.status === "running";

  return (
    <article
      draggable
      onDragStart={(e) => onDragStart?.(e, task.id)}
      onClick={() => openTaskDrawer(task.id)}
      className={cn(
        "bg-tron-surface2 border border-tron-border rounded-sm p-3 cursor-pointer",
        "hover:border-tron-cyan/40 hover:shadow-neon-cyan transition-all duration-150",
        isRunning && "border-tron-cyan/30 shadow-neon-cyan",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <TaskBadges priority={task.priority} type={task.type} tags={task.tags} />
        {isRunning && <PulseRing color="#00d4ff" size={8} />}
      </div>
      <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">{task.title}</p>
      <div className="flex items-center justify-between text-xs">
        {task.assignedAgentId ? (
          <span className="font-mono text-tron-cyan truncate max-w-[100px]">
            @{task.assignedAgentId.split("-")[0]}
          </span>
        ) : (
          <span className="text-tron-muted-fg">Unassigned</span>
        )}
        <span className="text-tron-muted-fg font-mono">
          {task.attemptCount}/{task.maxAttempts}
        </span>
      </div>
    </article>
  );
}
