/**
 * Agent Mention Routing
 *
 * Parses @Ares, @<agent-id>, and @<team>-lead mentions to route messages
 * to specific agents.
 */

import type { OpenClawConfig } from "../config/config.js";
import { listAgentIds } from "../agents/agent-scope.js";
import { resolveTeamLeadRoutingFromDefaultService } from "../tasks/team-routing.js";
import { normalizeAgentId } from "./session-key.js";

export type AgentMentionRouting =
  | { kind: "ares"; agentId: "ares"; rewrittenMessage: string }
  | { kind: "agent"; agentId: string; rewrittenMessage: string }
  | {
      kind: "team_lead";
      teamId: string;
      teamName: string;
      leadAgentId: string;
      rewrittenMessage: string;
    }
  | { kind: "none" };

// Pattern: @ares or @Ares (case insensitive)
const ARES_MENTION_RE = /@ares\b/i;

// Pattern: @<agent-id> where agent-id is alphanumeric with dashes/underscores
const AGENT_MENTION_RE = /@([a-z0-9][a-z0-9_-]{0,63})\b/i;

// Pattern: @<team>-lead to directly address a team lead
const TEAM_LEAD_MENTION_RE = /@([a-z0-9][a-z0-9_-]{0,62})-lead\b/i;

function stripMention(text: string, mentionMatch: string): string {
  const idx = text.toLowerCase().indexOf(mentionMatch.toLowerCase());
  if (idx === -1) {
    return text.trim();
  }
  const before = text.slice(0, idx).trim();
  const after = text.slice(idx + mentionMatch.length).trim();
  return `${before} ${after}`.trim();
}

function findAgentMention(
  text: string,
  agents: string[],
): { agentId: string; fullMatch: string } | null {
  const matches = text.matchAll(new RegExp(AGENT_MENTION_RE, "gi"));
  for (const match of matches) {
    const mention = match[1]?.toLowerCase() ?? "";
    const fullMatch = match[0] ?? "";
    // Check if it matches a known agent
    for (const agentId of agents) {
      if (normalizeAgentId(agentId) === mention) {
        return { agentId, fullMatch };
      }
    }
  }
  return null;
}

function isAresMention(text: string): boolean {
  return ARES_MENTION_RE.test(text);
}

function stripAresMention(text: string): string {
  return text.replace(ARES_MENTION_RE, "").trim();
}

function findTeamLeadMention(text: string): { teamName: string; fullMatch: string } | null {
  const match = text.match(TEAM_LEAD_MENTION_RE);
  if (!match) {
    return null;
  }
  return { teamName: match[1] ?? "", fullMatch: match[0] ?? "" };
}

function stripTeamLeadMention(text: string): string {
  return text.replace(TEAM_LEAD_MENTION_RE, "").trim();
}

/**
 * Resolve agent routing from message mentions
 * Priority: @ares > @<team>-lead > @<agent-id>
 */
export function resolveAgentMentionRouting(params: {
  text: string;
  cfg: OpenClawConfig;
}): AgentMentionRouting {
  const text = params.text.trim();
  if (!text) {
    return { kind: "none" };
  }

  // Check for @ares first (highest priority)
  if (isAresMention(text)) {
    return {
      kind: "ares",
      agentId: "ares",
      rewrittenMessage: stripAresMention(text),
    };
  }

  // Check for @<team>-lead pattern
  const teamLeadMention = findTeamLeadMention(text);
  if (teamLeadMention) {
    // Use existing team routing logic
    const routing = resolveTeamLeadRoutingFromDefaultService(
      `${teamLeadMention.teamName} lead: ${stripTeamLeadMention(text)}`,
    );
    if (routing.kind === "matched") {
      return {
        kind: "team_lead",
        teamId: routing.teamId,
        teamName: routing.teamName,
        leadAgentId: routing.leadAgentId,
        rewrittenMessage: routing.rewrittenMessage,
      };
    }
  }

  // Check for @<agent-id> pattern
  const agentIds = listAgentIds(params.cfg);
  const agentMention = findAgentMention(text, agentIds);
  if (agentMention) {
    return {
      kind: "agent",
      agentId: agentMention.agentId,
      rewrittenMessage: stripMention(text, agentMention.fullMatch),
    };
  }

  return { kind: "none" };
}

/**
 * Check if text contains any agent mention
 */
export function hasAgentMention(text: string): boolean {
  if (!text.trim()) {
    return false;
  }
  return (
    ARES_MENTION_RE.test(text) || AGENT_MENTION_RE.test(text) || TEAM_LEAD_MENTION_RE.test(text)
  );
}

/**
 * Build mention regexes for agent mention detection
 * Used for requireMention gating
 */
export function buildAgentMentionRegexes(agentIds: string[]): RegExp[] {
  const patterns: string[] = [
    "@ares\\b",
    "@[a-z0-9][a-z0-9_-]{0,62}-lead\\b",
    ...agentIds.map((id) => `@${id.replace(/[^a-z0-9_-]/gi, "")}\\b`),
  ];
  return patterns
    .map((p) => {
      try {
        return new RegExp(p, "i");
      } catch {
        return null;
      }
    })
    .filter((r): r is RegExp => r !== null);
}
