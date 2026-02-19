import { describe, expect, it } from "vitest";
import { appendTaskRuntimeMemoryContext, parseTaskRuntimeMemoryContext } from "./memory-context.js";

describe("task runtime memory context", () => {
  it("appends and parses task context in session keys", () => {
    const sessionKey = appendTaskRuntimeMemoryContext({
      sessionKey: "agent:alpha:task-runtime",
      projectId: "project-1",
      teamId: "team-2",
      taskId: "task-3",
    });
    expect(sessionKey).toContain(":taskctx:");
    expect(parseTaskRuntimeMemoryContext(sessionKey)).toEqual({
      projectId: "project-1",
      teamId: "team-2",
      taskId: "task-3",
    });
  });

  it("normalizes missing teamId to null", () => {
    const sessionKey = appendTaskRuntimeMemoryContext({
      sessionKey: "agent:alpha:task-runtime",
      projectId: "project-1",
      taskId: "task-3",
    });
    expect(parseTaskRuntimeMemoryContext(sessionKey)).toEqual({
      projectId: "project-1",
      teamId: null,
      taskId: "task-3",
    });
  });

  it("returns null for keys without task context marker", () => {
    expect(parseTaskRuntimeMemoryContext("agent:alpha:main")).toBeNull();
  });
});
