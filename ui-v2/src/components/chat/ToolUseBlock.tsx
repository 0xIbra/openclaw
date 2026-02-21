import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  input: Record<string, unknown>;
};

export function ToolUseBlock({ name, input }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1 rounded-sm border border-tron-purple/30 bg-tron-surface2 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-tron-surface transition-colors"
      >
        <Wrench size={12} className="text-tron-purple shrink-0" />
        <span className="font-mono text-xs text-tron-purple font-medium">{name}</span>
        <span className="ml-auto text-tron-muted-fg">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
      </button>
      {open && (
        <pre
          className={cn(
            "px-3 py-2 text-xs font-mono text-gray-300 bg-tron-bg overflow-x-auto",
            "border-t border-tron-purple/20",
          )}
        >
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}
