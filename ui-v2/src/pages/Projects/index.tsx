import { useEffect } from "react";
import type { ProjectDto } from "@/types";
import { ConnectionGuard } from "@/components/gateway/ConnectionGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlowCard } from "@/components/tron/GlowCard";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { timeAgo } from "@/lib/format";
import { useProjectsStore, useTasksStore, useGatewayStore } from "@/stores";

const STATUS_COLORS = {
  running: "#00d4ff",
  review: "#ff9900",
  done: "#00ff88",
  failed: "#ff3366",
  backlog: "#3a3a5c",
  assigned: "#7c3aed",
  blocked: "#eab308",
  created: "#6b6b9a",
};

function ProjectTaskBar({ projectId }: { projectId: string }) {
  const tasks = useTasksStore((s) => s.tasks.filter((t) => t.projectId === projectId));
  if (tasks.length === 0) {
    return null;
  }

  const counts = tasks.reduce(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
      {Object.entries(counts).map(([status, count]) => (
        <div
          key={status}
          style={{
            width: `${(count / tasks.length) * 100}%`,
            backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? "#3a3a5c",
          }}
        />
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectDto }) {
  const taskCount = useTasksStore((s) => s.tasks.filter((t) => t.projectId === project.id).length);
  const runningCount = useTasksStore(
    (s) => s.tasks.filter((t) => t.projectId === project.id && t.status === "running").length,
  );

  return (
    <GlowCard>
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-display font-semibold text-foreground">{project.name}</h3>
        {runningCount > 0 && (
          <NeonBadge variant="cyan" glow>
            {runningCount} running
          </NeonBadge>
        )}
      </div>

      {project.description && (
        <p className="text-xs text-tron-muted-fg line-clamp-2 mb-3">{project.description}</p>
      )}

      {project.repoRoot && <p className="text-id mb-3 truncate">{project.repoRoot}</p>}

      <ProjectTaskBar projectId={project.id} />

      <div className="flex items-center justify-between mt-3 text-xs">
        <span className="text-tron-muted-fg">{taskCount} tasks</span>
        <span className="text-tron-muted-fg">{timeAgo(project.updatedAtMs)}</span>
      </div>
    </GlowCard>
  );
}

export function ProjectsPage() {
  const connected = useGatewayStore((s) => s.status === "connected");
  const projects = useProjectsStore((s) => s.projects);
  const load = useProjectsStore((s) => s.load);
  const loadTasks = useTasksStore((s) => s.load);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void load();
    void loadTasks();
  }, [connected, load, loadTasks]);

  return (
    <ConnectionGuard>
      <PageHeader title="Projects" subtitle="Active codebases and their tasks" />

      {projects.length === 0 ? (
        <div className="text-center py-20 text-tron-muted-fg">
          <p className="text-lg font-display">No projects found</p>
          <p className="text-sm mt-1">Projects are created when agents index repositories</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </ConnectionGuard>
  );
}
