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
});
