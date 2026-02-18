import { describe, expect, it } from "vitest";
import { parseTeamLeadAddressing, resolveTeamLeadRoutingFromTeams } from "./team-routing.js";

describe("team lead routing", () => {
  it("parses direct team lead addressing and strips prefix", () => {
    const parsed = parseTeamLeadAddressing("Morpheus lead, take this project");
    expect(parsed).toEqual({
      teamQuery: "Morpheus",
      rewrittenMessage: "take this project",
    });
  });

  it("resolves exact and prefix team lead matches", () => {
    const teams = [
      { id: "t1", name: "Morpheus", leadAgentId: "lead-morpheus" },
      { id: "t2", name: "Sentinel", leadAgentId: "lead-sentinel" },
    ];
    const exact = resolveTeamLeadRoutingFromTeams({
      text: "Morpheus lead, ship it",
      teams,
    });
    expect(exact).toMatchObject({
      kind: "matched",
      teamId: "t1",
      leadAgentId: "lead-morpheus",
      matchedBy: "exact",
    });

    const prefix = resolveTeamLeadRoutingFromTeams({
      text: "Morph lead, ship it",
      teams,
    });
    expect(prefix).toMatchObject({
      kind: "matched",
      teamId: "t1",
      leadAgentId: "lead-morpheus",
      matchedBy: "prefix",
    });
  });

  it("returns ambiguous result when multiple team prefixes match", () => {
    const result = resolveTeamLeadRoutingFromTeams({
      text: "Mor lead, investigate",
      teams: [
        { id: "t1", name: "Morpheus", leadAgentId: "lead-morpheus" },
        { id: "t2", name: "Morningstar", leadAgentId: "lead-morningstar" },
      ],
    });
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toEqual(["Morningstar", "Morpheus"]);
      expect(result.prompt).toContain("Multiple teams match");
    }
  });
});
