import { useEffect } from "react";
import type { TeamDto } from "@/types";
import { ConnectionGuard } from "@/components/gateway/ConnectionGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlowCard } from "@/components/tron/GlowCard";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { useTeamsStore, useRuntimeStore, useGatewayStore } from "@/stores";

function TeamCard({ team }: { team: TeamDto }) {
  const members = useTeamsStore((s) => s.members[team.id] ?? []);
  const loadMembers = useTeamsStore((s) => s.loadMembers);
  const leads = useRuntimeStore((s) => s.leads);
  const leadRuntime = leads.find((l) => l.teamId === team.id);

  useEffect(() => {
    void loadMembers(team.id);
  }, [team.id, loadMembers]);

  return (
    <GlowCard glowColor="purple">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-foreground">{team.name}</h3>
          {team.description && (
            <p className="text-xs text-tron-muted-fg mt-0.5 line-clamp-2">{team.description}</p>
          )}
        </div>
        {leadRuntime && <NeonBadge variant="purple">{leadRuntime.state}</NeonBadge>}
      </div>

      <div className="space-y-1.5 text-xs">
        {team.leadAgentId && (
          <div className="flex items-center gap-2">
            <span className="text-tron-muted-fg">Lead:</span>
            <span className="font-mono text-tron-cyan truncate">{team.leadAgentId}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-tron-muted-fg">Members:</span>
          <span className="text-foreground">{members.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-tron-muted-fg">Updated:</span>
          <span className="text-foreground">{timeAgo(team.updatedAtMs)}</span>
        </div>
      </div>

      {members.length > 0 && (
        <div className="mt-3 pt-3 border-t border-tron-border">
          <div className="flex flex-wrap gap-1">
            {members.slice(0, 5).map((m) => (
              <span key={m.agentId} className="text-id truncate max-w-[80px]">
                {m.agentId.split("-")[0]}
              </span>
            ))}
            {members.length > 5 && (
              <span className="text-tron-muted-fg text-xs">+{members.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </GlowCard>
  );
}

export function TeamsPage() {
  const connected = useGatewayStore((s) => s.status === "connected");
  const teams = useTeamsStore((s) => s.teams);
  const load = useTeamsStore((s) => s.load);
  const loadRuntime = useRuntimeStore((s) => s.load);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void load();
    void loadRuntime();
  }, [connected, load, loadRuntime]);

  return (
    <ConnectionGuard>
      <PageHeader
        title="Teams"
        subtitle="Agent teams and their status"
        actions={
          <Button size="sm" className="bg-tron-purple text-white hover:bg-tron-purple/90">
            New Team
          </Button>
        }
      />

      {teams.length === 0 ? (
        <div className="text-center py-20 text-tron-muted-fg">
          <p className="text-lg font-display">No teams configured</p>
          <p className="text-sm mt-1">Create a team to organize agents</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </ConnectionGuard>
  );
}
