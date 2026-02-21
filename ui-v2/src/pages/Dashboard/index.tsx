import { useEffect } from "react";
import type { TaskRuntimeWorkerDto } from "@/types";
import { ConnectionGuard } from "@/components/gateway/ConnectionGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlowCard } from "@/components/tron/GlowCard";
import { HealthDot } from "@/components/tron/HealthDot";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { PulseRing } from "@/components/tron/PulseRing";
import { StatCard } from "@/components/tron/StatCard";
import { useHeartbeatAge } from "@/hooks/use-heartbeat-age";
import { WORKER_STATE_CONFIG } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { useTasksStore, useRuntimeStore, useTeamsStore, useGatewayStore } from "@/stores";

function WorkerRow({ worker }: { worker: TaskRuntimeWorkerDto }) {
  const { label, stale } = useHeartbeatAge(worker.lastHeartbeatAtMs);
  const cfg = WORKER_STATE_CONFIG[worker.state] ?? {
    label: worker.state,
    color: "#6b6b9a",
    glowClass: "",
  };
  const isLive = worker.state === "running" || worker.state === "claiming";

  return (
    <div className="flex items-center gap-3 py-2 border-b border-tron-border/50 last:border-0">
      <div className="flex items-center gap-2 w-24 flex-shrink-0">
        {isLive ? (
          <PulseRing color={cfg.color} size={8} />
        ) : (
          <HealthDot
            health={
              worker.state === "paused"
                ? "paused"
                : worker.state === "unhealthy"
                  ? "error"
                  : worker.state === "idle"
                    ? "idle"
                    : "healthy"
            }
            size={8}
          />
        )}
        <span className="text-xs font-medium" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      </div>
      <span className="text-id flex-1 truncate">{worker.agentId}</span>
      {worker.currentTaskId && (
        <span className="text-id text-tron-cyan truncate max-w-[120px]">
          {worker.currentTaskId.slice(0, 8)}
        </span>
      )}
      <span className={`text-xs ${stale ? "text-tron-red" : "text-tron-muted-fg"}`}>{label}</span>
    </div>
  );
}

export function DashboardPage() {
  const tasks = useTasksStore((s) => s.tasks);
  const workers = useRuntimeStore((s) => s.workers);
  const leads = useRuntimeStore((s) => s.leads);
  const escalations = useRuntimeStore((s) => s.escalations);
  const teams = useTeamsStore((s) => s.teams);
  const connected = useGatewayStore((s) => s.status === "connected");

  const loadTasks = useTasksStore((s) => s.load);
  const loadRuntime = useRuntimeStore((s) => s.load);
  const loadTeams = useTeamsStore((s) => s.load);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void loadTasks();
    void loadRuntime();
    void loadTeams();
  }, [connected, loadTasks, loadRuntime, loadTeams]);

  const running = tasks.filter((t) => t.status === "running").length;
  const review = tasks.filter((t) => t.status === "review").length;
  const backlog = tasks.filter((t) => t.status === "backlog").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const activeWorkers = workers.filter(
    (w) => w.state === "running" || w.state === "claiming",
  ).length;

  return (
    <ConnectionGuard>
      <PageHeader title="The Grid" subtitle="System overview and live agent status" />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Running" value={running} color="#00d4ff" />
        <StatCard label="In Review" value={review} color="#ff9900" />
        <StatCard label="Backlog" value={backlog} color="#6b6b9a" />
        <StatCard label="Done" value={done} color="#00ff88" />
        <StatCard label="Active Agents" value={activeWorkers} color="#7c3aed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Workers */}
        <div className="lg:col-span-2">
          <GlowCard>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-semibold text-foreground">Workers</h2>
              <span className="text-id">{workers.length} total</span>
            </div>
            <div className="space-y-0">
              {workers.length === 0 && (
                <p className="text-sm text-tron-muted-fg py-4 text-center">No workers registered</p>
              )}
              {workers.map((w) => (
                <WorkerRow key={w.agentId} worker={w} />
              ))}
            </div>
          </GlowCard>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Leads */}
          <GlowCard>
            <h2 className="font-display font-semibold text-foreground mb-3">Team Leads</h2>
            {leads.length === 0 && (
              <p className="text-sm text-tron-muted-fg text-center py-4">No leads active</p>
            )}
            {leads.map((lead) => (
              <div
                key={lead.teamId}
                className="flex items-center gap-2 py-2 border-b border-tron-border/50 last:border-0"
              >
                <HealthDot
                  health={
                    lead.state === "idle" ? "idle" : lead.state === "paused" ? "paused" : "healthy"
                  }
                  size={7}
                />
                <span className="text-sm text-foreground flex-1 truncate">{lead.teamName}</span>
                <span className="text-xs text-tron-muted-fg">{lead.state}</span>
              </div>
            ))}
          </GlowCard>

          {/* Escalations */}
          {escalations.length > 0 && (
            <GlowCard glowColor="orange">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-display font-semibold text-tron-orange">Escalations</h2>
                <NeonBadge variant="orange">{escalations.length}</NeonBadge>
              </div>
              {escalations.map((esc) => (
                <div
                  key={esc.threadId}
                  className="py-2 border-b border-tron-border/50 last:border-0"
                >
                  <p className="text-xs text-tron-muted-fg">{esc.leadAgentId}</p>
                  <p className="text-xs text-foreground mt-0.5">{timeAgo(esc.escalatedAtMs)}</p>
                </div>
              ))}
            </GlowCard>
          )}

          {/* Teams summary */}
          <GlowCard>
            <h2 className="font-display font-semibold text-foreground mb-3">Teams</h2>
            <p className="text-2xl font-bold font-display text-tron-purple">{teams.length}</p>
            <p className="text-xs text-tron-muted-fg">active teams</p>
          </GlowCard>
        </div>
      </div>
    </ConnectionGuard>
  );
}
