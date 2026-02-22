import type { AgentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<AgentStatus, { dot: string; label: string }> = {
  idle: { dot: "bg-green-400", label: "Idle" },
  working: { dot: "bg-blue-400 animate-pulse", label: "Working" },
  paused: { dot: "bg-amber-400", label: "Paused" },
  offline: { dot: "bg-zinc-600", label: "Offline" },
};

export function StatusDot({
  status,
  showLabel = false,
  className,
}: {
  status: AgentStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className={cn("h-2 w-2 rounded-full shrink-0", config.dot)} />
      {showLabel && <span className="text-xs text-muted-foreground">{config.label}</span>}
    </span>
  );
}

export function statusLabel(status: AgentStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

export function statusColor(status: AgentStatus): string {
  const colors: Record<AgentStatus, string> = {
    idle: "text-green-400",
    working: "text-blue-400",
    paused: "text-amber-400",
    offline: "text-zinc-500",
  };
  return colors[status] ?? "text-muted-foreground";
}
