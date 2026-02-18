import { html, nothing } from "lit";
import type { ProjectDto, TaskDto, TaskPriority, TaskType } from "../types.ts";
import { formatRelativeTimestamp } from "../format.ts";

const BOARD_COLUMNS: Array<{ status: Exclude<TaskDto["status"], "created">; label: string }> = [
  { status: "backlog", label: "Backlog" },
  { status: "assigned", label: "Assigned" },
  { status: "running", label: "Running" },
  { status: "review", label: "Review" },
  { status: "blocked", label: "Blocked" },
  { status: "failed", label: "Failed" },
  { status: "done", label: "Done" },
];

export type BoardProps = {
  loading: boolean;
  busy: boolean;
  error: string | null;
  projects: ProjectDto[];
  tasks: TaskDto[];
  selectedProjectId: string | null;
  showArchivedProjects: boolean;
  filters: {
    assignee: string;
    type: "" | TaskType;
    priority: "" | TaskPriority;
    tag: string;
    query: string;
  };
  onSelectProject: (projectId: string) => void;
  onToggleArchivedProjects: (enabled: boolean) => void;
  onFiltersChange: (patch: Partial<BoardProps["filters"]>) => void;
  onRefresh: () => void;
  onCreateProject: () => void;
  onCreateTask: () => void;
  onMoveTask: (taskId: string, toStatus: Exclude<TaskDto["status"], "created">) => void;
  onEditTask: (task: TaskDto) => void;
};

function boardStatus(status: TaskDto["status"]): Exclude<TaskDto["status"], "created"> {
  return status === "created" ? "backlog" : status;
}

function matchesFilters(task: TaskDto, filters: BoardProps["filters"]): boolean {
  const assignee = filters.assignee.trim();
  if (assignee && (task.assignedAgentId ?? "") !== assignee) {
    return false;
  }
  if (filters.type && task.type !== filters.type) {
    return false;
  }
  if (filters.priority && task.priority !== filters.priority) {
    return false;
  }
  const tag = filters.tag.trim().toLowerCase();
  if (tag && !task.tags.some((entry) => entry.toLowerCase() === tag)) {
    return false;
  }
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const text = `${task.title}\n${task.description}\n${task.tags.join(" ")}`.toLowerCase();
    if (!text.includes(query)) {
      return false;
    }
  }
  return true;
}

function priorityClass(priority: TaskPriority): string {
  if (priority === "critical") {
    return "task-card__priority--critical";
  }
  if (priority === "high") {
    return "task-card__priority--high";
  }
  if (priority === "low") {
    return "task-card__priority--low";
  }
  return "task-card__priority--medium";
}

