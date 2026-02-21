import { useEffect, useRef } from "react";
import type { TaskStatus } from "@/types";
import { ConnectionGuard } from "@/components/gateway/ConnectionGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskDrawer } from "@/components/tasks/TaskDrawer";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { useTaskColumns } from "@/hooks/use-task-columns";
import { useTasksStore, useProjectsStore, useGatewayStore } from "@/stores";

const COLUMN_TOP_COLOR: Record<string, string> = {
  backlog: "#3a3a5c",
  assigned: "#7c3aed",
  running: "#00d4ff",
  review: "#ff9900",
  blocked: "#eab308",
  failed: "#ff3366",
  done: "#00ff88",
};

export function BoardPage() {
  const connected = useGatewayStore((s) => s.status === "connected");
  const loadTasks = useTasksStore((s) => s.load);
  const loadProjects = useProjectsStore((s) => s.load);
  const moveTask = useTasksStore((s) => s.moveTask);
  const columns = useTaskColumns();

  const dragTaskId = useRef<string | null>(null);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void loadTasks();
    void loadProjects();
  }, [connected, loadTasks, loadProjects]);

  const handleDragStart = (_e: React.DragEvent, taskId: string) => {
    dragTaskId.current = taskId;
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    if (dragTaskId.current) {
      void moveTask(dragTaskId.current, status);
      dragTaskId.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <ConnectionGuard>
      <PageHeader title="Board" subtitle="Task pipeline — drag to move" />
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
        {columns.map((col) => (
          <div
            key={col.status}
            className="flex flex-col w-64 min-w-[16rem] flex-shrink-0"
            onDrop={(e) => handleDrop(e, col.status as TaskStatus)}
            onDragOver={handleDragOver}
          >
            {/* Column header */}
            <div
              className="flex items-center justify-between px-3 py-2 mb-2 rounded-sm border border-tron-border"
              style={{
                borderTopColor: COLUMN_TOP_COLOR[col.status] ?? "#3a3a5c",
                borderTopWidth: 2,
              }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: COLUMN_TOP_COLOR[col.status] }}
              >
                {col.label}
              </span>
              <NeonBadge variant="muted">{col.tasks.length}</NeonBadge>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 min-h-[200px] rounded-sm p-1.5 border border-dashed border-tron-border/40">
              {col.tasks.map((task) => (
                <TaskCard key={task.id} task={task} onDragStart={handleDragStart} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <TaskDrawer />
    </ConnectionGuard>
  );
}
