import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  className?: string;
};

export function StatCard({ label, value, sub, color = "#00d4ff", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-sm border border-tron-border bg-tron-surface p-4 flex flex-col gap-1",
        className,
      )}
    >
      <span className="text-xs font-medium text-tron-muted-fg uppercase tracking-widest">
        {label}
      </span>
      <span className="font-display text-3xl font-bold" style={{ color }}>
        {value}
      </span>
      {sub && <span className="text-xs text-tron-muted-fg">{sub}</span>}
    </div>
  );
}
