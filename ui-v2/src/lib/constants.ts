import type { TaskStatus, TaskPriority, TaskType } from "@/types";

export const BOARD_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "#3a3a5c" },
  { status: "assigned", label: "Assigned", color: "#7c3aed" },
  { status: "running", label: "Running", color: "#00d4ff" },
  { status: "review", label: "Review", color: "#ff9900" },
  { status: "blocked", label: "Blocked", color: "#eab308" },
  { status: "failed", label: "Failed", color: "#ff3366" },
  { status: "done", label: "Done", color: "#00ff88" },
];

export const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string; glowClass: string; bgClass: string }
> = {
  critical: {
    label: "Critical",
    color: "#ff3366",
    glowClass: "glow-red",
    bgClass: "bg-tron-red/20 text-tron-red border-tron-red/40",
  },
  high: {
    label: "High",
    color: "#ff9900",
    glowClass: "glow-orange",
    bgClass: "bg-tron-orange/20 text-tron-orange border-tron-orange/40",
  },
  medium: {
    label: "Medium",
    color: "#00d4ff",
    glowClass: "",
    bgClass: "bg-tron-cyan/10 text-tron-cyan border-tron-cyan/30",
  },
  low: {
    label: "Low",
    color: "#6b6b9a",
    glowClass: "",
    bgClass: "bg-tron-muted/20 text-tron-muted-fg border-tron-muted/40",
  },
};

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgClass: string }> =
  {
    created: {
      label: "Created",
      color: "#6b6b9a",
      bgClass: "bg-tron-muted/20 text-tron-muted-fg",
    },
    backlog: {
      label: "Backlog",
      color: "#6b6b9a",
      bgClass: "bg-tron-muted/20 text-tron-muted-fg",
    },
    assigned: {
      label: "Assigned",
      color: "#7c3aed",
      bgClass: "bg-purple-900/30 text-purple-300",
    },
    running: {
      label: "Running",
      color: "#00d4ff",
      bgClass: "bg-tron-cyan/10 text-tron-cyan",
    },
    review: {
      label: "Review",
      color: "#ff9900",
      bgClass: "bg-tron-orange/20 text-tron-orange",
    },
    blocked: {
      label: "Blocked",
      color: "#eab308",
      bgClass: "bg-yellow-900/30 text-yellow-300",
    },
    failed: {
      label: "Failed",
      color: "#ff3366",
      bgClass: "bg-tron-red/20 text-tron-red",
    },
    done: {
      label: "Done",
      color: "#00ff88",
      bgClass: "bg-tron-green/10 text-tron-green",
    },
  };

export const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: string }> = {
  feature: { label: "Feature", icon: "✦" },
  bugfix: { label: "Bug Fix", icon: "⚠" },
  refactor: { label: "Refactor", icon: "↻" },
  test: { label: "Test", icon: "✓" },
  review: { label: "Review", icon: "◉" },
  research: { label: "Research", icon: "◈" },
  devops: { label: "DevOps", icon: "⚙" },
};

export const WORKER_STATE_CONFIG: Record<
  string,
  { color: string; glowClass: string; label: string }
> = {
  idle: { color: "#3a3a5c", glowClass: "", label: "Idle" },
  claiming: { color: "#7c3aed", glowClass: "glow-purple", label: "Claiming" },
  running: { color: "#00d4ff", glowClass: "glow-cyan", label: "Running" },
  recovering: { color: "#ff9900", glowClass: "glow-orange", label: "Recovering" },
  paused: { color: "#eab308", glowClass: "", label: "Paused" },
  unhealthy: { color: "#ff3366", glowClass: "glow-red", label: "Unhealthy" },
  processing: { color: "#00d4ff", glowClass: "glow-cyan", label: "Processing" },
  delegating: { color: "#7c3aed", glowClass: "glow-purple", label: "Delegating" },
  waiting: { color: "#ff9900", glowClass: "glow-orange", label: "Waiting" },
};

export const BUS_MESSAGE_TYPE_CONFIG: Record<string, { color: string; bgClass: string }> = {
  "task:assign": {
    color: "#7c3aed",
    bgClass: "bg-purple-900/30 text-purple-300 border-purple-500/30",
  },
  "task:complete": {
    color: "#00ff88",
    bgClass: "bg-tron-green/10 text-tron-green border-tron-green/30",
  },
  "task:failed": { color: "#ff3366", bgClass: "bg-tron-red/20 text-tron-red border-tron-red/40" },
  question: {
    color: "#ff9900",
    bgClass: "bg-tron-orange/20 text-tron-orange border-tron-orange/40",
  },
  blocker: { color: "#ff3366", bgClass: "bg-tron-red/20 text-tron-red border-tron-red/40" },
  "context:provide": {
    color: "#00d4ff",
    bgClass: "bg-tron-cyan/10 text-tron-cyan border-tron-cyan/30",
  },
  directive: { color: "#7c3aed", bgClass: "bg-purple-900/30 text-purple-300 border-purple-500/30" },
  escalation: { color: "#ff3366", bgClass: "bg-tron-red/20 text-tron-red border-tron-red/40" },
  progress: {
    color: "#6b6b9a",
    bgClass: "bg-tron-muted/20 text-tron-muted-fg border-tron-muted/40",
  },
  info: { color: "#6b6b9a", bgClass: "bg-tron-muted/20 text-tron-muted-fg border-tron-muted/40" },
  askQuestion: {
    color: "#ff9900",
    bgClass: "bg-tron-orange/20 text-tron-orange border-tron-orange/40",
  },
  publishMessage: {
    color: "#00d4ff",
    bgClass: "bg-tron-cyan/10 text-tron-cyan border-tron-cyan/30",
  },
};

export function getBusMessageTypeStyle(type: string): { color: string; bgClass: string } {
  return (
    BUS_MESSAGE_TYPE_CONFIG[type] ?? {
      color: "#6b6b9a",
      bgClass: "bg-tron-muted/20 text-tron-muted-fg border-tron-muted/40",
    }
  );
}
