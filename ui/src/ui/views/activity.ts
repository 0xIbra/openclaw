import { html, nothing } from "lit";
import type { AgentsListResult, TaskDto, TaskRuntimeStatusDto } from "../types.ts";
import { formatRelativeTimestamp } from "../format.ts";

export type ActivityProps = {
  runtimeStatus: TaskRuntimeStatusDto | null;
  runtimeLoading: boolean;
  runtimeError: string | null;
  agentsList: AgentsListResult | null;
  tasks: TaskDto[];
  onRefresh: () => void;
};

type AgentInfo = { name: string; emoji: string | null };

function agentInfo(agentId: string, agentsList: AgentsListResult | null): AgentInfo {
  const agent = agentsList?.agents?.find((a) => a.id === agentId);
  const name = agent?.identity?.name ?? agent?.name ?? agentId;
  const emoji = agent?.identity?.emoji ?? null;
  return { name, emoji };
}

function stateColor(state: string): string {
  switch (state) {
    case "processing":
    case "delegating":
    case "running":
    case "claiming":
      return "var(--color-success, #22c55e)";
    case "waiting":
    case "recovering":
      return "var(--color-warning, #eab308)";
    case "unhealthy":
      return "var(--color-danger, #ef4444)";
    case "paused":
      return "var(--color-muted, #6b7280)";
    default:
      return "var(--color-muted, #6b7280)";
  }
}

function stateDot(state: string) {
  return html`<span
    style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${stateColor(state)};margin-right:6px;flex-shrink:0"
  ></span>`;
}

