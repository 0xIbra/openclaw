import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChatAvatar } from "./app-chat.ts";
import { renderUsageTab } from "./app-render-usage-tab.ts";
import { renderChatControls, renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import {
  applyConfig,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config.ts";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
  normalizeCronFormState,
} from "./controllers/cron.ts";
import { loadDebug, callDebugMethod } from "./controllers/debug.ts";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices.ts";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import { createProject, loadProjects } from "./controllers/projects.ts";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions.ts";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.ts";
import {
  createTask,
  decideTaskReview,
  decomposeTask,
  forceFailActiveTask,
  listTaskAttempts,
  listPendingTaskReviews,
  loadRuntimeStatus,
  pauseRuntimeAgent,
  requeueTask,
  restartRuntimeAgent,
  resumeRuntimeAgent,
  loadTasks,
  transitionTaskOptimistic,
  updateTask,
} from "./controllers/tasks.ts";
import { loadTeams } from "./controllers/teams.ts";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation.ts";
import { renderAgents } from "./views/agents.ts";
import { renderBoard } from "./views/board.ts";
import { renderChannels } from "./views/channels.ts";
import { renderChat } from "./views/chat.ts";
import { renderConfig } from "./views/config.ts";
import { renderCron } from "./views/cron.ts";
import { renderDebug } from "./views/debug.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderInstances } from "./views/instances.ts";
import { renderLogs } from "./views/logs.ts";
import { renderNodes } from "./views/nodes.ts";
import { renderOverview } from "./views/overview.ts";
import { renderSessions } from "./views/sessions.ts";
import { renderSkills } from "./views/skills.ts";

const SUPPORTED_CRON_CHANNELS = new Set(["telegram", "discord"]);

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : "Disconnected from gateway.";
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const basePath = normalizeBasePath(state.basePath ?? "");
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;
  const selectedBoardTask = state.boardSelectedTaskId
    ? (state.boardTasks.find((task) => task.id === state.boardSelectedTaskId) ?? null)
    : null;
  const selectedBoardAttempts = selectedBoardTask
    ? (state.boardTaskAttemptsByTaskId[selectedBoardTask.id] ?? [])
    : [];
  const selectedBoardAttemptsLoading =
    selectedBoardTask != null && state.boardTaskAttemptsLoadingTaskId === selectedBoardTask.id;
  const boardModal =
    state.boardActiveModal === "createProject"
      ? {
          type: "createProject" as const,
          draft: state.boardProjectDraft,
          error: state.boardModalError,
        }
      : state.boardActiveModal === "createTask" || state.boardActiveModal === "editTask"
        ? {
            type: state.boardActiveModal,
            draft: state.boardTaskDraft,
            error: state.boardModalError,
          }
        : state.boardActiveModal === "confirmAction" && state.boardConfirmAction
          ? {
              type: "confirmAction" as const,
              title: state.boardConfirmAction.title,
              message: state.boardConfirmAction.message,
              confirmLabel: state.boardConfirmAction.confirmLabel,
              tone: state.boardConfirmAction.tone,
              requireReason:
                state.boardConfirmAction.action.type === "reviewDecide" &&
                state.boardConfirmAction.action.decision === "reject",
              reason:
                state.boardConfirmAction.action.type === "reviewDecide"
                  ? state.boardConfirmAction.action.reason
                  : "",
              error: state.boardModalError,
            }
          : null;

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src=${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"} alt="OpenClaw" />
            </div>
            <div class="brand-text">
              <div class="brand-title">OPENCLAW</div>
              <div class="brand-sub">Gateway Dashboard</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>Health</span>
            <span class="mono">${state.connected ? "OK" : "Offline"}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${group.label}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}
        <div class="nav-group nav-group--links">
          <div class="nav-label nav-label--static">
            <span class="nav-label__text">Resources</span>
          </div>
          <div class="nav-group__items">
            <a
              class="nav-item nav-item--external"
              href="https://docs.openclaw.ai"
              target="_blank"
              rel="noreferrer"
              title="Docs (opens in new tab)"
            >
              <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
              <span class="nav-item__text">Docs</span>
            </a>
          </div>
        </div>
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            ${state.tab === "usage" ? nothing : html`<div class="page-title">${titleForTab(state.tab)}</div>`}
            ${state.tab === "usage" ? nothing : html`<div class="page-sub">${subtitleForTab(state.tab)}</div>`}
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
            ${isChat ? renderChatControls(state) : nothing}
          </div>
        </section>

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
              })
            : nothing
        }

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                onRefresh: (probe) => loadChannels(state, probe),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${renderUsageTab(state)}

        ${
          state.tab === "board"
            ? renderBoard({
                loading: state.boardLoading,
                busy: state.boardBusy,
                error: state.boardError,
                projects: state.boardProjects,
                tasks: state.boardTasks,
                selectedProjectId: state.boardSelectedProjectId,
                showArchivedProjects: state.boardShowArchivedProjects,
                modal: boardModal,
                selectedTaskId: state.boardSelectedTaskId,
                selectedTaskAttempts: selectedBoardAttempts,
                taskReviewsByTaskId: state.boardTaskReviewsByTaskId,
                decompositionRunsByParentTaskId: state.boardDecompositionRunsByParentTaskId,
                selectedTaskAttemptsLoading: selectedBoardAttemptsLoading,
                runtimeStatus: state.boardRuntimeStatus,
                runtimeLoading: state.boardRuntimeLoading,
                runtimeError: state.boardRuntimeError,
                operatorPendingKey: state.boardOperatorPendingKey,
                escalations: state.boardEscalations,
                filters: {
                  assignee: state.boardFilterAssignee,
                  type: state.boardFilterType,
                  priority: state.boardFilterPriority,
                  tag: state.boardFilterTag,
                  query: state.boardFilterQuery,
                },
                onSelectProject: (projectId) => {
                  state.boardSelectedProjectId = projectId || null;
                  state.boardSelectedTaskId = null;
                  void loadTasks(state).then(() =>
                    listPendingTaskReviews(state, {
                      projectId: state.boardSelectedProjectId ?? undefined,
                      limit: 200,
                    }).catch(() => undefined),
                  );
                },
                onToggleArchivedProjects: (enabled) => {
                  state.boardShowArchivedProjects = enabled;
                  void loadProjects(state)
                    .then(() => loadTasks(state))
                    .then(() =>
                      listPendingTaskReviews(state, {
                        projectId: state.boardSelectedProjectId ?? undefined,
                        limit: 200,
                      }).catch(() => undefined),
                    );
                },
                onFiltersChange: (patch) => {
                  state.boardFilterAssignee = patch.assignee ?? state.boardFilterAssignee;
                  state.boardFilterType = patch.type ?? state.boardFilterType;
                  state.boardFilterPriority = patch.priority ?? state.boardFilterPriority;
                  state.boardFilterTag = patch.tag ?? state.boardFilterTag;
                  state.boardFilterQuery = patch.query ?? state.boardFilterQuery;
                  void loadTasks(state);
                },
                onRefresh: () => {
                  void loadProjects(state)
                    .then(() => loadTasks(state))
                    .then(() =>
                      listPendingTaskReviews(state, {
                        projectId: state.boardSelectedProjectId ?? undefined,
                        limit: 200,
                      }),
                    )
                    .then(async () => {
                      state.boardRuntimeLoading = true;
                      state.boardRuntimeError = null;
                      try {
                        await loadRuntimeStatus(state);
                      } catch (err) {
                        state.boardRuntimeError = String(err);
                      } finally {
                        state.boardRuntimeLoading = false;
                      }
                    });
                },
                onRefreshRuntime: () => {
                  state.boardRuntimeLoading = true;
                  state.boardRuntimeError = null;
                  void loadRuntimeStatus(state)
                    .catch((err) => {
                      state.boardRuntimeError = String(err);
                    })
                    .finally(() => {
                      state.boardRuntimeLoading = false;
                    });
                },
                onOpenCreateProject: () => {
                  state.boardProjectDraft = {
                    name: "",
                    description: "",
                    repoRoot: "",
                  };
                  state.boardModalError = null;
                  state.boardActiveModal = "createProject";
                },
                onOpenCreateTask: () => {
                  if (!state.boardSelectedProjectId) {
                    return;
                  }
                  state.boardTaskDraft = {
                    id: null,
                    title: "",
                    description: "",
                    type: "feature",
                    priority: "medium",
                    assignedAgentId: "",
                    tags: "",
                  };
                  state.boardModalError = null;
                  state.boardActiveModal = "createTask";
                },
                onOpenEditTask: (task) => {
                  state.boardTaskDraft = {
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    type: task.type,
                    priority: task.priority,
                    assignedAgentId: task.assignedAgentId ?? "",
                    tags: task.tags.join(", "),
                  };
                  state.boardModalError = null;
                  state.boardActiveModal = "editTask";
                },
                onOpenTaskDrawer: (taskId) => {
                  state.boardSelectedTaskId = taskId;
                  void listPendingTaskReviews(state, {
                    projectId: state.boardSelectedProjectId ?? undefined,
                    limit: 200,
                  }).catch(() => undefined);
                  if (state.boardTaskAttemptsByTaskId[taskId]) {
                    return;
                  }
                  state.boardTaskAttemptsLoadingTaskId = taskId;
                  void listTaskAttempts(state, { taskId, limit: 50 })
                    .catch((err) => {
                      state.boardError = String(err);
                    })
                    .finally(() => {
                      if (state.boardTaskAttemptsLoadingTaskId === taskId) {
                        state.boardTaskAttemptsLoadingTaskId = null;
                      }
                    });
                },
                onCloseTaskDrawer: () => {
                  state.boardSelectedTaskId = null;
                },
                onUpdateProjectDraft: (patch) => {
                  state.boardProjectDraft = {
                    ...state.boardProjectDraft,
                    ...patch,
                  };
                },
                onUpdateTaskDraft: (patch) => {
                  state.boardTaskDraft = {
                    ...state.boardTaskDraft,
                    ...patch,
                  };
                },
                onSubmitProjectForm: () => {
                  const name = state.boardProjectDraft.name.trim();
                  if (!name) {
                    state.boardModalError = "Project name is required.";
                    return;
                  }
                  state.boardBusy = true;
                  state.boardModalError = null;
                  void createProject(state, {
                    name,
                    description: state.boardProjectDraft.description.trim() || undefined,
                    repoRoot: state.boardProjectDraft.repoRoot.trim() || undefined,
                  })
                    .then(async () => {
                      state.boardActiveModal = null;
                      await loadTasks(state);
                    })
                    .catch((err) => {
                      state.boardModalError = String(err);
                    })
                    .finally(() => {
                      state.boardBusy = false;
                    });
                },
                onSubmitTaskForm: () => {
                  if (!state.boardSelectedProjectId) {
                    state.boardModalError = "Select a project first.";
                    return;
                  }
                  const title = state.boardTaskDraft.title.trim();
                  if (!title) {
                    state.boardModalError = "Task title is required.";
                    return;
                  }
                  const description = state.boardTaskDraft.description.trim();
                  if (!description) {
                    state.boardModalError = "Task description is required.";
                    return;
                  }
                  const tags = state.boardTaskDraft.tags
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean);
                  state.boardBusy = true;
                  state.boardModalError = null;
                  const assignedAgentId = state.boardTaskDraft.assignedAgentId.trim();
                  const finish = () => {
                    state.boardActiveModal = null;
                    state.boardBusy = false;
                  };
                  if (state.boardTaskDraft.id) {
                    void updateTask(state, {
                      id: state.boardTaskDraft.id,
                      title,
                      description,
                      type: state.boardTaskDraft.type,
                      priority: state.boardTaskDraft.priority,
                      assignedAgentId: assignedAgentId ? assignedAgentId : null,
                      tags,
                    })
                      .then(finish)
                      .catch((err) => {
                        state.boardModalError = String(err);
                        state.boardBusy = false;
                      });
                    return;
                  }
                  void createTask(state, {
                    projectId: state.boardSelectedProjectId,
                    title,
                    description,
                    type: state.boardTaskDraft.type,
                    priority: state.boardTaskDraft.priority,
                    assignedAgentId: assignedAgentId || undefined,
                    tags,
                  })
                    .then(finish)
                    .catch((err) => {
                      state.boardModalError = String(err);
                      state.boardBusy = false;
                    });
                },
                onMoveTask: (taskId, toStatus) => {
                  void transitionTaskOptimistic(state, { id: taskId, toStatus });
                },
                onCloseModal: () => {
                  state.boardActiveModal = null;
                  state.boardConfirmAction = null;
                  state.boardModalError = null;
                },
                onConfirmModal: () => {
                  if (!state.boardConfirmAction) {
                    return;
                  }
                  const action = state.boardConfirmAction.action;
                  if (
                    action.type === "reviewDecide" &&
                    action.decision === "reject" &&
                    !action.reason.trim()
                  ) {
                    state.boardModalError = "Reject reason is required.";
                    return;
                  }
                  const key =
                    action.type === "requeueTask" ||
                    action.type === "forceFailTask" ||
                    action.type === "reviewDecide"
                      ? `${action.type}:${action.taskId}`
                      : `${action.type}:${action.agentId}`;
                  state.boardOperatorPendingKey = key;
                  state.boardModalError = null;
                  const runAction = async () => {
                    if (action.type === "pauseWorker") {
                      await pauseRuntimeAgent(state, action.agentId);
                    } else if (action.type === "resumeWorker") {
                      await resumeRuntimeAgent(state, action.agentId);
                    } else if (action.type === "restartWorker") {
                      await restartRuntimeAgent(state, action.agentId);
                    } else if (action.type === "requeueTask") {
                      await requeueTask(state, {
                        taskId: action.taskId,
                        assignedAgentId: action.assignedAgentId,
                      });
                    } else if (action.type === "forceFailTask") {
                      await forceFailActiveTask(state, {
                        taskId: action.taskId,
                        reason: "Operator forced failure from Control UI",
                        actor: "control-ui",
                      });
                    } else if (action.type === "reviewDecide") {
                      await decideTaskReview(state, {
                        taskId: action.taskId,
                        decision: action.decision,
                        actor: "control-ui",
                        reason: action.reason.trim() || undefined,
                      });
                    }
                  };
                  void runAction()
                    .then(async () => {
                      if (
                        action.type === "requeueTask" ||
                        action.type === "forceFailTask" ||
                        action.type === "reviewDecide"
                      ) {
                        if (state.boardSelectedTaskId) {
                          state.boardTaskAttemptsLoadingTaskId = state.boardSelectedTaskId;
                          try {
                            await listTaskAttempts(state, {
                              taskId: state.boardSelectedTaskId,
                              limit: 50,
                            });
                          } finally {
                            state.boardTaskAttemptsLoadingTaskId = null;
                          }
                        }
                        await listPendingTaskReviews(state, {
                          projectId: state.boardSelectedProjectId ?? undefined,
                          limit: 200,
                        }).catch(() => undefined);
                        await loadTasks(state);
                      }
                      await loadRuntimeStatus(state).catch(() => undefined);
                    })
                    .catch((err) => {
                      state.boardError = String(err);
                    })
                    .finally(() => {
                      state.boardOperatorPendingKey = null;
                      state.boardActiveModal = null;
                      state.boardConfirmAction = null;
                    });
                },
                onConfirmReasonChange: (reason) => {
                  if (
                    !state.boardConfirmAction ||
                    state.boardConfirmAction.action.type !== "reviewDecide"
                  ) {
                    return;
                  }
                  state.boardConfirmAction = {
                    ...state.boardConfirmAction,
                    action: {
                      ...state.boardConfirmAction.action,
                      reason,
                    },
                  };
                  state.boardModalError = null;
                },
                onRequestPauseAgent: (agentId) => {
                  state.boardActiveModal = "confirmAction";
                  state.boardConfirmAction = {
                    title: "Pause Worker",
                    message: `Pause worker ${agentId}? The agent will stop claiming new tasks.`,
                    confirmLabel: "Pause Worker",
                    tone: "primary",
                    action: { type: "pauseWorker", agentId },
                  };
                },
                onRequestResumeAgent: (agentId) => {
                  state.boardActiveModal = "confirmAction";
                  state.boardConfirmAction = {
                    title: "Resume Worker",
                    message: `Resume worker ${agentId}?`,
                    confirmLabel: "Resume Worker",
                    tone: "primary",
                    action: { type: "resumeWorker", agentId },
                  };
                },
                onRequestRestartAgent: (agentId) => {
                  state.boardActiveModal = "confirmAction";
                  state.boardConfirmAction = {
                    title: "Restart Worker",
                    message: `Restart worker ${agentId}? Current in-flight execution may be interrupted.`,
                    confirmLabel: "Restart Worker",
                    tone: "danger",
                    action: { type: "restartWorker", agentId },
                  };
                },
                onRequestRequeueTask: (task) => {
                  state.boardActiveModal = "confirmAction";
                  state.boardConfirmAction = {
                    title: "Requeue Task",
                    message: `Requeue task "${task.title}" back to assigned/backlog?`,
                    confirmLabel: "Requeue Task",
                    tone: "primary",
                    action: {
                      type: "requeueTask",
                      taskId: task.id,
                      assignedAgentId: task.assignedAgentId,
                    },
                  };
                },
                onRequestForceFailTask: (task) => {
                  state.boardActiveModal = "confirmAction";
                  state.boardConfirmAction = {
                    title: "Force Fail Active Task",
                    message: `Force-fail active attempt for "${task.title}"?`,
                    confirmLabel: "Force Fail",
                    tone: "danger",
                    action: {
                      type: "forceFailTask",
                      taskId: task.id,
                    },
                  };
                },
                onRequestDecomposeTask: (task) => {
                  state.boardOperatorPendingKey = `decompose:${task.id}`;
                  state.boardModalError = null;
                  void decomposeTask(state, {
                    taskId: task.id,
                    requestedBy: "control-ui",
                  })
                    .then(async () => {
                      await loadTasks(state);
                    })
                    .catch((err) => {
                      state.boardError = String(err);
                    })
                    .finally(() => {
                      state.boardOperatorPendingKey = null;
                    });
                },
                onRequestApproveParentTask: (task) => {
                  state.boardActiveModal = "confirmAction";
                  state.boardModalError = null;
                  state.boardConfirmAction = {
                    title: "Approve Parent Task",
                    message: `Approve parent task "${task.title}"?`,
                    confirmLabel: "Approve",
                    tone: "primary",
                    action: {
                      type: "reviewDecide",
                      taskId: task.id,
                      decision: "approve",
                      reason: "Approved from Control UI",
                    },
                  };
                },
                onRequestRejectParentTask: (task) => {
                  state.boardActiveModal = "confirmAction";
                  state.boardModalError = null;
                  state.boardConfirmAction = {
                    title: "Reject Parent Task",
                    message: `Reject parent task "${task.title}" and block it?`,
                    confirmLabel: "Reject",
                    tone: "danger",
                    action: {
                      type: "reviewDecide",
                      taskId: task.id,
                      decision: "reject",
                      reason: "",
                    },
                  };
                },
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                basePath: state.basePath,
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta
                      .map((entry) => entry.id)
                      .filter((id) => SUPPORTED_CRON_CHANNELS.has(id))
                  : (state.channelsSnapshot?.channelOrder ?? []).filter((id) =>
                      SUPPORTED_CRON_CHANNELS.has(id),
                    ),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch) =>
                  (state.cronForm = normalizeCronFormState({ ...state.cronForm, ...patch })),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => loadCronRuns(state, jobId),
              })
            : nothing
        }

        ${
          state.tab === "agents"
            ? renderAgents({
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                runtimeStatus: state.boardRuntimeStatus,
                teamsList: state.teamsList,
                teamsLoading: state.teamsLoading,
                selectedAgentId: resolvedAgentId,
                activePanel: state.agentsPanel,
                configForm: configValue,
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                channelsLoading: state.channelsLoading,
                channelsError: state.channelsError,
                channelsSnapshot: state.channelsSnapshot,
                channelsLastSuccess: state.channelsLastSuccess,
                cronLoading: state.cronLoading,
                cronStatus: state.cronStatus,
                cronJobs: state.cronJobs,
                cronError: state.cronError,
                agentFilesLoading: state.agentFilesLoading,
                agentFilesError: state.agentFilesError,
                agentFilesList: state.agentFilesList,
                agentFileActive: state.agentFileActive,
                agentFileContents: state.agentFileContents,
                agentFileDrafts: state.agentFileDrafts,
                agentFileSaving: state.agentFileSaving,
                agentIdentityLoading: state.agentIdentityLoading,
                agentIdentityError: state.agentIdentityError,
                agentIdentityById: state.agentIdentityById,
                agentSkillsLoading: state.agentSkillsLoading,
                agentSkillsReport: state.agentSkillsReport,
                agentSkillsError: state.agentSkillsError,
                agentSkillsAgentId: state.agentSkillsAgentId,
                skillsFilter: state.skillsFilter,
                onRefresh: async () => {
                  await Promise.all([loadAgents(state), loadTeams(state)]);
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                },
                onSelectAgent: (agentId) => {
                  if (state.agentsSelectedId === agentId) {
                    return;
                  }
                  state.agentsSelectedId = agentId;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  void loadAgentIdentity(state, agentId);
                  if (state.agentsPanel === "files") {
                    void loadAgentFiles(state, agentId);
                  }
                  if (state.agentsPanel === "skills") {
                    void loadAgentSkills(state, agentId);
                  }
                },
                onSelectPanel: (panel) => {
                  state.agentsPanel = panel;
                  if (panel === "files" && resolvedAgentId) {
                    if (state.agentFilesList?.agentId !== resolvedAgentId) {
                      state.agentFilesList = null;
                      state.agentFilesError = null;
                      state.agentFileActive = null;
                      state.agentFileContents = {};
                      state.agentFileDrafts = {};
                      void loadAgentFiles(state, resolvedAgentId);
                    }
                  }
                  if (panel === "skills") {
                    if (resolvedAgentId) {
                      void loadAgentSkills(state, resolvedAgentId);
                    }
                  }
                  if (panel === "channels") {
                    void loadChannels(state, false);
                  }
                  if (panel === "cron") {
                    void state.loadCron();
                  }
                },
                onLoadFiles: (agentId) => loadAgentFiles(state, agentId),
                onSelectFile: (name) => {
                  state.agentFileActive = name;
                  if (!resolvedAgentId) {
                    return;
                  }
                  void loadAgentFileContent(state, resolvedAgentId, name);
                },
                onFileDraftChange: (name, content) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name) => {
                  const base = state.agentFileContents[name] ?? "";
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: base };
                },
                onFileSave: (name) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  const content =
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "";
                  void saveAgentFile(state, resolvedAgentId, name, content);
                },
                onToolsProfileChange: (agentId, profile, clearAllow) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (profile) {
                    updateConfigFormValue(state, [...basePath, "profile"], profile);
                  } else {
                    removeConfigFormValue(state, [...basePath, "profile"]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state, [...basePath, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId, alsoAllow, deny) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (alsoAllow.length > 0) {
                    updateConfigFormValue(state, [...basePath, "alsoAllow"], alsoAllow);
                  } else {
                    removeConfigFormValue(state, [...basePath, "alsoAllow"]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(state, [...basePath, "deny"], deny);
                  } else {
                    removeConfigFormValue(state, [...basePath, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state),
                onConfigSave: () => saveConfig(state),
                onChannelsRefresh: () => loadChannels(state, false),
                onCronRefresh: () => state.loadCron(),
                onSkillsFilterChange: (next) => (state.skillsFilter = next),
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId, skillName, enabled) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const entry = list[index] as { skills?: unknown };
                  const normalizedSkill = skillName.trim();
                  if (!normalizedSkill) {
                    return;
                  }
                  const allSkills =
                    state.agentSkillsReport?.skills?.map((skill) => skill.name).filter(Boolean) ??
                    [];
                  const existing = Array.isArray(entry.skills)
                    ? entry.skills.map((name) => String(name).trim()).filter(Boolean)
                    : undefined;
                  const base = existing ?? allSkills;
                  const next = new Set(base);
                  if (enabled) {
                    next.add(normalizedSkill);
                  } else {
                    next.delete(normalizedSkill);
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], [...next]);
                },
                onAgentSkillsClear: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  removeConfigFormValue(state, ["agents", "list", index, "skills"]);
                },
                onAgentSkillsDisableAll: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], []);
                },
                onModelChange: (agentId, modelId) => {
                  if (!configValue) {
                    return;
                  }
                  const defaultAgentId = state.agentsList?.defaultId ?? null;
                  if (defaultAgentId && agentId === defaultAgentId) {
                    const defaultsModel = (
                      configValue as { agents?: { defaults?: { model?: unknown } } }
                    ).agents?.defaults?.model;
                    const existingFallbacks =
                      defaultsModel &&
                      typeof defaultsModel === "object" &&
                      !Array.isArray(defaultsModel)
                        ? (defaultsModel as { fallbacks?: unknown }).fallbacks
                        : null;
                    const normalizedFallbacks = Array.isArray(existingFallbacks)
                      ? existingFallbacks.filter(
                          (entry): entry is string =>
                            typeof entry === "string" && entry.trim().length > 0,
                        )
                      : [];
                    if (!modelId) {
                      if (normalizedFallbacks.length > 0) {
                        updateConfigFormValue(state, ["agents", "defaults", "model"], {
                          fallbacks: normalizedFallbacks,
                        });
                      } else {
                        removeConfigFormValue(state, ["agents", "defaults", "model"]);
                      }
                      return;
                    }
                    if (normalizedFallbacks.length > 0) {
                      updateConfigFormValue(state, ["agents", "defaults", "model"], {
                        primary: modelId,
                        fallbacks: normalizedFallbacks,
                      });
                    } else {
                      updateConfigFormValue(state, ["agents", "defaults", "model"], {
                        primary: modelId,
                      });
                    }
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state, basePath);
                    return;
                  }
                  const entry = list[index] as { model?: unknown };
                  const existing = entry?.model;
                  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                    const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                    const next = {
                      primary: modelId,
                      ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                    };
                    updateConfigFormValue(state, basePath, next);
                  } else {
                    updateConfigFormValue(state, basePath, modelId);
                  }
                },
                onModelFallbacksChange: (agentId, fallbacks) => {
                  if (!configValue) {
                    return;
                  }
                  const defaultAgentId = state.agentsList?.defaultId ?? null;
                  if (defaultAgentId && agentId === defaultAgentId) {
                    const basePath = ["agents", "defaults", "model"];
                    const defaultsModel = (
                      configValue as { agents?: { defaults?: { model?: unknown } } }
                    ).agents?.defaults?.model;
                    const normalized = fallbacks.map((name) => name.trim()).filter(Boolean);
                    const resolvePrimary = () => {
                      if (typeof defaultsModel === "string") {
                        return defaultsModel.trim() || null;
                      }
                      if (
                        defaultsModel &&
                        typeof defaultsModel === "object" &&
                        !Array.isArray(defaultsModel)
                      ) {
                        const primary = (defaultsModel as { primary?: unknown }).primary;
                        if (typeof primary === "string") {
                          const trimmed = primary.trim();
                          return trimmed || null;
                        }
                      }
                      return null;
                    };
                    const primary = resolvePrimary();
                    if (normalized.length === 0) {
                      if (primary) {
                        updateConfigFormValue(state, basePath, { primary });
                      } else {
                        removeConfigFormValue(state, basePath);
                      }
                      return;
                    }
                    const next = primary
                      ? { primary, fallbacks: normalized }
                      : { fallbacks: normalized };
                    updateConfigFormValue(state, basePath, next);
                    return;
                  }
                  const list = (configValue as { agents?: { list?: unknown[] } }).agents?.list;
                  if (!Array.isArray(list)) {
                    return;
                  }
                  const index = list.findIndex(
                    (entry) =>
                      entry &&
                      typeof entry === "object" &&
                      "id" in entry &&
                      (entry as { id?: string }).id === agentId,
                  );
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "model"];
                  const entry = list[index] as { model?: unknown };
                  const normalized = fallbacks.map((name) => name.trim()).filter(Boolean);
                  const existing = entry.model;
                  const resolvePrimary = () => {
                    if (typeof existing === "string") {
                      return existing.trim() || null;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const primary = (existing as { primary?: unknown }).primary;
                      if (typeof primary === "string") {
                        const trimmed = primary.trim();
                        return trimmed || null;
                      }
                    }
                    return null;
                  };
                  const primary = resolvePrimary();
                  if (normalized.length === 0) {
                    if (primary) {
                      updateConfigFormValue(state, basePath, primary);
                    } else {
                      removeConfigFormValue(state, basePath);
                    }
                    return;
                  }
                  const next = primary
                    ? { primary, fallbacks: normalized }
                    : { fallbacks: normalized };
                  updateConfigFormValue(state, basePath, next);
                },
              })
            : nothing
        }

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                onFilterChange: (next) => (state.skillsFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
              })
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "chat"
            ? renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.chatAttachments = [];
                  state.chatStream = null;
                  state.chatStreamStartedAt = null;
                  state.chatRunId = null;
                  state.chatQueue = [];
                  state.resetToolStream();
                  state.resetChatScroll();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                  void loadChatHistory(state);
                  void refreshChatAvatar(state);
                },
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                loading: state.chatLoading,
                sending: state.chatSending,
                compactionStatus: state.compactionStatus,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: state.chatStreamStartedAt,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: chatFocus,
                onRefresh: () => {
                  state.resetToolStream();
                  return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
                },
                onToggleFocusMode: () => {
                  if (state.onboarding) {
                    return;
                  }
                  state.applySettings({
                    ...state.settings,
                    chatFocusMode: !state.settings.chatFocusMode,
                  });
                },
                onChatScroll: (event) => state.handleChatScroll(event),
                onDraftChange: (next) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => state.handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void state.handleAbortChat(),
                onQueueRemove: (id) => state.removeQueuedMessage(id),
                onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
                showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
                onScrollToBottom: () => state.scrollToBottom(),
                // Sidebar props for tool output viewing
                sidebarOpen: state.sidebarOpen,
                sidebarContent: state.sidebarContent,
                sidebarError: state.sidebarError,
                splitRatio: state.splitRatio,
                onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                onCloseSidebar: () => state.handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: state.configSearchQuery,
                activeSection: state.configActiveSection,
                activeSubsection: state.configActiveSubsection,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                onSearchChange: (query) => (state.configSearchQuery = query),
                onSectionChange: (section) => {
                  state.configActiveSection = section;
                  state.configActiveSubsection = null;
                },
                onSubsectionChange: (section) => (state.configActiveSubsection = section),
                onReload: () => loadConfig(state),
                onSave: () => saveConfig(state),
                onApply: () => applyConfig(state),
                onUpdate: () => runUpdate(state),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onScroll: (event) => state.handleLogsScroll(event),
              })
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
