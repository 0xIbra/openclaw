import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlowCardProps = {
  children: ReactNode;
  className?: string;
  glowColor?: "cyan" | "green" | "red" | "orange" | "purple" | "none";
  onClick?: () => void;
};

const GLOW_HOVER: Record<string, string> = {
  cyan: "hover:shadow-neon-cyan hover:border-tron-cyan/30",
  green: "hover:shadow-neon-green hover:border-tron-green/30",
  red: "hover:shadow-neon-red hover:border-tron-red/30",
  orange: "hover:shadow-neon-orange hover:border-tron-orange/30",
  purple: "hover:border-tron-purple/30",
  none: "",
};

export function GlowCard({ children, className, glowColor = "cyan", onClick }: GlowCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-sm border border-tron-border bg-tron-surface p-4",
        "transition-all duration-200",
        GLOW_HOVER[glowColor],
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </div>
  );
}
