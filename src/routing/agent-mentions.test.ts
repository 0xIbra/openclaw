/**
 * Agent Mention Routing Tests
 */

import { describe, it, expect, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import {
  resolveAgentMentionRouting,
  hasAgentMention,
  buildAgentMentionRegexes,
} from "./agent-mentions.js";

// Mock the team routing module
vi.mock("../tasks/team-routing.js", () => ({
  resolveTeamLeadRoutingFromDefaultService: vi.fn((text: string) => {
    // Mock that handles both "backend lead:" and "backend lead " patterns
    const match = text.match(/^backend\s+lead[:\s]+\s*(.+)$/i);
    if (match) {
      return {
        kind: "matched" as const,
        teamId: "team-backend",
        teamName: "Backend",
        leadAgentId: "backend-lead",
        rewrittenMessage: match[1],
        matchedBy: "exact" as const,
      };
    }
    return { kind: "none" as const };
  }),
}));

// Mock agent-scope
vi.mock("../agents/agent-scope.js", () => ({
  listAgentIds: vi.fn(() => ["main", "backend-lead", "frontend-lead", "my-agent"]),
  resolveDefaultAgentId: vi.fn(() => "main"),
}));

describe("hasAgentMention", () => {
  it("should detect @ares mention", () => {
    expect(hasAgentMention("@ares create a team")).toBe(true);
    expect(hasAgentMention("@Ares create a team")).toBe(true);
    expect(hasAgentMention("@ARES create a team")).toBe(true);
  });

  it("should detect @agent-id mention", () => {
    expect(hasAgentMention("@backend-lead create task")).toBe(true);
    expect(hasAgentMention("@my-agent hello")).toBe(true);
    expect(hasAgentMention("@frontend-lead help")).toBe(true);
  });

  it("should detect @team-lead mention", () => {
    expect(hasAgentMention("@backend-lead hello")).toBe(true);
    expect(hasAgentMention("@frontend-lead status")).toBe(true);
  });

  it("should return false for no mention", () => {
    expect(hasAgentMention("hello world")).toBe(false);
    expect(hasAgentMention("create a team")).toBe(false);
    expect(hasAgentMention("")).toBe(false);
  });

  it("should return true for mentions matching agent ID pattern", () => {
    // @john matches the agent pattern but won't route to a known agent
    expect(hasAgentMention("@john hello")).toBe(true);
    // @12345 matches the agent pattern (starts with digit after @)
    expect(hasAgentMention("@12345 hello")).toBe(true);
    // Just @ alone should not match
    expect(hasAgentMention("@ hello")).toBe(false);
  });
});

describe("resolveAgentMentionRouting", () => {
  const mockConfig: OpenClawConfig = {};

  it("should route @ares to Ares", () => {
    const result = resolveAgentMentionRouting({
      text: "@ares create a team called backend",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("ares");
    expect(result.agentId).toBe("ares");
    expect(result.rewrittenMessage).toBe("create a team called backend");
  });

  it("should route @ares case insensitively", () => {
    const result = resolveAgentMentionRouting({
      text: "@ARES help",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("ares");
  });

  it("should route @ares at any position", () => {
    const result = resolveAgentMentionRouting({
      text: "@ares",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("ares");
    expect(result.rewrittenMessage).toBe("");
  });

  it("should route to specific agent", () => {
    const result = resolveAgentMentionRouting({
      text: "@my-agent do something",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("agent");
    expect(result.agentId).toBe("my-agent");
    expect(result.rewrittenMessage).toBe("do something");
  });

  it("should route to backend-lead via team lead pattern", () => {
    const result = resolveAgentMentionRouting({
      text: "@backend-lead create auth task",
      cfg: mockConfig,
    });

    // @backend-lead matches the @team-lead pattern, so it routes via team routing
    expect(result.kind).toBe("team_lead");
    expect(result.leadAgentId).toBe("backend-lead");
    expect(result.rewrittenMessage).toBe("create auth task");
  });

  it("should return none for unknown agent", () => {
    const result = resolveAgentMentionRouting({
      text: "@unknown-agent hello",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("none");
  });

  it("should return none for non-mention text", () => {
    const result = resolveAgentMentionRouting({
      text: "hello world",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("none");
  });

  it("should handle empty text", () => {
    const result = resolveAgentMentionRouting({
      text: "",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("none");
  });

  it("should prioritize @ares over agent name", () => {
    // This shouldn't happen in practice, but @ares should be checked first
    const result = resolveAgentMentionRouting({
      text: "@ares tell @backend-lead to do something",
      cfg: mockConfig,
    });

    expect(result.kind).toBe("ares");
    expect(result.rewrittenMessage).toBe("tell @backend-lead to do something");
  });
});

describe("buildAgentMentionRegexes", () => {
  it("should build regexes for Ares", () => {
    const regexes = buildAgentMentionRegexes([]);
    expect(regexes.length).toBeGreaterThan(0);

    // Should match @ares
    expect(regexes.some((re) => re.test("@ares"))).toBe(true);
    expect(regexes.some((re) => re.test("@Ares"))).toBe(true);
  });

  it("should build regexes for agent IDs", () => {
    const regexes = buildAgentMentionRegexes(["my-agent", "backend-lead"]);

    expect(regexes.some((re) => re.test("@my-agent"))).toBe(true);
    expect(regexes.some((re) => re.test("@backend-lead"))).toBe(true);
    expect(regexes.some((re) => re.test("@other-agent"))).toBe(false);
  });

  it("should build regexes for team leads", () => {
    const regexes = buildAgentMentionRegexes([]);

    expect(regexes.some((re) => re.test("@backend-lead"))).toBe(true);
    expect(regexes.some((re) => re.test("@frontend-lead"))).toBe(true);
  });
});
