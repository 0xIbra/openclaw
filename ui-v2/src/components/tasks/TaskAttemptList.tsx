import type { TaskAttemptDto } from "@/types";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { timeAgo, formatDuration } from "@/lib/format";

type TaskAttemptListProps = {
  attempts: TaskAttemptDto[];
};

function attemptVariant(status: string): "green" | "red" | "orange" | "cyan" | "muted" {
  if (status === "completed" || status === "success") {
    return "green";
  }
  if (status === "failed" || status === "error") {
    return "red";
  }
  if (status === "running") {
    return "cyan";
  }
  if (status === "cancelled") {
    return "orange";
  }
  return "muted";
}

export function TaskAttemptList({ attempts }: TaskAttemptListProps) {
  if (attempts.length === 0) {
    return <p className="text-sm text-tron-muted-fg text-center py-6">No attempts yet</p>;
  }

  return (
    <div className="space-y-2">
      {[...attempts].toReversed().map((attempt) => (
        <div
          key={attempt.id}
          className="border border-tron-border rounded-sm p-3 bg-tron-surface2 space-y-1.5"
        >
          <div className="flex items-center justify-between">
            <NeonBadge variant={attemptVariant(attempt.status)}>
              #{attempt.attemptNumber ?? "?"} {attempt.status}
            </NeonBadge>
            <span className="text-id">{timeAgo(attempt.startedAtMs)}</span>
          </div>
          {attempt.agentId && (
            <p className="text-xs text-tron-muted-fg font-mono">Agent: {attempt.agentId}</p>
          )}
          {attempt.summary && (
            <p className="text-xs text-foreground line-clamp-3">{attempt.summary}</p>
          )}
          {attempt.errorText && (
            <p className="text-xs text-tron-red line-clamp-2">{attempt.errorText}</p>
          )}
          {attempt.endedAtMs && (
            <p className="text-xs text-tron-muted-fg">
              Duration: {formatDuration(attempt.endedAtMs - attempt.startedAtMs)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
