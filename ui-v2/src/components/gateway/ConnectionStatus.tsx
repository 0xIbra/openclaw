import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/stores";

const STATUS_CONFIG = {
  connected: { color: "bg-tron-green", label: "Connected", glow: "shadow-neon-green" },
  connecting: { color: "bg-tron-orange animate-pulse", label: "Connecting...", glow: "" },
  disconnected: { color: "bg-tron-muted", label: "Disconnected", glow: "" },
  error: { color: "bg-tron-red", label: "Error", glow: "shadow-neon-red" },
};

type ConnectionStatusProps = {
  showLabel?: boolean;
  className?: string;
};

export function ConnectionStatus({ showLabel = true, className }: ConnectionStatusProps) {
  const status = useGatewayStore((s) => s.status);
  const cfg = STATUS_CONFIG[status];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("w-2 h-2 rounded-full", cfg.color, cfg.glow)} />
      {showLabel && <span className="text-xs text-tron-muted-fg">{cfg.label}</span>}
    </div>
  );
}
