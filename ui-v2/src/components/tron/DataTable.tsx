import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  getKey: (row: T) => string;
  className?: string;
  onRowClick?: (row: T) => void;
};

export function DataTable<T>({ columns, data, getKey, className, onRowClick }: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-tron-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-3 py-2 text-left text-xs text-tron-muted-fg uppercase tracking-widest font-medium",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={getKey(row)}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-b border-tron-border/50 transition-colors duration-150",
                "hover:bg-tron-surface2 scanline-overlay",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-3 py-2.5", col.className)}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-tron-muted-fg">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
