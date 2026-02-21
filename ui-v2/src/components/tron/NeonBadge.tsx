import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type NeonBadgeProps = {
  children: ReactNode;
  variant?: "cyan" | "green" | "red" | "orange" | "purple" | "muted" | "yellow";
  className?: string;
  glow?: boolean;
  style?: CSSProperties;
};

const VARIANT_STYLES: Record<string, string> = {
  cyan: "bg-tron-cyan/10 text-tron-cyan border-tron-cyan/30",
  green: "bg-tron-green/10 text-tron-green border-tron-green/30",
  red: "bg-tron-red/20 text-tron-red border-tron-red/40",
  orange: "bg-tron-orange/20 text-tron-orange border-tron-orange/40",
  purple: "bg-purple-900/30 text-purple-300 border-purple-500/30",
  muted: "bg-tron-muted/20 text-tron-muted-fg border-tron-muted/40",
  yellow: "bg-yellow-900/30 text-yellow-300 border-yellow-500/30",
};

const GLOW_STYLES: Record<string, string> = {
  cyan: "shadow-neon-cyan",
  green: "shadow-neon-green",
  red: "shadow-neon-red",
  orange: "shadow-neon-orange",
};

export function NeonBadge({
  children,
  variant = "cyan",
  glow = false,
  className,
  style,
}: NeonBadgeProps) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-xs font-medium",
        "font-mono tracking-wide",
        VARIANT_STYLES[variant],
        glow && GLOW_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
