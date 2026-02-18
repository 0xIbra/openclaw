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
        name: "Phase 2",
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
    onSelectProject: () => undefined,
    onToggleArchivedProjects: () => undefined,
    onFiltersChange: () => undefined,
    onRefresh: () => undefined,
    onCreateProject: () => undefined,
    onCreateTask: () => undefined,
    onMoveTask: () => undefined,
    onEditTask: () => undefined,
    ...overrides,
  };
}

describe("board view", () => {
  it("renders backlog/running columns and groups cards", () => {
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
            {
              id: "t-running",
              projectId: "project-1",
              title: "running task",
              description: "x",
              type: "feature",
              priority: "high",
              complexity: null,
              status: "running",
              parentTaskId: null,
              dependsOnTaskIds: [],
              blockedByTaskIds: [],
              assignedAgentId: "zed",
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
        }),
      ),
      container,
    );

    const backlogColumn = container.querySelector('[data-status="backlog"]');
    const runningColumn = container.querySelector('[data-status="running"]');

    expect(backlogColumn?.textContent).toContain("created task");
    expect(runningColumn?.textContent).toContain("running task");
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
