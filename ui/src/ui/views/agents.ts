import { html, nothing } from "lit";
import type {
  AgentIdentityResult,
  AgentsFilesListResult,
  AgentsListResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  SkillStatusReport,
  TaskRuntimeStatusDto,
  TaskRuntimeWorkerDto,
  TeamsListResult,
} from "../types.ts";
import {
  renderAgentFiles,
  renderAgentChannels,
  renderAgentCron,
} from "./agents-panels-status-files.ts";
import { renderAgentTools, renderAgentSkills } from "./agents-panels-tools-skills.ts";
import {
  agentBadgeText,
  buildAgentContext,
  buildModelOptions,
  normalizeAgentLabel,
  normalizeModelValue,
  parseFallbackList,
  resolveAgentConfig,
  resolveAgentEmoji,
  resolveModelFallbacks,
  resolveModelLabel,
  resolveModelPrimary,
} from "./agents-utils.ts";

export type AgentsPanel = "overview" | "files" | "tools" | "skills" | "channels" | "cron";

export type AgentsProps = {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  runtimeStatus: TaskRuntimeStatusDto | null;
  teamsList: TeamsListResult | null;
  teamsLoading: boolean;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsLastSuccess: number | null;
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronError: string | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentsPanel) => void;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  onChannelsRefresh: () => void;
  onCronRefresh: () => void;
  onSkillsFilterChange: (next: string) => void;
  onSkillsRefresh: () => void;
  onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear: (agentId: string) => void;
  onAgentSkillsDisableAll: (agentId: string) => void;
};

export type AgentContext = {
  workspace: string;
  model: string;
  identityName: string;
  identityEmoji: string;
  skillsLabel: string;
  isDefault: boolean;
};

// ── Health helpers ────────────────────────────────────────────────────────────

type WorkerState = TaskRuntimeWorkerDto["state"];

function workerStateColor(state: WorkerState): string {
  switch (state) {
    case "running":
    case "claiming":
      return "var(--ok)";
    case "idle":
      return "var(--accent-2)";
    case "recovering":
      return "var(--warn)";
    case "paused":
      return "var(--muted)";
    case "unhealthy":
      return "var(--danger)";
    default:
      return "var(--muted)";
  }
}

function workerStateLabel(state: WorkerState): string {
  switch (state) {
    case "running":
      return "running";
    case "claiming":
      return "claiming";
    case "idle":
      return "idle";
    case "recovering":
      return "recovering";
    case "paused":
      return "paused";
    case "unhealthy":
      return "unhealthy";
    default:
      return state;
  }
}

function formatHeartbeat(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  const age = Date.now() - ms;
  if (age < 5_000) {
    return "just now";
  }
  if (age < 60_000) {
    return `${Math.floor(age / 1000)}s ago`;
  }
  if (age < 3_600_000) {
    return `${Math.floor(age / 60_000)}m ago`;
  }
  return `${Math.floor(age / 3_600_000)}h ago`;
}

function heartbeatColor(ms: number | null): string {
  if (ms === null) {
    return "var(--muted)";
  }
  const age = Date.now() - ms;
  if (age < 30_000) {
    return "var(--ok)";
  }
  if (age < 90_000) {
    return "var(--warn)";
  }
  return "var(--danger)";
}

// ── Role badge ────────────────────────────────────────────────────────────────

function renderRoleBadge(role: "lead" | "member" | "solo") {
  if (role === "lead") {
    return html`
      <span class="agents-role-badge agents-role-lead">lead</span>
    `;
  }
  if (role === "member") {
    return html`
      <span class="agents-role-badge agents-role-member">member</span>
    `;
  }
  return html`
    <span class="agents-role-badge agents-role-solo">solo</span>
  `;
}

// ── Health dot ────────────────────────────────────────────────────────────────

function renderHealthDot(state: WorkerState | null) {
  const color = state ? workerStateColor(state) : "var(--border-strong)";
  const isRunning = state === "running" || state === "claiming";
  return html`
    <span
      class="agents-health-dot ${isRunning ? "agents-health-dot--pulse" : ""}"
      style="background:${color}; box-shadow: 0 0 6px ${color}40;"
      title="${state ?? "offline"}"
    ></span>
  `;
}

