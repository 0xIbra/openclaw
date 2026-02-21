import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUiStore, useTasksStore } from "@/stores";
import { TaskDetail } from "./TaskDetail";

export function TaskDrawer() {
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const selectedTaskId = useUiStore((s) => s.selectedTaskId);
  const closeTaskDrawer = useUiStore((s) => s.closeTaskDrawer);
  const tasks = useTasksStore((s) => s.tasks);

  const task = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : null;

  return (
    <Sheet open={drawerOpen} onOpenChange={() => closeTaskDrawer()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl bg-tron-surface border-l border-tron-border p-0"
      >
        <SheetHeader className="px-6 py-4 border-b border-tron-border">
          <SheetTitle className="font-display text-tron-cyan text-left">Task Detail</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-full">
          <div className="px-6 py-4 pb-16">
            {task ? (
              <TaskDetail task={task} />
            ) : (
              <p className="text-sm text-tron-muted-fg">Task not found</p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
