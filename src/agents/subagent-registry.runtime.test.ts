import { afterEach, describe, expect, it } from "vitest";
import {
  addSubagentRunForTests,
  listSubagentRunsForRequester,
  markSubagentRunTerminated,
  resetSubagentRegistryForTests,
} from "./subagent-registry.js";

describe("subagent registry runtime source", () => {
  afterEach(() => {
    resetSubagentRegistryForTests({ persist: false });
  });

  it("retains runtime source metadata for task-runtime runs", () => {
    addSubagentRunForTests({
      runId: "task-runtime:team-1:task-1:agent-1",
      childSessionKey: "agent:member-agent:main",
      requesterSessionKey: "agent:lead-agent:main",
      requesterDisplayKey: "lead-agent",
      task: "Implement feature",
      cleanup: "keep",
      createdAt: Date.now(),
      startedAt: Date.now(),
      runtimeSource: "task_runtime",
    });

    const runs = listSubagentRunsForRequester("agent:lead-agent:main");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.runtimeSource).toBe("task_runtime");
  });

  it("can terminate task-runtime run entries by run id", () => {
    addSubagentRunForTests({
      runId: "task-runtime:team-1:task-1:agent-1",
      childSessionKey: "agent:member-agent:main",
      requesterSessionKey: "agent:lead-agent:main",
      requesterDisplayKey: "lead-agent",
      task: "Implement feature",
      cleanup: "keep",
      createdAt: Date.now(),
      startedAt: Date.now(),
      runtimeSource: "task_runtime",
    });

    const terminated = markSubagentRunTerminated({
      runId: "task-runtime:team-1:task-1:agent-1",
      reason: "task:complete",
    });
    expect(terminated).toBe(1);
  });
});
