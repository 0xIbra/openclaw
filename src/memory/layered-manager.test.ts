import { describe, expect, it } from "vitest";
import {
  formatLayeredResultPath,
  parseLayeredResultPath,
  resolveLayeredScopes,
} from "./layered-manager.js";

describe("layered manager helpers", () => {
  it("formats and parses layered result paths", () => {
    const path = formatLayeredResultPath({
      scopeKind: "project",
      scopeId: "proj-1",
      relPath: "memory/entries/2026/02/a.md",
    });
    expect(path).toBe("layered/project/proj-1/memory/entries/2026/02/a.md");
    expect(parseLayeredResultPath(path)).toEqual({
      scopeKind: "project",
      scopeId: "proj-1",
      relPath: "memory/entries/2026/02/a.md",
    });
  });

  it("resolves weighted scopes for agent/project/team", () => {
    const scopes = resolveLayeredScopes({
      cfg: {
        memory: {
          layered: {
            weights: {
              agent: 0.55,
              project: 0.3,
              team: 0.15,
            },
          },
        },
      } as never,
      agentId: "ares",
      projectId: "project-x",
      teamId: "team-y",
    });
    expect(scopes).toHaveLength(3);
    expect(scopes[0]).toMatchObject({ kind: "agent", id: "ares" });
    expect(scopes[1]).toMatchObject({ kind: "project", id: "project-x" });
    expect(scopes[2]).toMatchObject({ kind: "team", id: "team-y" });
  });
});
