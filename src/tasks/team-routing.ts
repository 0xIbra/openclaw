import type { TaskService } from "./service.js";
import { createTaskService } from "./service.js";

type TeamRoutingRecord = {
  id: string;
  name: string;
  leadAgentId: string | null;
};

export type TeamLeadAddressing = {
  teamQuery: string;
  rewrittenMessage: string;
};

export type TeamLeadRoutingResult =
  | { kind: "none" }
  | {
      kind: "matched";
      teamId: string;
      teamName: string;
      leadAgentId: string;
      rewrittenMessage: string;
      matchedBy: "exact" | "prefix";
    }
  | {
      kind: "ambiguous";
      teamQuery: string;
      rewrittenMessage: string;
      candidates: string[];
      prompt: string;
    }
  | {
      kind: "missing_lead";
      teamId: string;
      teamName: string;
      rewrittenMessage: string;
      prompt: string;
    };

const TEAM_LEAD_ADDRESS_RE = /^\s*([a-z0-9][a-z0-9 _-]{0,79}?)\s+lead\b[:,-]?\s*([\s\S]*)$/i;

export function parseTeamLeadAddressing(text: string): TeamLeadAddressing | null {
  const raw = text.trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(TEAM_LEAD_ADDRESS_RE);
  if (!match) {
    return null;
  }
  const teamQuery = (match[1] ?? "").trim();
  if (!teamQuery) {
    return null;
  }
  const rewrittenRaw = (match[2] ?? "").trim();
  return {
    teamQuery,
    rewrittenMessage: rewrittenRaw || raw,
  };
}

export function formatTeamLeadDisambiguationPrompt(
  teamQuery: string,
  candidates: string[],
): string {
  const list = candidates.map((candidate) => `"${candidate}"`).join(", ");
  return `Multiple teams match "${teamQuery}". Please choose one: ${list}.`;
}

function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

function resolveWithTeams(
  text: string,
  teams: TeamRoutingRecord[],
  exactLookup: (name: string) => TeamRoutingRecord | null,
): TeamLeadRoutingResult {
  const addressing = parseTeamLeadAddressing(text);
  if (!addressing) {
    return { kind: "none" };
  }
  const exact = exactLookup(addressing.teamQuery);
  if (exact) {
    if (!exact.leadAgentId) {
      return {
        kind: "missing_lead",
        teamId: exact.id,
        teamName: exact.name,
        rewrittenMessage: addressing.rewrittenMessage,
        prompt: `Team "${exact.name}" has no configured lead agent yet.`,
      };
    }
    return {
      kind: "matched",
      teamId: exact.id,
      teamName: exact.name,
      leadAgentId: exact.leadAgentId,
      rewrittenMessage: addressing.rewrittenMessage,
      matchedBy: "exact",
    };
  }

  const query = normalizeTeamName(addressing.teamQuery);
  const prefixMatches = teams.filter((team) => normalizeTeamName(team.name).startsWith(query));
  if (prefixMatches.length === 0) {
    return { kind: "none" };
  }
  if (prefixMatches.length > 1) {
    const candidates = prefixMatches.map((team) => team.name).toSorted();
    return {
      kind: "ambiguous",
      teamQuery: addressing.teamQuery,
      rewrittenMessage: addressing.rewrittenMessage,
      candidates,
      prompt: formatTeamLeadDisambiguationPrompt(addressing.teamQuery, candidates),
    };
  }
  const match = prefixMatches[0];
  if (!match?.leadAgentId) {
    return {
      kind: "missing_lead",
      teamId: match?.id ?? "",
      teamName: match?.name ?? addressing.teamQuery,
      rewrittenMessage: addressing.rewrittenMessage,
      prompt: `Team "${match?.name ?? addressing.teamQuery}" has no configured lead agent yet.`,
    };
  }
  return {
    kind: "matched",
    teamId: match.id,
    teamName: match.name,
    leadAgentId: match.leadAgentId,
    rewrittenMessage: addressing.rewrittenMessage,
    matchedBy: "prefix",
  };
}

export function resolveTeamLeadRouting(params: {
  text: string;
  taskService: Pick<TaskService, "listTeams" | "getTeamByName">;
}): TeamLeadRoutingResult {
  const teams = params.taskService
    .listTeams({ includeArchived: false })
    .map((team) => ({ id: team.id, name: team.name, leadAgentId: team.leadAgentId }));
  return resolveWithTeams(params.text, teams, (name) => params.taskService.getTeamByName(name));
}

let sharedTeamRoutingService: Pick<TaskService, "listTeams" | "getTeamByName"> | null = null;
let sharedTeamRoutingInitFailed = false;

function resolveDefaultTeamRoutingService(): Pick<
  TaskService,
  "listTeams" | "getTeamByName"
> | null {
  if (sharedTeamRoutingService) {
    return sharedTeamRoutingService;
  }
  if (sharedTeamRoutingInitFailed) {
    return null;
  }
  try {
    sharedTeamRoutingService = createTaskService();
    return sharedTeamRoutingService;
  } catch {
    sharedTeamRoutingInitFailed = true;
    return null;
  }
}

export function resolveTeamLeadRoutingFromDefaultService(text: string): TeamLeadRoutingResult {
  const service = resolveDefaultTeamRoutingService();
  if (!service) {
    return { kind: "none" };
  }
  try {
    return resolveTeamLeadRouting({ text, taskService: service });
  } catch {
    return { kind: "none" };
  }
}

export function resolveTeamLeadRoutingFromTeams(params: {
  text: string;
  teams: TeamRoutingRecord[];
}): TeamLeadRoutingResult {
  const teamsByName = new Map(params.teams.map((team) => [normalizeTeamName(team.name), team]));
  return resolveWithTeams(
    params.text,
    params.teams,
    (name) => teamsByName.get(normalizeTeamName(name)) ?? null,
  );
}
