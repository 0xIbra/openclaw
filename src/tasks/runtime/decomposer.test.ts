import { describe, expect, it } from "vitest";
import { createTaskDecomposer } from "./decomposer.js";

const task = {
  id: "task-parent",
  projectId: "project-1",
  title: "Implement auth",
  description: "Create auth flow",
  type: "feature",
  priority: "high",
  complexity: null,
  status: "backlog",
  parentTaskId: null,
  dependsOnTaskIds: [],
  blockedByTaskIds: [],
  assignedAgentId: null,
  teamId: "team-1",
  currentAttemptId: null,
  maxAttempts: 3,
  attemptCount: 0,
  relevantPaths: ["src/auth"],
  tags: [],
  createdBy: "human",
  createdAtMs: 1,
  updatedAtMs: 1,
  startedAtMs: null,
  completedAtMs: null,
} as const;

describe("task decomposer", () => {
  it("parses strict JSON planner output", async () => {
    const decomposer = createTaskDecomposer({
      planner: async () =>
        JSON.stringify({
          summary: "auth breakdown",
          children: [
            {
              localId: "design",
              title: "Design auth",
              description: "Define schema and interfaces",
              type: "research",
              priority: "high",
              dependsOnLocalIds: [],
            },
            {
              localId: "impl",
              title: "Implement auth",
              description: "Code the auth services",
              type: "feature",
              priority: "high",
              dependsOnLocalIds: ["design"],
            },
          ],
        }),
    });

    const result = await decomposer.decompose({
      leadAgentId: "lead-1",
      teamId: "team-1",
      task,
    });

    expect(result.plan.children).toHaveLength(2);
    expect(result.plan.children[1]?.dependsOnLocalIds).toEqual(["design"]);
    expect(result.plannerBackend).toBe("embedded");
  });

  it("falls back when planner output is invalid", async () => {
    const decomposer = createTaskDecomposer({
      planner: async () => "not-json",
    });

    const result = await decomposer.decompose({
      leadAgentId: "lead-1",
      teamId: "team-1",
      task,
    });

    expect(result.plan.children.length).toBeGreaterThan(0);
    expect(result.plannerBackend).toBe("fallback");
  });
});
