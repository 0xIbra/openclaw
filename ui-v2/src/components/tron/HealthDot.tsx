import { cn } from "@/lib/utils";

type Health = "healthy" | "warning" | "error" | "idle" | "paused";

const HEALTH_STYLES: Record<Health, { bg: string; glow: string }> = {
  healthy: { bg: "#00ff88", glow: "glow-green" },
  warning: { bg: "#ff9900", glow: "glow-orange" },
  error: { bg: "#ff3366", glow: "glow-red" },
  idle: { bg: "#3a3a5c", glow: "" },
  paused: { bg: "#eab308", glow: "" },
};

type HealthDotProps = {
  health: Health;
  size?: number;
  className?: string;
};

export function HealthDot({ health, size = 8, className }: HealthDotProps) {
  const { bg, glow } = HEALTH_STYLES[health] ?? HEALTH_STYLES.idle;
  return (
    <span
      className={cn("rounded-full inline-block flex-shrink-0", glow, className)}
      style={{ width: size, height: size, backgroundColor: bg }}
    />
  );
}
