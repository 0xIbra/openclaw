import { useEffect } from "react";
import type { TaskRuntimeWorkerDto } from "@/types";
import { ConnectionGuard } from "@/components/gateway/ConnectionGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/tron/DataTable";
import { HealthDot } from "@/components/tron/HealthDot";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { PulseRing } from "@/components/tron/PulseRing";
import { Button } from "@/components/ui/button";
import { useHeartbeatAge } from "@/hooks/use-heartbeat-age";
import { WORKER_STATE_CONFIG } from "@/lib/constants";
import { useRuntimeStore, useGatewayStore } from "@/stores";

function HeartbeatCell({ ts }: { ts: number | null }) {
  const { label, stale } = useHeartbeatAge(ts);
  return <span className={stale ? "text-tron-red" : "text-tron-muted-fg"}>{label}</span>;
}

export function AgentsPage() {
  const connected = useGatewayStore((s) => s.status === "connected");
  const workers = useRuntimeStore((s) => s.workers);
  const leads = useRuntimeStore((s) => s.leads);
  const load = useRuntimeStore((s) => s.load);
  const pauseWorker = useRuntimeStore((s) => s.pauseWorker);
  const resumeWorker = useRuntimeStore((s) => s.resumeWorker);
  const restartWorker = useRuntimeStore((s) => s.restartWorker);

  useEffect(() => {
    if (connected) {
      void load();
    }
  }, [connected, load]);

  const workerColumns = [
    {
      key: "state",
      header: "State",
      cell: (w: TaskRuntimeWorkerDto) => {
        const cfg = WORKER_STATE_CONFIG[w.state] ?? {
          label: w.state,
          color: "#6b6b9a",
          glowClass: "",
        };
        const isLive = w.state === "running" || w.state === "claiming";
        return (
          <div className="flex items-center gap-2">
            {isLive ? (
              <PulseRing color={cfg.color} size={7} />
            ) : (
              <HealthDot
                health={
                  w.state === "unhealthy" ? "error" : w.state === "paused" ? "paused" : "idle"
                }
                size={7}
              />
            )}
            <span style={{ color: cfg.color }} className="text-xs font-medium">
              {cfg.label}
            </span>
          </div>
        );
      },
    },
    {
      key: "agent",
      header: "Agent ID",
      cell: (w: TaskRuntimeWorkerDto) => <span className="text-id">{w.agentId}</span>,
    },
    {
      key: "task",
      header: "Current Task",
      cell: (w: TaskRuntimeWorkerDto) =>
        w.currentTaskId ? (
          <span className="text-id text-tron-cyan">{w.currentTaskId.slice(0, 12)}…</span>
        ) : (
          <span className="text-tron-muted-fg">—</span>
        ),
    },
    {
      key: "heartbeat",
      header: "Heartbeat",
      cell: (w: TaskRuntimeWorkerDto) => <HeartbeatCell ts={w.lastHeartbeatAtMs} />,
    },
    {
      key: "errors",
      header: "Errors",
      cell: (w: TaskRuntimeWorkerDto) =>
        w.errorStreak > 0 ? (
          <NeonBadge variant="red">{w.errorStreak}</NeonBadge>
        ) : (
          <span className="text-tron-muted-fg">0</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (w: TaskRuntimeWorkerDto) => (
        <div className="flex items-center gap-1">
          {w.state === "paused" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                void resumeWorker(w.agentId);
              }}
              className="h-6 px-2 text-xs text-tron-green hover:bg-tron-green/10"
            >
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                void pauseWorker(w.agentId);
              }}
              className="h-6 px-2 text-xs text-tron-orange hover:bg-tron-orange/10"
            >
              Pause
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              void restartWorker(w.agentId);
            }}
            className="h-6 px-2 text-xs text-tron-muted-fg hover:text-foreground"
          >
            Restart
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ConnectionGuard>
      <PageHeader title="Agents" subtitle="Worker health and controls" />

      <div className="space-y-6">
        {/* Workers */}
        <div className="rounded-sm border border-tron-border overflow-hidden">
          <div className="px-4 py-3 border-b border-tron-border bg-tron-surface">
            <h2 className="font-display font-semibold text-foreground">
              Workers{" "}
              <span className="text-tron-muted-fg text-sm font-normal ml-1">
                ({workers.length})
              </span>
            </h2>
          </div>
          <DataTable columns={workerColumns} data={workers} getKey={(w) => w.agentId} />
        </div>

        {/* Leads */}
        <div className="rounded-sm border border-tron-border overflow-hidden">
          <div className="px-4 py-3 border-b border-tron-border bg-tron-surface">
            <h2 className="font-display font-semibold text-foreground">
              Team Leads{" "}
              <span className="text-tron-muted-fg text-sm font-normal ml-1">({leads.length})</span>
            </h2>
          </div>
          <DataTable
            columns={[
              {
                key: "state",
                header: "State",
                cell: (l) => <span className="text-xs text-tron-cyan">{l.state}</span>,
              },
              {
                key: "team",
                header: "Team",
                cell: (l) => <span className="text-foreground">{l.teamName}</span>,
              },
              {
                key: "agent",
                header: "Lead Agent",
                cell: (l) => <span className="text-id">{l.leadAgentId}</span>,
              },
              {
                key: "questions",
                header: "Waiting Q",
                cell: (l) =>
                  l.waitingQuestionCount > 0 ? (
                    <NeonBadge variant="orange">{l.waitingQuestionCount}</NeonBadge>
                  ) : (
                    <span className="text-tron-muted-fg">0</span>
                  ),
              },
              {
                key: "heartbeat",
                header: "Last Poll",
                cell: (l) => <HeartbeatCell ts={l.lastPolledAtMs} />,
              },
            ]}
            data={leads}
            getKey={(l) => l.teamId}
          />
        </div>
      </div>
    </ConnectionGuard>
  );
}
