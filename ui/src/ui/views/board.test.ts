import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { BoardProps } from "./board.ts";
import { renderBoard } from "./board.ts";

function createProps(overrides: Partial<BoardProps> = {}): BoardProps {
  return {
    loading: false,
    busy: false,
    error: null,
    projects: [
      {
        id: "project-1",
        name: "Phase 6",
        createdAtMs: 1,
        updatedAtMs: 1,
        archivedAtMs: null,
      },
    ],
    tasks: [],
    selectedProjectId: "project-1",
    showArchivedProjects: false,
    filters: {
      assignee: "",
      type: "",
      priority: "",
      tag: "",
      query: "",
    },
    modal: null,
    selectedTaskId: null,
    selectedTaskAttempts: [],
    taskReviewsByTaskId: {},
    decompositionRunsByParentTaskId: {},
    selectedTaskAttemptsLoading: false,
    runtimeStatus: {
      workers: [],
      leads: [],
      teams: [],
      updatedAtMs: Date.now(),
    },
    runtimeLoading: false,
    runtimeError: null,
    operatorPendingKey: null,
    escalations: [],
    onSelectProject: () => undefined,
    onToggleArchivedProjects: () => undefined,
    onFiltersChange: () => undefined,
    onRefresh: () => undefined,
    onRefreshRuntime: () => undefined,
    onOpenCreateProject: () => undefined,
    onOpenCreateTask: () => undefined,
    onOpenEditTask: () => undefined,
    onOpenTaskDrawer: () => undefined,
    onCloseTaskDrawer: () => undefined,
    onMoveTask: () => undefined,
    onUpdateProjectDraft: () => undefined,
    onUpdateTaskDraft: () => undefined,
    onSubmitProjectForm: () => undefined,
    onSubmitTaskForm: () => undefined,
    onCloseModal: () => undefined,
    onConfirmModal: () => undefined,
    onRequestPauseAgent: () => undefined,
    onRequestResumeAgent: () => undefined,
    onRequestRestartAgent: () => undefined,
    onRequestRequeueTask: () => undefined,
    onRequestForceFailTask: () => undefined,
    onRequestDecomposeTask: () => undefined,
    onRequestApproveParentTask: () => undefined,
    onRequestRejectParentTask: () => undefined,
    onConfirmReasonChange: () => undefined,
    ...overrides,
  };
}

describe("board view", () => {
  it("renders board columns and runtime panel", () => {
    const container = document.createElement("div");
    render(
      renderBoard(
        createProps({
          tasks: [
            {
              id: "t-created",
              projectId: "project-1",
              title: "created task",
              description: "x",
              type: "feature",
              priority: "medium",
              complexity: null,
              status: "created",
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
          runtimeStatus: {
            workers: [
              {
                agentId: "worker-a",
                teamIds: ["team-1"],
                state: "idle",
                currentTaskId: null,
                lastHeartbeatAtMs: null,
                errorStreak: 0,
                lastError: null,
                updatedAtMs: Date.now(),
              },
            ],
            leads: [],
            teams: [],
            updatedAtMs: Date.now(),
          },
        }),
      ),
      container,
    );

    expect(container.querySelector('[data-status="backlog"]')?.textContent).toContain(
      "created task",
    );
    expect(container.textContent).toContain("Runtime");
    expect(container.textContent).toContain("worker-a");
  });

  it("calls onMoveTask on drop", () => {
    const onMoveTask = vi.fn();
    const container = document.createElement("div");
    render(
      renderBoard(
        createProps({
          tasks: [
            {
              id: "t-1",
              projectId: "project-1",
              title: "backlog task",
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
          onMoveTask,
        }),
      ),
      container,
    );

    const dropTarget = container.querySelector('[data-status="running"]');
    expect(dropTarget).not.toBeNull();
    const event = new Event("drop", { bubbles: true }) as DragEvent;
    Object.defineProperty(event, "dataTransfer", {
      value: {
        getData: () => "t-1",
      },
    });
    dropTarget?.dispatchEvent(event);
    expect(onMoveTask).toHaveBeenCalledWith("t-1", "running");
  });

  it("renders decomposition/review controls in task drawer", () => {
    const onRequestDecomposeTask = vi.fn();
    const onRequestApproveParentTask = vi.fn();
    const onRequestRejectParentTask = vi.fn();

    const parentTask = {
      id: "parent-1",
      projectId: "project-1",
      title: "parent",
      description: "parent task",
      type: "feature" as const,
      priority: "high" as const,
      complexity: null,
      status: "review" as const,
      parentTaskId: null,
      dependsOnTaskIds: [],
      blockedByTaskIds: [],
      assignedAgentId: "lead-agent",
      teamId: "team-1",
      currentAttemptId: null,
      maxAttempts: 3,
      attemptCount: 1,
      relevantPaths: [],
      tags: [],
      createdBy: "human",
      createdAtMs: 1,
      updatedAtMs: 2,
      startedAtMs: null,
      completedAtMs: null,
    };

    const container = document.createElement("div");
    render(
      renderBoard(
        createProps({
          tasks: [
            parentTask,
            {
              ...parentTask,
              id: "child-1",
              title: "child",
              status: "done",
              parentTaskId: "parent-1",
            },
          ],
          selectedTaskId: "parent-1",
          selectedTaskAttempts: [],
          taskReviewsByTaskId: {
            "parent-1": {
              id: "review-1",
              taskId: "parent-1",
              teamId: "team-1",
              leadAgentId: "lead-agent",
              status: "pending_human",
              requireHumanApproval: true,
              autoApproveOnClean: true,
              decisionActor: null,
              decisionReason: null,
              verdict: {},
              createdAtMs: 1,
              updatedAtMs: 1,
              resolvedAtMs: null,
            },
          },
          decompositionRunsByParentTaskId: {
            "parent-1": {
              id: "run-1",
              parentTaskId: "parent-1",
              teamId: "team-1",
              leadAgentId: "lead-agent",
              status: "applied",
              plannerBackend: "test",
              plannerSessionId: null,
              plan: {},
              childTaskIds: ["child-1"],
              errorText: null,
              dedupeKey: null,
              createdAtMs: 1,
              updatedAtMs: 1,
            },
          },
          onRequestDecomposeTask,
          onRequestApproveParentTask,
          onRequestRejectParentTask,
        }),
      ),
      container,
    );

    const decomposeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Decompose now",
    );
    decomposeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onRequestDecomposeTask).toHaveBeenCalledWith(parentTask);

    const approveButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Approve parent",
    );
    approveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onRequestApproveParentTask).toHaveBeenCalledWith(parentTask);

    const rejectButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reject parent",
    );
    rejectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onRequestRejectParentTask).toHaveBeenCalledWith(parentTask);
  });
});