export function renderActivity(props: ActivityProps) {
  const { runtimeStatus, agentsList, tasks } = props;
  const workers = runtimeStatus?.workers ?? [];
  const leads = runtimeStatus?.leads ?? [];

  const taskById = new Map<string, TaskDto>();
  for (const t of tasks) {
    taskById.set(t.id, t);
  }

  const teamNameById = new Map<string, string>();
  for (const team of runtimeStatus?.teams ?? []) {
    teamNameById.set(team.teamId, team.teamName);
  }

  const lastUpdated = runtimeStatus?.updatedAtMs
    ? formatRelativeTimestamp(runtimeStatus.updatedAtMs)
    : null;

  return html`
    <div class="activity-page">
      <div class="activity-header">
        <div>
          <div class="card-title">Agent Activity</div>
          <div class="card-sub">
            Live runtime status for all leads and workers
            ${lastUpdated ? html` · updated ${lastUpdated}` : nothing}
          </div>
        </div>
        <button class="btn btn-sm" @click=${props.onRefresh} ?disabled=${props.runtimeLoading}>
          ${props.runtimeLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      ${props.runtimeError ? html`<div class="error-banner">${props.runtimeError}</div>` : nothing}

      ${
        !runtimeStatus && !props.runtimeLoading
          ? html`
              <div class="empty-state">No runtime data yet. Click Refresh.</div>
            `
          : nothing
      }

      <!-- Leads -->
      ${
        leads.length > 0
          ? html`
            <div class="activity-section-title">Team Leads (${leads.length})</div>
            <div class="activity-cards">
              ${leads.map((lead) => {
                const info = agentInfo(lead.leadAgentId, agentsList);
                const lastPoll = lead.lastPolledAtMs
                  ? formatRelativeTimestamp(lead.lastPolledAtMs)
                  : "never";
                const isActive = lead.state === "processing" || lead.state === "delegating";
                return html`
                  <div class="activity-card ${isActive ? "activity-card--active" : ""}">
                    <div class="activity-card-header">
                      <div class="activity-agent-name">
                        ${
                          lead.lastError
                            ? html`
                                <span style="color: var(--color-danger, #ef4444)">⚠ </span>
                              `
                            : nothing
                        }
                        ${info.emoji ? html`${info.emoji} ` : nothing}
                        <strong>${info.name}</strong>
                        <span class="activity-role-badge">lead</span>
                      </div>
                      <div class="activity-state">
                        ${stateDot(lead.state)}
                        <span style="color:${stateColor(lead.state)}">${lead.state}</span>
                      </div>
                    </div>
                    <div class="activity-card-meta">
                      <span class="activity-team">${lead.teamName}</span>
                      <span class="activity-sep">·</span>
                      <span>last poll: ${lastPoll}</span>
                      ${
                        lead.waitingQuestionCount > 0
                          ? html`
                            <span class="activity-sep">·</span>
                            <span style="color:var(--color-warning,#eab308)"
                              >${lead.waitingQuestionCount} question${lead.waitingQuestionCount !== 1 ? "s" : ""} pending</span
                            >
                          `
                          : nothing
                      }
                    </div>
                    ${
                      lead.lastError
                        ? html`<div class="activity-error">${lead.lastError}</div>`
                        : nothing
                    }
                  </div>
                `;
              })}
            </div>
          `
          : nothing
      }

      <!-- Workers -->
      ${
        workers.length > 0
          ? html`
            <div class="activity-section-title">Workers (${workers.length})</div>
            <div class="activity-cards">
              ${workers.map((worker) => {
                const info = agentInfo(worker.agentId, agentsList);
                const currentTask = worker.currentTaskId
                  ? taskById.get(worker.currentTaskId)
                  : null;
                const lastHeartbeat = worker.lastHeartbeatAtMs
                  ? formatRelativeTimestamp(worker.lastHeartbeatAtMs)
                  : null;
                const isActive = worker.state === "running" || worker.state === "claiming";
                return html`
                  <div class="activity-card ${isActive ? "activity-card--active" : ""}">
                    <div class="activity-card-header">
                      <div class="activity-agent-name">
                        ${
                          worker.errorStreak > 0
                            ? html`
                                <span style="color: var(--color-danger, #ef4444)">⚠ </span>
                              `
                            : nothing
                        }
                        ${info.emoji ? html`${info.emoji} ` : nothing}
                        <strong>${info.name}</strong>
                        <span class="activity-role-badge">worker</span>
                      </div>
                      <div class="activity-state">
                        ${stateDot(worker.state)}
                        <span style="color:${stateColor(worker.state)}">${worker.state}</span>
                      </div>
                    </div>
                    ${
                      worker.teamIds.length > 0
                        ? html`<div class="activity-card-meta">
                          Teams: ${worker.teamIds.map((id) => teamNameById.get(id) ?? id).join(", ")}
                        </div>`
                        : nothing
                    }
                    ${
                      currentTask
                        ? html`
                          <div class="activity-current-task">
                            <span class="activity-task-label">Working on:</span>
                            <span class="activity-task-title">${currentTask.title}</span>
                            <span class="activity-task-status">[${currentTask.status}]</span>
                          </div>
                        `
                        : worker.state === "idle"
                          ? html`
                              <div class="activity-card-meta" style="color: var(--color-muted)">No active task</div>
                            `
                          : nothing
                    }
                    ${
                      worker.lastError && worker.errorStreak > 0
                        ? html`<div class="activity-error">
                          ${
                            worker.errorStreak > 1 ? html`(×${worker.errorStreak}) ` : nothing
                          }${worker.lastError}
                        </div>`
                        : nothing
                    }
                    ${
                      lastHeartbeat
                        ? html`<div class="activity-card-meta" style="margin-top:4px">heartbeat: ${lastHeartbeat}</div>`
                        : nothing
                    }
                  </div>
                `;
              })}
            </div>
          `
          : nothing
      }

      ${
        leads.length === 0 && workers.length === 0 && runtimeStatus
          ? html`
              <div class="empty-state">No leads or workers running.</div>
            `
          : nothing
      }
    </div>

    <style>
      .activity-page {
        padding: 20px;
        max-width: 900px;
      }
      .activity-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 20px;
        gap: 12px;
      }
      .activity-section-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-muted, #6b7280);
        margin: 20px 0 10px;
      }
      .activity-cards {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .activity-card {
        background: var(--color-card-bg, rgba(255,255,255,0.04));
        border: 1px solid var(--color-border, rgba(255,255,255,0.08));
        border-radius: 8px;
        padding: 12px 16px;
        transition: border-color 0.2s;
      }
      .activity-card--active {
        border-color: rgba(34,197,94,0.35);
        background: rgba(34,197,94,0.04);
      }
      .activity-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
      }
      .activity-agent-name {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 14px;
      }
      .activity-role-badge {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 1px 6px;
        border-radius: 10px;
        background: rgba(255,255,255,0.08);
        color: var(--color-muted, #9ca3af);
        margin-left: 4px;
      }
      .activity-state {
        display: flex;
        align-items: center;
        font-size: 12px;
        font-weight: 500;
        flex-shrink: 0;
      }
      .activity-card-meta {
        font-size: 12px;
        color: var(--color-muted, #9ca3af);
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
      }
      .activity-team {
        font-weight: 500;
        color: var(--color-text, #e5e7eb);
      }
      .activity-sep {
        color: var(--color-muted, #6b7280);
      }
      .activity-current-task {
        margin-top: 6px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .activity-task-label {
        color: var(--color-muted, #9ca3af);
        font-size: 12px;
      }
      .activity-task-title {
        font-weight: 500;
      }
      .activity-task-status {
        font-size: 11px;
        color: var(--color-muted, #9ca3af);
      }
      .activity-error {
        margin-top: 6px;
        font-size: 12px;
        color: var(--color-danger, #ef4444);
        background: rgba(239,68,68,0.08);
        border-radius: 4px;
        padding: 4px 8px;
        word-break: break-word;
      }
      .error-banner {
        background: rgba(239,68,68,0.1);
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 6px;
        padding: 10px 14px;
        font-size: 13px;
        color: var(--color-danger, #ef4444);
        margin-bottom: 16px;
      }
      .empty-state {
        color: var(--color-muted, #9ca3af);
        font-size: 14px;
        padding: 32px 0;
        text-align: center;
      }
    </style>
  `;
}
