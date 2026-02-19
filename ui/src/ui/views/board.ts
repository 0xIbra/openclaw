import { html, nothing } from "lit";
import type {
  ProjectDto,
  TaskAttemptDto,
  TaskDecompositionRunDto,
  TaskDto,
  TaskEscalationDto,
  TaskPriority,
  TaskReviewDto,
  TaskRuntimeStatusDto,
  TaskType,
} from "../types.ts";
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

export type BoardProjectDraft = {
  name: string;
  description: string;
  repoRoot: string;
};

export type BoardTaskDraft = {
  id: string | null;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  assignedAgentId: string;
  tags: string;
};

export type BoardModalState =
  | null
  | {
      type: "createProject";
      draft: BoardProjectDraft;
      error: string | null;
    }
  | {
      type: "createTask" | "editTask";
      draft: BoardTaskDraft;
      error: string | null;
    }
  | {
      type: "confirmAction";
      title: string;
      message: string;
      confirmLabel: string;
      tone: "primary" | "danger";
      requireReason?: boolean;
      reason?: string;
      error?: string | null;
    };

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
  modal: BoardModalState;
  selectedTaskId: string | null;
  selectedTaskAttempts: TaskAttemptDto[];
  taskReviewsByTaskId: Record<string, TaskReviewDto>;
  decompositionRunsByParentTaskId: Record<string, TaskDecompositionRunDto>;
  selectedTaskAttemptsLoading: boolean;
  runtimeStatus: TaskRuntimeStatusDto | null;
  runtimeLoading: boolean;
  runtimeError: string | null;
  operatorPendingKey: string | null;
  escalations: TaskEscalationDto[];
  onSelectProject: (projectId: string) => void;
  onToggleArchivedProjects: (enabled: boolean) => void;
  onFiltersChange: (patch: Partial<BoardProps["filters"]>) => void;
  onRefresh: () => void;
  onRefreshRuntime: () => void;
  onOpenCreateProject: () => void;
  onOpenCreateTask: () => void;
  onOpenEditTask: (task: TaskDto) => void;
  onOpenTaskDrawer: (taskId: string) => void;
  onCloseTaskDrawer: () => void;
  onMoveTask: (taskId: string, toStatus: Exclude<TaskDto["status"], "created">) => void;
  onUpdateProjectDraft: (patch: Partial<BoardProjectDraft>) => void;
  onUpdateTaskDraft: (patch: Partial<BoardTaskDraft>) => void;
  onSubmitProjectForm: () => void;
  onSubmitTaskForm: () => void;
  onCloseModal: () => void;
  onConfirmModal: () => void;
  onRequestPauseAgent: (agentId: string) => void;
  onRequestResumeAgent: (agentId: string) => void;
  onRequestRestartAgent: (agentId: string) => void;
  onRequestRequeueTask: (task: TaskDto) => void;
  onRequestForceFailTask: (task: TaskDto) => void;
  onRequestDecomposeTask: (task: TaskDto) => void;
  onRequestApproveParentTask: (task: TaskDto) => void;
  onRequestRejectParentTask: (task: TaskDto) => void;
  onConfirmReasonChange: (reason: string) => void;
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

function stateClass(state: string): string {
  if (state === "running" || state === "processing" || state === "delegating") {
    return "chip-ok";
  }
  if (state === "blocked" || state === "waiting") {
    return "chip-warn";
  }
  if (state === "failed" || state === "unhealthy") {
    return "chip-danger";
  }
  return "";
}

function latestAttempt(attempts: TaskAttemptDto[]): TaskAttemptDto | null {
  return attempts[0] ?? null;
}

