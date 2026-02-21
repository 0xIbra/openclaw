import type { TaskPriority, TaskType } from "@/types";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { PRIORITY_CONFIG, TASK_TYPE_CONFIG } from "@/lib/constants";

type TaskBadgesProps = {
  priority: TaskPriority;
  type: TaskType;
  tags?: string[];
};

const PRIORITY_VARIANT: Record<TaskPriority, "red" | "orange" | "cyan" | "muted"> = {
  critical: "red",
  high: "orange",
  medium: "cyan",
  low: "muted",
};

export function TaskBadges({ priority, type, tags }: TaskBadgesProps) {
  const priorityCfg = PRIORITY_CONFIG[priority];
  const typeCfg = TASK_TYPE_CONFIG[type];

  return (
    <div className="flex flex-wrap items-center gap-1">
      <NeonBadge variant={PRIORITY_VARIANT[priority]} glow={priority === "critical"}>
        {priorityCfg.label}
      </NeonBadge>
      <NeonBadge variant="muted">
        {typeCfg.icon} {typeCfg.label}
      </NeonBadge>
      {tags?.slice(0, 2).map((tag) => (
        <NeonBadge key={tag} variant="muted">
          {tag}
        </NeonBadge>
      ))}
    </div>
  );
}
