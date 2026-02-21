export type TeamDto = {
  id: string;
  name: string;
  description?: string;
  leadAgentId: string | null;
  settings: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

export type TeamMemberDto = {
  teamId: string;
  agentId: string;
  role: "lead" | "member";
  createdAtMs: number;
  updatedAtMs: number;
};

export type TeamsListResult = { teams: TeamDto[] };
export type TeamWithMembersResult = { team: TeamDto; members: TeamMemberDto[] };
