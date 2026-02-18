import { describe, expect, it } from "vitest";
import { canTransitionTaskStatus, validateTaskTransition } from "./lifecycle.js";

describe("task lifecycle", () => {
  it("allows documented transitions", () => {
    expect(canTransitionTaskStatus("created", "backlog")).toBe(true);
    expect(canTransitionTaskStatus("backlog", "assigned")).toBe(true);
    expect(canTransitionTaskStatus("assigned", "running")).toBe(true);
    expect(canTransitionTaskStatus("running", "review")).toBe(true);
    expect(canTransitionTaskStatus("review", "done")).toBe(true);
    expect(canTransitionTaskStatus("blocked", "backlog")).toBe(true);
    expect(canTransitionTaskStatus("failed", "backlog")).toBe(true);
    expect(canTransitionTaskStatus("done", "done")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransitionTaskStatus("created", "running")).toBe(false);
    expect(canTransitionTaskStatus("backlog", "done")).toBe(false);
    expect(canTransitionTaskStatus("done", "backlog")).toBe(false);
  });

  it("requires assignee for assigned/running", () => {
    const assigned = validateTaskTransition({
      fromStatus: "backlog",
      toStatus: "assigned",
      assignedAgentId: null,
      hasIncompleteDependencies: false,
    });
    expect(assigned.ok).toBe(false);

    const running = validateTaskTransition({
      fromStatus: "assigned",
      toStatus: "running",
      assignedAgentId: "",
      hasIncompleteDependencies: false,
    });
    expect(running.ok).toBe(false);
  });

  it("blocks transitions when dependencies are incomplete", () => {
    const result = validateTaskTransition({
      fromStatus: "running",
      toStatus: "review",
      assignedAgentId: "zed",
      hasIncompleteDependencies: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        reason: "dependencies_blocked",
      }),
    );
  });
});