// ── Agent card (in team roster) ───────────────────────────────────────────────

function renderTeamAgentCard(params: {
  agentId: string;
  role: "lead" | "member" | "solo";
  worker: TaskRuntimeWorkerDto | null;
  agent: AgentsListResult["agents"][number] | null;
  agentIdentity: AgentIdentityResult | null;
  defaultId: string | null;
  currentTask: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    agentId,
    role,
    worker,
    agent,
    agentIdentity,
    defaultId,
    currentTask,
    isSelected,
    onSelect,
  } = params;
  const state = worker?.state ?? null;
  const hbColor = heartbeatColor(worker?.lastHeartbeatAtMs ?? null);
  const hbLabel = formatHeartbeat(worker?.lastHeartbeatAtMs ?? null);
  const displayName = agent ? normalizeAgentLabel(agent) : agentId;
  const emoji = agent ? resolveAgentEmoji(agent, agentIdentity) : null;
  const isDefault = Boolean(defaultId && agentId === defaultId);

  return html`
    <button
      type="button"
      class="agents-agent-card ${isSelected ? "agents-agent-card--selected" : ""}"
      @click=${onSelect}
    >
      <div class="agents-agent-card-top">
        <div class="agents-agent-avatar">
          ${emoji || displayName.slice(0, 1).toUpperCase()}
        </div>
        <div class="agents-agent-info">
          <div class="agents-agent-name">
            ${displayName}
            ${
              isDefault
                ? html`
                    <span class="agents-default-badge">default</span>
                  `
                : nothing
            }
          </div>
          <div class="agents-agent-id mono">${agentId}</div>
        </div>
        <div class="agents-agent-status-col">
          ${renderHealthDot(state)}
          ${renderRoleBadge(role)}
        </div>
      </div>
      ${
        state !== null
          ? html`
          <div class="agents-agent-card-bottom">
            <span class="agents-state-label" style="color:${workerStateColor(state)}"
              >${workerStateLabel(state)}</span
            >
            ${
              currentTask
                ? html`<span class="agents-task-ref mono">#${currentTask.slice(0, 8)}</span>`
                : nothing
            }
            <span style="color:${hbColor}; font-size: 11px; margin-left: auto;">${hbLabel}</span>
          </div>
          ${
            worker?.lastError
              ? html`<div class="agents-agent-error">${worker.lastError}</div>`
              : nothing
          }
        `
          : nothing
      }
    </button>
  `;
}

// ── Team section card ─────────────────────────────────────────────────────────

function renderTeamSection(params: {
  teamId: string;
  teamName: string;
  leadAgentId: string | null;
  members: Array<{ agentId: string; role: "lead" | "member" }>;
  workers: TaskRuntimeWorkerDto[];
  agents: AgentsListResult["agents"];
  agentIdentityById: Record<string, AgentIdentityResult>;
  defaultId: string | null;
  selectedAgentId: string | null;
  tasks: Map<string, string>;
  onSelect: (agentId: string) => void;
}) {
  const {
    teamName,
    leadAgentId,
    members,
    workers,
    agents,
    agentIdentityById,
    defaultId,
    selectedAgentId,
    tasks,
    onSelect,
  } = params;
  const workerMap = new Map(workers.map((w) => [w.agentId, w]));
  const runningCount = members.filter((m) => {
    const w = workerMap.get(m.agentId);
    return w?.state === "running" || w?.state === "claiming";
  }).length;

  return html`
    <div class="agents-team-section">
      <div class="agents-team-header">
        <div class="agents-team-name">${teamName}</div>
        <div class="agents-team-meta">
          ${
            leadAgentId
              ? html`<span class="muted" style="font-size:12px;"
                >lead: <span class="mono">${leadAgentId}</span></span
              >`
              : nothing
          }
          ${
            runningCount > 0
              ? html`<span class="chip chip-ok" style="font-size:11px; padding: 3px 10px;"
                >${runningCount} active</span
              >`
              : nothing
          }
        </div>
      </div>
      <div class="agents-team-roster">
        ${members.map(({ agentId, role }) => {
          const worker = workerMap.get(agentId) ?? null;
          const agent = agents.find((a) => a.id === agentId) ?? null;
          const identity = agentIdentityById[agentId] ?? null;
          const currentTask = tasks.get(agentId) ?? null;
          return renderTeamAgentCard({
            agentId,
            role,
            worker,
            agent,
            agentIdentity: identity,
            defaultId,
            currentTask,
            isSelected: selectedAgentId === agentId,
            onSelect: () => onSelect(agentId),
          });
        })}
      </div>
    </div>
  `;
}

