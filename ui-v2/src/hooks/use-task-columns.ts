import { useMemo } from "react";
import type { TaskDto } from "@/types";
import { BOARD_COLUMNS } from "@/lib/constants";
import { useTasksStore } from "@/stores";

export type KanbanColumn = {
  status: string;
  label: string;
  color: string;
  tasks: TaskDto[];
};

export function useTaskColumns(): KanbanColumn[] {
  const tasks = useTasksStore((s) => s.tasks);
  const filters = useTasksStore((s) => s.filters);

  return useMemo(() => {
    let filtered = tasks;

    if (filters.projectId) {
      filtered = filtered.filter((t) => t.projectId === filters.projectId);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      );
    }
    if (filters.priority) {
      filtered = filtered.filter((t) => t.priority === filters.priority);
    }
    if (filters.type) {
      filtered = filtered.filter((t) => t.type === filters.type);
    }

    return BOARD_COLUMNS.map((col) => ({
      ...col,
      tasks: filtered.filter((t) => t.status === col.status),
    }));
  }, [tasks, filters]);
}
