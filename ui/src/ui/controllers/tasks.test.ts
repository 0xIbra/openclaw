import { describe, expect, it, vi } from "vitest";
import { transitionTaskOptimistic, type TasksState } from "./tasks.ts";

function createState(overrides: Partial<TasksState> = {}): TasksState {
  return {
    client: null,
    connected: true,
    boardLoading: false,
    boardBusy: false,
    boardError: null,
    boardTasks: [],
    boardSelectedProjectId: "project-1",
    boardFilterAssignee: "",
    boardFilterType: "",
    boardFilterPriority: "",
    boardFilterTag: "",
    boardFilterQuery: "",
    boardTaskAttemptsByTaskId: {},
    boardRuntimeStatus: null,
    ...overrides,
  };
}

describe("tasks controller", () => {
  it("optimistically moves task then rolls back on RPC failure", async () => {
    let rejectRequest: (error: Error) => void = () => undefined;
    const request = vi.fn(
      () =>
        new Promise((_, reject: (error: Error) => void) => {
          rejectRequest = reject;
        }),
    );

    const state = createState({
      client: { request } as unknown as TasksState["client"],
      boardTasks: [
        {
          id: "task-1",
          projectId: "project-1",
          title: "do thing",
          description: "x",
          type: "feature",
          priority: "medium",
          complexity: null,
          status: "backlog",
          parentTaskId: null,
          dependsOnTaskIds: [],
          blockedByTaskIds: [],
          assignedAgentId: null,
          teamId: null,
          currentAttemptId: null,
          maxAttempts: 3,
          attemptCount: 0,
          relevantPaths: [],
          tags: [],
          createdBy: "human",
          createdAtMs: 1,
          updatedAtMs: 1,
          startedAtMs: null,
          completedAtMs: null,
        },
      ],
    });

    const movePromise = transitionTaskOptimistic(state, {
      id: "task-1",
      toStatus: "running",
      assignedAgentId: "zed",
    });

    expect(state.boardTasks[0]?.status).toBe("running");
    expect(state.boardBusy).toBe(true);

    rejectRequest(new Error("transition failed"));
    await movePromise;

    expect(state.boardTasks[0]?.status).toBe("backlog");
    expect(state.boardBusy).toBe(false);
    expect(state.boardError).toContain("transition failed");
  });
});