export function renderBoard(props: BoardProps) {
  const visibleProjects = props.showArchivedProjects
    ? props.projects
    : props.projects.filter((project) => project.archivedAtMs == null);
  const selectedProject =
    visibleProjects.find((project) => project.id === props.selectedProjectId) ?? null;
  const scopedTasks = props.tasks
    .filter((task) => task.projectId === props.selectedProjectId)
    .filter((task) => matchesFilters(task, props.filters));

  const assigneeOptions = Array.from(
    new Set(props.tasks.map((task) => task.assignedAgentId?.trim() || "").filter(Boolean)),
  ).toSorted();

  return html`
    <section class="card board-shell">
      <div class="row board-shell__header">
        <div>
          <div class="card-title">Project Board</div>
          <div class="card-sub">Single-project Kanban board for active execution state.</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" @click=${props.onRefresh} ?disabled=${props.loading}>Refresh</button>
          <button class="btn" @click=${props.onCreateProject} ?disabled=${props.busy}>New Project</button>
          <button
            class="btn primary"
            @click=${props.onCreateTask}
            ?disabled=${props.busy || !props.selectedProjectId}
          >
            New Task
          </button>
        </div>
      </div>

      <div class="board-toolbar">
        <label class="field board-field">
          <span>Project</span>
          <select
            .value=${props.selectedProjectId ?? ""}
            @change=${(event: Event) =>
              props.onSelectProject((event.target as HTMLSelectElement).value)}
          >
            ${visibleProjects.map(
              (project) =>
                html`<option value=${project.id}>
                  ${project.name}${project.archivedAtMs != null ? " (archived)" : ""}
                </option>`,
            )}
          </select>
        </label>

        <label class="field board-field board-field--checkbox">
          <input
            type="checkbox"
            .checked=${props.showArchivedProjects}
            @change=${(event: Event) =>
              props.onToggleArchivedProjects((event.target as HTMLInputElement).checked)}
          />
          <span>Show archived</span>
        </label>

        <label class="field board-field">
          <span>Assignee</span>
          <select
            .value=${props.filters.assignee}
            @change=${(event: Event) =>
              props.onFiltersChange({ assignee: (event.target as HTMLSelectElement).value })}
          >
            <option value="">All</option>
            ${assigneeOptions.map((assignee) => html`<option value=${assignee}>${assignee}</option>`)}
          </select>
        </label>

        <label class="field board-field">
          <span>Type</span>
          <select
            .value=${props.filters.type}
            @change=${(event: Event) =>
              props.onFiltersChange({
                type: (event.target as HTMLSelectElement).value as TaskType | "",
              })}
          >
            <option value="">All</option>
            <option value="feature">feature</option>
            <option value="bugfix">bugfix</option>
            <option value="refactor">refactor</option>
            <option value="test">test</option>
            <option value="review">review</option>
            <option value="research">research</option>
            <option value="devops">devops</option>
          </select>
        </label>

        <label class="field board-field">
          <span>Priority</span>
          <select
            .value=${props.filters.priority}
            @change=${(event: Event) =>
              props.onFiltersChange({
                priority: (event.target as HTMLSelectElement).value as TaskPriority | "",
              })}
          >
            <option value="">All</option>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
        </label>

        <label class="field board-field">
          <span>Tag</span>
          <input
            .value=${props.filters.tag}
            placeholder="security"
            @input=${(event: Event) =>
              props.onFiltersChange({ tag: (event.target as HTMLInputElement).value })}
          />
        </label>

        <label class="field board-field board-field--wide">
          <span>Search</span>
          <input
            .value=${props.filters.query}
            placeholder="Find by title or description"
            @input=${(event: Event) =>
              props.onFiltersChange({ query: (event.target as HTMLInputElement).value })}
          />
        </label>
      </div>

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        !selectedProject
          ? html`
              <div class="callout" style="margin-top: 12px">Create a project to start planning work.</div>
            `
          : html`<div class="board-columns" style="margin-top: 14px;">
            ${BOARD_COLUMNS.map((column) => {
              const tasks = scopedTasks.filter(
                (task) => boardStatus(task.status) === column.status,
              );
              return html`
                <section
                  class="board-column"
                  data-status=${column.status}
                  @dragover=${(event: DragEvent) => {
                    event.preventDefault();
                    event.dataTransfer!.dropEffect = "move";
                  }}
                  @drop=${(event: DragEvent) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer?.getData("text/task-id")?.trim();
                    if (!taskId) {
                      return;
                    }
                    props.onMoveTask(taskId, column.status);
                  }}
                >
                  <header class="board-column__header">
                    <span class="board-column__title">${column.label}</span>
                    <span class="board-column__count">${tasks.length}</span>
                  </header>

                  <div class="board-column__cards">
                    ${tasks.map(
                      (task) => html`<article
                        class="task-card"
                        draggable="true"
                        @dragstart=${(event: DragEvent) => {
                          event.dataTransfer?.setData("text/task-id", task.id);
                          event.dataTransfer!.effectAllowed = "move";
                        }}
                        @click=${() => props.onEditTask(task)}
                      >
                        <div class="task-card__title">${task.title}</div>
                        <div class="task-card__meta">
                          <span class="task-card__priority ${priorityClass(task.priority)}">${task.priority}</span>
                          <span class="task-card__chip">${task.type}</span>
                          ${
                            task.assignedAgentId
                              ? html`<span class="task-card__chip">@${task.assignedAgentId}</span>`
                              : nothing
                          }
                        </div>
                        <div class="task-card__meta">
                          <span class="task-card__chip">deps ${task.dependsOnTaskIds.length}</span>
                          ${
                            task.blockedByTaskIds.length > 0
                              ? html`<span class="task-card__chip task-card__chip--blocked">
                                blocked ${task.blockedByTaskIds.length}
                              </span>`
                              : nothing
                          }
                          <span class="task-card__updated">
                            ${formatRelativeTimestamp(task.updatedAtMs)}
                          </span>
                        </div>
                      </article>`,
                    )}
                  </div>
                </section>
              `;
            })}
          </div>`
      }
    </section>
  `;
}
