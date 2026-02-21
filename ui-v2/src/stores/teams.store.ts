import { create } from "zustand";
import type { TeamDto, TeamMemberDto } from "@/types";
import { registerGatewayEventHandler } from "./gateway.store";

type TeamsState = {
  teams: TeamDto[];
  members: Record<string, TeamMemberDto[]>; // teamId → members
  loading: boolean;
  // Actions
  load: () => Promise<void>;
  loadMembers: (teamId: string) => Promise<void>;
  createTeam: (params: { name: string; description?: string }) => Promise<TeamDto>;
  updateTeam: (
    teamId: string,
    patch: { name?: string; description?: string; settings?: Record<string, unknown> },
  ) => Promise<void>;
  archiveTeam: (teamId: string) => Promise<void>;
};

function upsertTeam(teams: TeamDto[], team: TeamDto): TeamDto[] {
  const idx = teams.findIndex((t) => t.id === team.id);
  if (idx === -1) {
    return [...teams, team];
  }
  const updated = [...teams];
  updated[idx] = team;
  return updated;
}

export const useTeamsStore = create<TeamsState>((set) => {
  registerGatewayEventHandler((evt) => {
    if (evt.event === "teams.changed") {
      // payload: { reason, team, members }
      const payload = evt.payload as
        | { reason?: string; team?: TeamDto; members?: TeamMemberDto[] }
        | undefined;
      if (payload?.team) {
        set((s) => {
          const nextMembers = payload.members
            ? { ...s.members, [payload.team!.id]: payload.members }
            : s.members;
          return { teams: upsertTeam(s.teams, payload.team!), members: nextMembers };
        });
      }
    }
    if (evt.event === "teams.member.changed") {
      const payload = evt.payload as { reason?: string; member?: TeamMemberDto } | undefined;
      if (payload?.member) {
        const m = payload.member;
        set((s) => {
          const existing = s.members[m.teamId] ?? [];
          const idx = existing.findIndex((x) => x.agentId === m.agentId);
          const updated =
            idx === -1 ? [...existing, m] : existing.map((x) => (x.agentId === m.agentId ? m : x));
          return { members: { ...s.members, [m.teamId]: updated } };
        });
      }
    }
  });

  return {
    teams: [],
    members: {},
    loading: false,

    load: async () => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      set({ loading: true });
      try {
        const result = await client.request<{ teams: TeamDto[] }>("teams.list", {});
        set({ teams: result.teams ?? [] });
      } catch (err) {
        console.error("[teams] load failed:", err);
      } finally {
        set({ loading: false });
      }
    },

    loadMembers: async (teamId) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      try {
        const result = await client.request<{ members: TeamMemberDto[] }>("teams.members.list", {
          teamId,
        });
        set((s) => ({ members: { ...s.members, [teamId]: result.members ?? [] } }));
      } catch (err) {
        console.error("[teams] loadMembers failed:", err);
      }
    },

    createTeam: async (params) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        throw new Error("Not connected");
      }
      const result = await client.request<{ team: TeamDto }>("teams.create", params);
      set((s) => ({ teams: upsertTeam(s.teams, result.team) }));
      return result.team;
    },

    updateTeam: async (teamId, patch) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      const result = await client.request<{ team: TeamDto }>("teams.update", { teamId, ...patch });
      set((s) => ({ teams: upsertTeam(s.teams, result.team) }));
    },

    archiveTeam: async (teamId) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      await client.request("teams.archive", { teamId });
      set((s) => ({ teams: s.teams.filter((t) => t.id !== teamId) }));
    },
  };
});