// ── Unassigned agents section ─────────────────────────────────────────────────

function renderUnassignedSection(params: {
  agentIds: string[];
  workers: TaskRuntimeWorkerDto[];
  agents: AgentsListResult["agents"];
  agentIdentityById: Record<string, AgentIdentityResult>;
  defaultId: string | null;
  selectedAgentId: string | null;
  tasks: Map<string, string>;
  onSelect: (agentId: string) => void;
}) {
  if (params.agentIds.length === 0) {
    return nothing;
  }
  const {
    agentIds,
    workers,
    agents,
    agentIdentityById,
    defaultId,
    selectedAgentId,
    tasks,
    onSelect,
  } = params;
  const workerMap = new Map(workers.map((w) => [w.agentId, w]));

  return html`
    <div class="agents-team-section agents-team-section--solo">
      <div class="agents-team-header">
        <div class="agents-team-name" style="color: var(--muted);">Unassigned</div>
      </div>
      <div class="agents-team-roster">
        ${agentIds.map((agentId) => {
          const worker = workerMap.get(agentId) ?? null;
          const agent = agents.find((a) => a.id === agentId) ?? null;
          const identity = agentIdentityById[agentId] ?? null;
          const currentTask = tasks.get(agentId) ?? null;
          return renderTeamAgentCard({
            agentId,
            role: "solo",
            worker,
            agent,
            agentIdentity: identity,
            defaultId,
            currentTask,
            isSelected: selectedAgentId === agentId,
            onSelect: () => onSelect(agentId),
          });
        })}
      </div>
    </div>
  `;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderAgents(props: AgentsProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  const selectedId = props.selectedAgentId ?? defaultId ?? agents[0]?.id ?? null;
  const selectedAgent = selectedId ? (agents.find((a) => a.id === selectedId) ?? null) : null;
  const workers = props.runtimeStatus?.workers ?? [];
  const runtimeTeams = props.runtimeStatus?.teams ?? [];
  const teamsFromList = props.teamsList?.teams ?? [];

  // Build currentTask map: agentId → taskId
  const currentTaskMap = new Map<string, string>();
  for (const w of workers) {
    if (w.currentTaskId) {
      currentTaskMap.set(w.agentId, w.currentTaskId);
    }
  }

  // Build team membership: prefer teams.list (has role info) but fall back to runtime teams
  type TeamEntry = {
    teamId: string;
    teamName: string;
    leadAgentId: string | null;
    members: Array<{ agentId: string; role: "lead" | "member" }>;
  };
  const teamEntries: TeamEntry[] = [];
  const assignedAgentIds = new Set<string>();

  if (teamsFromList.length > 0) {
    // teamsFromList doesn't carry members — cross-reference with runtimeTeams for member lists
    for (const team of teamsFromList) {
      if (team.archivedAtMs !== null) {
        continue;
      }
      const runtimeTeam = runtimeTeams.find((rt) => rt.teamId === team.id);
      const memberIds = runtimeTeam?.memberAgentIds ?? (team.leadAgentId ? [team.leadAgentId] : []);
      const members: Array<{ agentId: string; role: "lead" | "member" }> = memberIds.map((id) => ({
        agentId: id,
        role: id === team.leadAgentId ? "lead" : "member",
      }));
      // Deduplicate
      const seen = new Set<string>();
      const dedupedMembers = members.filter((m) => {
        if (seen.has(m.agentId)) {
          return false;
        }
        seen.add(m.agentId);
        return true;
      });
      if (dedupedMembers.length > 0) {
        teamEntries.push({
          teamId: team.id,
          teamName: team.name,
          leadAgentId: team.leadAgentId,
          members: dedupedMembers,
        });
        for (const m of dedupedMembers) {
          assignedAgentIds.add(m.agentId);
        }
      }
    }
  } else if (runtimeTeams.length > 0) {
    // Fall back to runtime teams (no extra role info; treat leadAgentId as lead, rest as member)
    for (const rt of runtimeTeams) {
      const members: Array<{ agentId: string; role: "lead" | "member" }> = rt.memberAgentIds.map(
        (id) => ({
          agentId: id,
          role: id === rt.leadAgentId ? "lead" : "member",
        }),
      );
      teamEntries.push({
        teamId: rt.teamId,
        teamName: rt.teamName,
        leadAgentId: rt.leadAgentId,
        members,
      });
      for (const m of members) {
        assignedAgentIds.add(m.agentId);
      }
    }
  }

  // Unassigned = all agents not in any team
  const unassignedAgentIds = agents.map((a) => a.id).filter((id) => !assignedAgentIds.has(id));

  const totalAgents = agents.length;
  const activeWorkers = workers.filter(
    (w) => w.state === "running" || w.state === "claiming",
  ).length;
  const unhealthyWorkers = workers.filter((w) => w.state === "unhealthy").length;

  return html`
    <div class="agents-new-layout">

      <!-- ── Header bar ── -->
      <div class="agents-page-header">
        <div>
          <div class="card-title">Agents</div>
          <div class="card-sub">
            ${totalAgents} configured · ${teamEntries.length} team${teamEntries.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div class="agents-header-stats">
          ${
            activeWorkers > 0
              ? html`
              <div class="agents-stat-chip agents-stat-chip--ok">
                <span class="agents-stat-dot agents-stat-dot--pulse"></span>
                ${activeWorkers} active
              </div>
            `
              : nothing
          }
          ${
            unhealthyWorkers > 0
              ? html`
              <div class="agents-stat-chip agents-stat-chip--danger">
                ${unhealthyWorkers} unhealthy
              </div>
            `
              : nothing
          }
          ${
            props.loading || props.teamsLoading
              ? html`
                  <div class="agents-stat-chip">loading…</div>
                `
              : nothing
          }
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
            Refresh
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      <!-- ── Team roster ── -->
      <div class="agents-roster">
        ${
          teamEntries.length === 0 && unassignedAgentIds.length === 0
            ? html`
                <div class="callout info">No agents configured yet.</div>
              `
            : nothing
        }

        ${teamEntries.map((entry) =>
          renderTeamSection({
            teamId: entry.teamId,
            teamName: entry.teamName,
            leadAgentId: entry.leadAgentId,
            members: entry.members,
            workers,
            agents,
            agentIdentityById: props.agentIdentityById,
            defaultId,
            selectedAgentId: selectedId,
            tasks: currentTaskMap,
            onSelect: props.onSelectAgent,
          }),
        )}

        ${renderUnassignedSection({
          agentIds: unassignedAgentIds,
          workers,
          agents,
          agentIdentityById: props.agentIdentityById,
          defaultId,
          selectedAgentId: selectedId,
          tasks: currentTaskMap,
          onSelect: props.onSelectAgent,
        })}
      </div>

      <!-- ── Agent config panel (slides in when agent selected) ── -->
      ${
        selectedAgent
          ? html`
          <div class="agents-config-panel">
            <div class="agents-config-panel-inner">
              ${renderAgentHeader(
                selectedAgent,
                defaultId,
                props.agentIdentityById[selectedAgent.id] ?? null,
              )}
              ${renderAgentTabs(props.activePanel, (panel) => props.onSelectPanel(panel))}
              ${
                props.activePanel === "overview"
                  ? renderAgentOverview({
                      agent: selectedAgent,
                      defaultId,
                      configForm: props.configForm,
                      agentFilesList: props.agentFilesList,
                      agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                      agentIdentityError: props.agentIdentityError,
                      agentIdentityLoading: props.agentIdentityLoading,
                      configLoading: props.configLoading,
                      configSaving: props.configSaving,
                      configDirty: props.configDirty,
                      onConfigReload: props.onConfigReload,
                      onConfigSave: props.onConfigSave,
                      onModelChange: props.onModelChange,
                      onModelFallbacksChange: props.onModelFallbacksChange,
                    })
                  : nothing
              }
              ${
                props.activePanel === "files"
                  ? renderAgentFiles({
                      agentId: selectedAgent.id,
                      agentFilesList: props.agentFilesList,
                      agentFilesLoading: props.agentFilesLoading,
                      agentFilesError: props.agentFilesError,
                      agentFileActive: props.agentFileActive,
                      agentFileContents: props.agentFileContents,
                      agentFileDrafts: props.agentFileDrafts,
                      agentFileSaving: props.agentFileSaving,
                      onLoadFiles: props.onLoadFiles,
                      onSelectFile: props.onSelectFile,
                      onFileDraftChange: props.onFileDraftChange,
                      onFileReset: props.onFileReset,
                      onFileSave: props.onFileSave,
                    })
                  : nothing
              }
              ${
                props.activePanel === "tools"
                  ? renderAgentTools({
                      agentId: selectedAgent.id,
                      configForm: props.configForm,
                      configLoading: props.configLoading,
                      configSaving: props.configSaving,
                      configDirty: props.configDirty,
                      onProfileChange: props.onToolsProfileChange,
                      onOverridesChange: props.onToolsOverridesChange,
                      onConfigReload: props.onConfigReload,
                      onConfigSave: props.onConfigSave,
                    })
                  : nothing
              }
              ${
                props.activePanel === "skills"
                  ? renderAgentSkills({
                      agentId: selectedAgent.id,
                      report: props.agentSkillsReport,
                      loading: props.agentSkillsLoading,
                      error: props.agentSkillsError,
                      activeAgentId: props.agentSkillsAgentId,
                      configForm: props.configForm,
                      configLoading: props.configLoading,
                      configSaving: props.configSaving,
                      configDirty: props.configDirty,
                      filter: props.skillsFilter,
                      onFilterChange: props.onSkillsFilterChange,
                      onRefresh: props.onSkillsRefresh,
                      onToggle: props.onAgentSkillToggle,
                      onClear: props.onAgentSkillsClear,
                      onDisableAll: props.onAgentSkillsDisableAll,
                      onConfigReload: props.onConfigReload,
                      onConfigSave: props.onConfigSave,
                    })
                  : nothing
              }
              ${
                props.activePanel === "channels"
                  ? renderAgentChannels({
                      context: buildAgentContext(
                        selectedAgent,
                        props.configForm,
                        props.agentFilesList,
                        defaultId,
                        props.agentIdentityById[selectedAgent.id] ?? null,
                      ),
                      configForm: props.configForm,
                      snapshot: props.channelsSnapshot,
                      loading: props.channelsLoading,
                      error: props.channelsError,
                      lastSuccess: props.channelsLastSuccess,
                      onRefresh: props.onChannelsRefresh,
                    })
                  : nothing
              }
              ${
                props.activePanel === "cron"
                  ? renderAgentCron({
                      context: buildAgentContext(
                        selectedAgent,
                        props.configForm,
                        props.agentFilesList,
                        defaultId,
                        props.agentIdentityById[selectedAgent.id] ?? null,
                      ),
                      agentId: selectedAgent.id,
                      jobs: props.cronJobs,
                      status: props.cronStatus,
                      loading: props.cronLoading,
                      error: props.cronError,
                      onRefresh: props.onCronRefresh,
                    })
                  : nothing
              }
            </div>
          </div>
        `
          : nothing
      }
    </div>
  `;
}

// ── Agent header & tabs ───────────────────────────────────────────────────────

function renderAgentHeader(
  agent: AgentsListResult["agents"][number],
  defaultId: string | null,
  agentIdentity: AgentIdentityResult | null,
) {
  const badge = agentBadgeText(agent.id, defaultId);
  const displayName = normalizeAgentLabel(agent);
  const subtitle = agent.identity?.theme?.trim() || "Agent workspace and routing.";
  const emoji = resolveAgentEmoji(agent, agentIdentity);
  return html`
    <section class="card agent-header">
      <div class="agent-header-main">
        <div class="agent-avatar agent-avatar--lg">${emoji || displayName.slice(0, 1)}</div>
        <div>
          <div class="card-title">${displayName}</div>
          <div class="card-sub">${subtitle}</div>
        </div>
      </div>
      <div class="agent-header-meta">
        <div class="mono">${agent.id}</div>
        ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
      </div>
    </section>
  `;
}

function renderAgentTabs(active: AgentsPanel, onSelect: (panel: AgentsPanel) => void) {
  const tabs: Array<{ id: AgentsPanel; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files" },
    { id: "tools", label: "Tools" },
    { id: "skills", label: "Skills" },
    { id: "channels", label: "Channels" },
    { id: "cron", label: "Cron Jobs" },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderAgentOverview(params: {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  configForm: Record<string, unknown> | null;
  agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
}) {
  const {
    agent,
    configForm,
    agentFilesList,
    agentIdentity,
    agentIdentityLoading,
    agentIdentityError,
    configLoading,
    configSaving,
    configDirty,
    onConfigReload,
    onConfigSave,
    onModelChange,
    onModelFallbacksChange,
  } = params;
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace =
    workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const model = config.entry?.model
    ? resolveModelLabel(config.entry?.model)
    : resolveModelLabel(config.defaults?.model);
  const defaultModel = resolveModelLabel(config.defaults?.model);
  const modelPrimary =
    resolveModelPrimary(config.entry?.model) || (model !== "-" ? normalizeModelValue(model) : null);
  const defaultPrimary =
    resolveModelPrimary(config.defaults?.model) ||
    (defaultModel !== "-" ? normalizeModelValue(defaultModel) : null);
  const effectivePrimary = modelPrimary ?? defaultPrimary ?? null;
  const modelFallbacks = resolveModelFallbacks(config.entry?.model);
  const fallbackText = modelFallbacks ? modelFallbacks.join(", ") : "";
  const identityName =
    agentIdentity?.name?.trim() ||
    agent.identity?.name?.trim() ||
    agent.name?.trim() ||
    config.entry?.name ||
    "-";
  const resolvedEmoji = resolveAgentEmoji(agent, agentIdentity);
  const identityEmoji = resolvedEmoji || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  const identityStatus = agentIdentityLoading
    ? "Loading…"
    : agentIdentityError
      ? "Unavailable"
      : "";
  const isDefault = Boolean(params.defaultId && agent.id === params.defaultId);

  return html`
    <section class="card">
      <div class="card-title">Overview</div>
      <div class="card-sub">Workspace paths and identity metadata.</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">Workspace</div>
          <div class="mono">${workspace}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Primary Model</div>
          <div class="mono">${model}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Identity Name</div>
          <div>${identityName}</div>
          ${
            identityStatus ? html`<div class="agent-kv-sub muted">${identityStatus}</div>` : nothing
          }
        </div>
        <div class="agent-kv">
          <div class="label">Default</div>
          <div>${isDefault ? "yes" : "no"}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Identity Emoji</div>
          <div>${identityEmoji}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Skills Filter</div>
          <div>${skillFilter ? `${skillCount} selected` : "all skills"}</div>
        </div>
      </div>
      <div class="agent-model-select" style="margin-top: 20px;">
        <div class="label">Model Selection</div>
        <div class="row" style="gap: 12px; flex-wrap: wrap;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>Primary model${isDefault ? " (default)" : ""}</span>
            <select
              .value=${effectivePrimary ?? ""}
              ?disabled=${!configForm || configLoading || configSaving}
              @change=${(e: Event) =>
                onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}
            >
              ${
                isDefault
                  ? nothing
                  : html`<option value="">
                    ${defaultPrimary ? `Inherit default (${defaultPrimary})` : "Inherit default"}
                  </option>`
              }
              ${buildModelOptions(configForm, effectivePrimary ?? undefined)}
            </select>
          </label>
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>Fallbacks (comma-separated)</span>
            <input
              .value=${fallbackText}
              ?disabled=${!configForm || configLoading || configSaving}
              placeholder="provider/model, provider/model"
              @input=${(e: Event) =>
                onModelFallbacksChange(
                  agent.id,
                  parseFallbackList((e.target as HTMLInputElement).value),
                )}
            />
          </label>
        </div>
        <div class="row" style="justify-content: flex-end; gap: 8px;">
          <button class="btn btn--sm" ?disabled=${configLoading} @click=${onConfigReload}>
            Reload Config
          </button>
          <button
            class="btn btn--sm primary"
            ?disabled=${configSaving || !configDirty}
            @click=${onConfigSave}
          >
            ${configSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </section>
  `;
}