function summarizeTestOutcome(attempt: TaskAttemptDto | null): string {
  if (!attempt) {
    return "No test summary";
  }
  const data = attempt.testOutcome;
  const passed = Number((data.passed as number | undefined) ?? 0);
  const failed = Number((data.failed as number | undefined) ?? 0);
  const total = Number((data.total as number | undefined) ?? passed + failed);
  if (!Number.isFinite(total) || total <= 0) {
    return "No test summary";
  }
  return `${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""}`;
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
  const selectedTask = scopedTasks.find((task) => task.id === props.selectedTaskId) ?? null;
  const currentAttempt = latestAttempt(props.selectedTaskAttempts);
  const childTasks = selectedTask
    ? scopedTasks.filter((task) => task.parentTaskId === selectedTask.id)
    : [];
  const selectedReview = selectedTask ? (props.taskReviewsByTaskId[selectedTask.id] ?? null) : null;
  const decompositionRun = selectedTask
    ? (props.decompositionRunsByParentTaskId[selectedTask.id] ?? null)
    : null;
  const childDoneCount = childTasks.filter((task) => task.status === "done").length;
  const assigneeOptions = Array.from(
    new Set(props.tasks.map((task) => task.assignedAgentId?.trim() || "").filter(Boolean)),
  ).toSorted();

  return html`
    <section class="card board-shell">
      <div class="row board-shell__header">
        <div>
          <div class="card-title">Command Center</div>
          <div class="card-sub">Operational board with live runtime state and direct controls.</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" @click=${props.onRefresh} ?disabled=${props.loading}>Refresh</button>
          <button class="btn" @click=${props.onOpenCreateProject} ?disabled=${props.busy}>
            New Project
          </button>
          <button
            class="btn primary"
            @click=${props.onOpenCreateTask}
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

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      ${
        !selectedProject
          ? html`
              <div class="callout">Create a project to start planning work.</div>
            `
          : html`<div class="board-layout">
              <div class="board-columns">
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
                            @click=${() => props.onOpenTaskDrawer(task.id)}
                          >
                            <div class="task-card__title">${task.title}</div>
                            <div class="task-card__meta">
                              <span class="task-card__priority ${priorityClass(task.priority)}"
                                >${task.priority}</span
                              >
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
                              <span class="task-card__updated"
                                >${formatRelativeTimestamp(task.updatedAtMs)}</span
                              >
                            </div>
                            <div class="task-card__actions">
                              <button
                                class="btn btn--sm"
                                @click=${(event: Event) => {
                                  event.stopPropagation();
                                  props.onOpenEditTask(task);
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          </article>`,
                        )}
                      </div>
                    </section>
                  `;
                })}
              </div>

              <aside class="board-runtime-panel">
                <div class="board-runtime-panel__header">
                  <div class="card-title">Runtime</div>
                  <button class="btn btn--sm" @click=${props.onRefreshRuntime}>Refresh</button>
                </div>
                ${
                  props.runtimeError
                    ? html`<div class="callout danger">${props.runtimeError}</div>`
                    : nothing
                }
                ${
                  props.runtimeStatus
                    ? html`
                        <div class="board-runtime-list">
                          <div class="board-runtime-section">
                            <div class="board-runtime-section__title">
                              Workers (${props.runtimeStatus.workers.length})
                            </div>
                            ${props.runtimeStatus.workers.map((worker) => {
                              const task = scopedTasks.find(
                                (entry) => entry.id === worker.currentTaskId,
                              );
                              return html`
                                <div class="board-runtime-row">
                                  <div>
                                    <div class="board-runtime-row__name">${worker.agentId}</div>
                                    <div class="board-runtime-row__meta">
                                      ${task ? task.title : (worker.currentTaskId ?? "Idle")}
                                    </div>
                                  </div>
                                  <div class="chip ${stateClass(worker.state)}">${worker.state}</div>
                                  <div class="board-runtime-row__actions">
                                    ${
                                      worker.state === "paused"
                                        ? html`<button
                                            class="btn btn--sm"
                                            @click=${() => props.onRequestResumeAgent(worker.agentId)}
                                            ?disabled=${
                                              props.operatorPendingKey ===
                                              `resumeWorker:${worker.agentId}`
                                            }
                                          >
                                            Resume
                                          </button>`
                                        : html`<button
                                            class="btn btn--sm"
                                            @click=${() => props.onRequestPauseAgent(worker.agentId)}
                                            ?disabled=${
                                              props.operatorPendingKey ===
                                              `pauseWorker:${worker.agentId}`
                                            }
                                          >
                                            Pause
                                          </button>`
                                    }
                                    <button
                                      class="btn btn--sm"
                                      @click=${() => props.onRequestRestartAgent(worker.agentId)}
                                      ?disabled=${
                                        props.operatorPendingKey ===
                                        `restartWorker:${worker.agentId}`
                                      }
                                    >
                                      Restart
                                    </button>
                                  </div>
                                </div>
                              `;
                            })}
                          </div>
                          <div class="board-runtime-section">
                            <div class="board-runtime-section__title">
                              Leads (${props.runtimeStatus.leads.length})
                            </div>
                            ${props.runtimeStatus.leads.map(
                              (lead) => html`
                                <div class="board-runtime-row">
                                  <div>
                                    <div class="board-runtime-row__name">${lead.teamName}</div>
                                    <div class="board-runtime-row__meta">${lead.leadAgentId}</div>
                                  </div>
                                  <div class="chip ${stateClass(lead.state)}">${lead.state}</div>
                                  <div class="board-runtime-row__meta">
                                    waiting ${lead.waitingQuestionCount}
                                  </div>
                                </div>
                              `,
                            )}
                          </div>
                          <div class="board-runtime-section">
                            <div class="board-runtime-section__title">
                              Escalations (${props.escalations.length})
                            </div>
                            ${
                              props.escalations.length < 1
                                ? html`
                                    <div class="muted">No escalations.</div>
                                  `
                                : props.escalations.map(
                                    (entry) => html`
                                      <div class="board-runtime-row board-runtime-row--escalation">
                                        <div>
                                          <div class="board-runtime-row__name">${entry.teamId}</div>
                                          <div class="board-runtime-row__meta">
                                            ${formatRelativeTimestamp(entry.escalatedAtMs)}
                                          </div>
                                        </div>
                                        <div class="chip chip-danger">Escalated</div>
                                        <div class="board-runtime-row__meta">
                                          ${entry.taskId ?? "No task"}
                                        </div>
                                      </div>
                                    `,
                                  )
                            }
                          </div>
                        </div>
                      `
                    : html`<div class="muted">${props.runtimeLoading ? "Loading..." : "No runtime data"}</div>`
                }
              </aside>
            </div>`
      }

      ${
        selectedTask
          ? html`
              <aside class="board-drawer" aria-expanded="true">
                <div class="board-drawer__header">
                  <div>
                    <div class="card-title">${selectedTask.title}</div>
                    <div class="card-sub">${selectedTask.id}</div>
                  </div>
                  <div class="row" style="gap: 8px;">
                    <button class="btn btn--sm" @click=${() => props.onOpenEditTask(selectedTask)}>
                      Edit
                    </button>
                    <button class="btn btn--sm" @click=${props.onCloseTaskDrawer}>Close</button>
                  </div>
                </div>

                <div class="board-drawer__grid">
                  <div class="board-drawer__section">
                    <div class="board-drawer__section-title">Lifecycle</div>
                    <div class="board-drawer__kv">Status: ${selectedTask.status}</div>
                    <div class="board-drawer__kv">Assignee: ${selectedTask.assignedAgentId ?? "Unassigned"}</div>
                    <div class="board-drawer__kv">Attempts: ${selectedTask.attemptCount}/${selectedTask.maxAttempts}</div>
                    <div class="board-drawer__kv">Updated: ${formatRelativeTimestamp(selectedTask.updatedAtMs)}</div>
                  </div>
                  <div class="board-drawer__section">
                    <div class="board-drawer__section-title">Dependencies</div>
                    <div class="board-drawer__kv">
                      Depends on: ${
                        selectedTask.dependsOnTaskIds.length > 0
                          ? selectedTask.dependsOnTaskIds.join(", ")
                          : "None"
                      }
                    </div>
                    <div class="board-drawer__kv">
                      Blocked by: ${
                        selectedTask.blockedByTaskIds.length > 0
                          ? selectedTask.blockedByTaskIds.join(", ")
                          : "None"
                      }
                    </div>
                  </div>
                  <div class="board-drawer__section">
                    <div class="board-drawer__section-title">Decomposition & Review</div>
                    <div class="board-drawer__kv">
                      Children: ${childTasks.length > 0 ? `${childDoneCount}/${childTasks.length} done` : "None"}
                    </div>
                    <div class="board-drawer__kv">
                      Decomposition run: ${decompositionRun ? decompositionRun.status : "Not decomposed"}
                    </div>
                    <div class="board-drawer__kv">
                      Review state: ${selectedReview ? selectedReview.status : "No review record"}
                    </div>
                    <div class="board-drawer__kv">
                      Human gate: ${
                        selectedReview
                          ? selectedReview.requireHumanApproval
                            ? "required"
                            : "disabled"
                          : "default"
                      }
                    </div>
                    <div class="board-drawer__kv">
                      Auto-approve: ${
                        selectedReview
                          ? selectedReview.autoApproveOnClean
                            ? "enabled"
                            : "disabled"
                          : "default"
                      }
                    </div>
                  </div>
                </div>

                ${
                  selectedReview?.status === "pending_human"
                    ? html`
                        <div class="callout info">Parent task is waiting for human approval.</div>
                      `
                    : nothing
                }

                ${
                  childTasks.length > 0
                    ? html`
                        <div class="board-drawer__section">
                          <div class="board-drawer__section-title">Child Tasks</div>
                          <div class="board-attempts">
                            ${childTasks.map(
                              (child) => html`
                                <div class="board-attempt">
                                  <div>
                                    <div class="board-attempt__title">${child.title}</div>
                                    <div class="board-runtime-row__meta">${child.id}</div>
                                  </div>
                                  <div class="chip ${stateClass(child.status)}">${child.status}</div>
                                </div>
                              `,
                            )}
                          </div>
                        </div>
                      `
                    : nothing
                }

                <div class="board-drawer__section">
                  <div class="board-drawer__section-title">Latest Error</div>
                  <div class="board-drawer__kv">${currentAttempt?.errorText ?? "No active error."}</div>
                </div>

                <div class="board-drawer__section">
                  <div class="board-drawer__section-title">Changed Files</div>
                  ${
                    currentAttempt && currentAttempt.changedFiles.length > 0
                      ? html`<ul class="board-list">
                          ${currentAttempt.changedFiles.map((file) => html`<li>${file}</li>`)}
                        </ul>`
                      : html`
                          <div class="board-drawer__kv">No file changes recorded.</div>
                        `
                  }
                </div>

                <div class="board-drawer__section">
                  <div class="board-drawer__section-title">Tests</div>
                  <div class="board-drawer__kv">${summarizeTestOutcome(currentAttempt)}</div>
                </div>

                <div class="board-drawer__section">
                  <div class="board-drawer__section-title">Attempts</div>
                  ${
                    props.selectedTaskAttemptsLoading
                      ? html`
                          <div class="muted">Loading attempts...</div>
                        `
                      : html`
                          <div class="board-attempts">
                            ${props.selectedTaskAttempts.map(
                              (attempt) => html`
                                <div class="board-attempt">
                                  <div>
                                    <div class="board-attempt__title">
                                      #${attempt.attemptNumber ?? "-"} ${attempt.status}
                                    </div>
                                    <div class="board-runtime-row__meta">
                                      ${attempt.summary ?? "No summary"}
                                    </div>
                                  </div>
                                  <div class="board-runtime-row__meta">
                                    ${formatRelativeTimestamp(attempt.startedAtMs)}
                                  </div>
                                </div>
                              `,
                            )}
                          </div>
                        `
                  }
                </div>

                <div class="board-drawer__actions">
                  ${
                    !selectedTask.parentTaskId
                      ? html`
                          <button
                            class="btn"
                            @click=${() => props.onRequestDecomposeTask(selectedTask)}
                            ?disabled=${props.operatorPendingKey === `decompose:${selectedTask.id}`}
                          >
                            Decompose now
                          </button>
                        `
                      : nothing
                  }
                  ${
                    selectedReview &&
                    (selectedReview.status === "pending_human" ||
                      selectedReview.status === "pending_lead")
                      ? html`
                          <button
                            class="btn primary"
                            @click=${() => props.onRequestApproveParentTask(selectedTask)}
                          >
                            Approve parent
                          </button>
                          <button
                            class="btn danger"
                            @click=${() => props.onRequestRejectParentTask(selectedTask)}
                          >
                            Reject parent
                          </button>
                        `
                      : nothing
                  }
                  <button class="btn" @click=${() => props.onRequestRequeueTask(selectedTask)}>
                    Requeue
                  </button>
                  <button
                    class="btn danger"
                    @click=${() => props.onRequestForceFailTask(selectedTask)}
                  >
                    Force Fail Active
                  </button>
                </div>
              </aside>
            `
          : nothing
      }

      ${
        props.modal?.type === "createProject"
          ? html`
              <div class="exec-approval-overlay board-modal" role="dialog" aria-modal="true">
                <div class="exec-approval-card board-modal__card">
                  <div class="exec-approval-header">
                    <div class="exec-approval-title">Create Project</div>
                  </div>
                  ${props.modal.error ? html`<div class="callout danger">${props.modal.error}</div>` : nothing}
                  <form
                    class="form-grid"
                    @submit=${(event: Event) => {
                      event.preventDefault();
                      props.onSubmitProjectForm();
                    }}
                  >
                    <label class="field full">
                      <span>Name</span>
                      <input
                        .value=${props.modal.draft.name}
                        @input=${(event: Event) =>
                          props.onUpdateProjectDraft({
                            name: (event.target as HTMLInputElement).value,
                          })}
                      />
                    </label>
                    <label class="field full">
                      <span>Description</span>
                      <textarea
                        .value=${props.modal.draft.description}
                        @input=${(event: Event) =>
                          props.onUpdateProjectDraft({
                            description: (event.target as HTMLTextAreaElement).value,
                          })}
                      ></textarea>
                    </label>
                    <label class="field full">
                      <span>Repo Root</span>
                      <input
                        .value=${props.modal.draft.repoRoot}
                        @input=${(event: Event) =>
                          props.onUpdateProjectDraft({
                            repoRoot: (event.target as HTMLInputElement).value,
                          })}
                      />
                    </label>
                    <div class="row board-modal__actions">
                      <button type="button" class="btn" @click=${props.onCloseModal}>Cancel</button>
                      <button type="submit" class="btn primary">Create</button>
                    </div>
                  </form>
                </div>
              </div>
            `
          : nothing
      }

      ${
        props.modal?.type === "createTask" || props.modal?.type === "editTask"
          ? html`
              <div class="exec-approval-overlay board-modal" role="dialog" aria-modal="true">
                <div class="exec-approval-card board-modal__card">
                  <div class="exec-approval-header">
                    <div class="exec-approval-title">
                      ${props.modal.type === "createTask" ? "Create Task" : "Edit Task"}
                    </div>
                  </div>
                  ${props.modal.error ? html`<div class="callout danger">${props.modal.error}</div>` : nothing}
                  <form
                    class="form-grid"
                    @submit=${(event: Event) => {
                      event.preventDefault();
                      props.onSubmitTaskForm();
                    }}
                  >
                    <label class="field full">
                      <span>Title</span>
                      <input
                        .value=${props.modal.draft.title}
                        @input=${(event: Event) =>
                          props.onUpdateTaskDraft({
                            title: (event.target as HTMLInputElement).value,
                          })}
                      />
                    </label>
                    <label class="field full">
                      <span>Description</span>
                      <textarea
                        .value=${props.modal.draft.description}
                        @input=${(event: Event) =>
                          props.onUpdateTaskDraft({
                            description: (event.target as HTMLTextAreaElement).value,
                          })}
                      ></textarea>
                    </label>
                    <label class="field">
                      <span>Type</span>
                      <select
                        .value=${props.modal.draft.type}
                        @change=${(event: Event) =>
                          props.onUpdateTaskDraft({
                            type: (event.target as HTMLSelectElement).value as TaskType,
                          })}
                      >
                        <option value="feature">feature</option>
                        <option value="bugfix">bugfix</option>
                        <option value="refactor">refactor</option>
                        <option value="test">test</option>
                        <option value="review">review</option>
                        <option value="research">research</option>
                        <option value="devops">devops</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>Priority</span>
                      <select
                        .value=${props.modal.draft.priority}
                        @change=${(event: Event) =>
                          props.onUpdateTaskDraft({
                            priority: (event.target as HTMLSelectElement).value as TaskPriority,
                          })}
                      >
                        <option value="critical">critical</option>
                        <option value="high">high</option>
                        <option value="medium">medium</option>
                        <option value="low">low</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>Assignee (blank clears)</span>
                      <input
                        .value=${props.modal.draft.assignedAgentId}
                        @input=${(event: Event) =>
                          props.onUpdateTaskDraft({
                            assignedAgentId: (event.target as HTMLInputElement).value,
                          })}
                      />
                    </label>
                    <label class="field">
                      <span>Tags (comma-separated)</span>
                      <input
                        .value=${props.modal.draft.tags}
                        @input=${(event: Event) =>
                          props.onUpdateTaskDraft({
                            tags: (event.target as HTMLInputElement).value,
                          })}
                      />
                    </label>
                    <div class="row board-modal__actions">
                      <button type="button" class="btn" @click=${props.onCloseModal}>Cancel</button>
                      <button type="submit" class="btn primary">
                        ${props.modal.type === "createTask" ? "Create" : "Save"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            `
          : nothing
      }

      ${
        props.modal?.type === "confirmAction"
          ? html`
              <div class="exec-approval-overlay board-modal" role="dialog" aria-modal="true">
                <div class="exec-approval-card board-modal__card">
                  <div class="exec-approval-title">${props.modal.title}</div>
                  <div class="exec-approval-sub">${props.modal.message}</div>
                  ${
                    props.modal.requireReason
                      ? html`
                          <label class="field full">
                            <span>Reason</span>
                            <textarea
                              .value=${props.modal.reason ?? ""}
                              @input=${(event: Event) =>
                                props.onConfirmReasonChange(
                                  (event.target as HTMLTextAreaElement).value,
                                )}
                            ></textarea>
                          </label>
                        `
                      : nothing
                  }
                  ${props.modal.error ? html`<div class="callout danger">${props.modal.error}</div>` : nothing}
                  <div class="row board-modal__actions">
                    <button class="btn" @click=${props.onCloseModal}>Cancel</button>
                    <button
                      class="btn ${props.modal.tone === "danger" ? "danger" : "primary"}"
                      @click=${props.onConfirmModal}
                    >
                      ${props.modal.confirmLabel}
                    </button>
                  </div>
                </div>
              </div>
            `
          : nothing
      }
    </section>
  `;
}
