import { html, nothing } from "lit";
import type {
  AgentsListResult,
  SessionsPreviewEntry,
  TaskAttemptDto,
  TaskDto,
  TaskRuntimeStatusDto,
} from "../types.ts";
import { formatRelativeTimestamp } from "../format.ts";

export type ActivityProps = {
  runtimeStatus: TaskRuntimeStatusDto | null;
  runtimeLoading: boolean;
  runtimeError: string | null;
  agentsList: AgentsListResult | null;
  tasks: TaskDto[];
  attemptsByTaskId: Record<string, TaskAttemptDto[]>;
  sessionPreviews: Record<string, SessionsPreviewEntry>;
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
  const isAnimating =
    state === "processing" || state === "delegating" || state === "running" || state === "claiming";
  return html`<span
    class="${isAnimating ? "state-dot state-dot--pulse" : "state-dot"}"
    style="background:${stateColor(state)}"
  ></span>`;
}

function durationMs(startMs: number): string {
  const s = Math.floor((Date.now() - startMs) / 1000);
  if (s < 60) {
    return `${s}s`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function renderSessionTranscript(items: SessionsPreviewEntry["items"]) {
  // Only show assistant and tool messages — the interesting output
  const visible = items.filter((i) => i.role === "assistant" || i.role === "tool");
  if (visible.length === 0) {
    return nothing;
  }

  return html`
    <div class="session-transcript">
      <div class="session-transcript-label">Live session</div>
      <div class="session-messages">
        ${visible.map((item) => {
          const isTool = item.role === "tool";
          return html`
            <div class="session-msg ${isTool ? "session-msg--tool" : "session-msg--assistant"}">
              <span class="session-msg-role">${isTool ? "🔧" : "💬"}</span>
              <span class="session-msg-text">${item.text}</span>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

function renderAttemptDetail(attempt: TaskAttemptDto | null) {
  if (!attempt) {
    return nothing;
  }
  const running = attempt.endedAtMs == null;
  const duration = running
    ? durationMs(attempt.startedAtMs)
    : attempt.endedAtMs
      ? `${Math.round((attempt.endedAtMs - attempt.startedAtMs) / 1000)}s`
      : null;

  const changedFiles = attempt.changedFiles ?? [];
  const hasSummary = attempt.summary && attempt.summary.trim().length > 0;
  const hasError = attempt.errorText && attempt.errorText.trim().length > 0;
  const hasTestOutcome = attempt.testOutcome && Object.keys(attempt.testOutcome).length > 0;
  const hasCmdOutcome = attempt.commandOutcome && Object.keys(attempt.commandOutcome).length > 0;

  return html`
    <div class="attempt-detail">
      <div class="attempt-header">
        <span class="attempt-badge">attempt #${attempt.attemptNumber ?? 1}</span>
        ${duration ? html`<span class="attempt-duration">${duration}${running ? " ⏱" : ""}</span>` : nothing}
        <span class="attempt-status attempt-status--${attempt.status}">${attempt.status}</span>
      </div>
      ${hasSummary ? html`<div class="attempt-summary">${attempt.summary}</div>` : nothing}
      ${hasError ? html`<div class="attempt-error">${attempt.errorText}</div>` : nothing}
      ${
        hasCmdOutcome
          ? html`<div class="attempt-outcomes">
              ${Object.entries(attempt.commandOutcome).map(
                ([k, v]) =>
                  html`<span class="outcome-chip outcome-chip--${v === true ? "pass" : v === false ? "fail" : "neutral"}"
                    >${k}: ${v === true ? "✓" : v === false ? "✗" : String(v)}</span
                  >`,
              )}
            </div>`
          : nothing
      }
      ${
        hasTestOutcome
          ? html`<div class="attempt-outcomes">
              ${Object.entries(attempt.testOutcome).map(
                ([k, v]) =>
                  html`<span class="outcome-chip outcome-chip--${k.toLowerCase().includes("pass") && v ? "pass" : "neutral"}"
                    >${k}: ${String(v)}</span
                  >`,
              )}
            </div>`
          : nothing
      }
      ${
        changedFiles.length > 0
          ? html`
            <div class="attempt-files">
              <span class="attempt-files-label">Changed files (${changedFiles.length}):</span>
              ${changedFiles.slice(0, 8).map((f) => html`<span class="attempt-file">${f}</span>`)}
              ${changedFiles.length > 8 ? html`<span class="attempt-file attempt-file--more">+${changedFiles.length - 8} more</span>` : nothing}
            </div>
          `
          : nothing
      }
    </div>
  `;
}

export function renderActivity(props: ActivityProps) {
  const { runtimeStatus, agentsList, tasks, attemptsByTaskId, sessionPreviews } = props;
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
            Full live view — sessions, tasks, attempts, errors
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
                const sessionKey = `agent:${lead.leadAgentId}:team-lead`;
                const preview = sessionPreviews[sessionKey];

                return html`
                  <div class="activity-card ${isActive ? "activity-card--active" : ""}">
                    <!-- Card header -->
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

                    <!-- Meta row -->
                    <div class="activity-card-meta">
                      <span class="activity-team">${lead.teamName}</span>
                      <span class="activity-sep">·</span>
                      <span>last poll: ${lastPoll}</span>
                      ${
                        lead.waitingQuestionCount > 0
                          ? html`
                              <span class="activity-sep">·</span>
                              <span style="color:var(--color-warning,#eab308)"
                                >${lead.waitingQuestionCount} question${lead.waitingQuestionCount !== 1 ? "s" : ""} pending</span>
                            `
                          : nothing
                      }
                    </div>

                    <!-- Last error -->
                    ${lead.lastError ? html`<div class="activity-error">${lead.lastError}</div>` : nothing}

                    <!-- Session transcript -->
                    ${preview?.items.length ? renderSessionTranscript(preview.items) : nothing}
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
                const sessionKey = `agent:${worker.agentId}:task-runtime`;
                const preview = sessionPreviews[sessionKey];
                const attempts = worker.currentTaskId
                  ? attemptsByTaskId[worker.currentTaskId]
                  : undefined;
                const latestAttempt = attempts?.[0] ?? null;

                return html`
                  <div class="activity-card ${isActive ? "activity-card--active" : ""}">
                    <!-- Card header -->
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

                    <!-- Teams -->
                    ${
                      worker.teamIds.length > 0
                        ? html`<div class="activity-card-meta">
                            Teams: ${worker.teamIds.map((id) => teamNameById.get(id) ?? id).join(", ")}
                            ${lastHeartbeat ? html`<span class="activity-sep">·</span><span>heartbeat: ${lastHeartbeat}</span>` : nothing}
                          </div>`
                        : lastHeartbeat
                          ? html`<div class="activity-card-meta">heartbeat: ${lastHeartbeat}</div>`
                          : nothing
                    }

                    <!-- Current task — full detail -->
                    ${
                      currentTask
                        ? html`
                          <div class="task-detail">
                            <div class="task-detail-header">
                              <span class="task-priority-dot priority-${currentTask.priority}"></span>
                              <span class="task-detail-title">${currentTask.title}</span>
                              <span class="task-detail-status">${currentTask.status}</span>
                            </div>
                            ${
                              currentTask.description && currentTask.description.trim()
                                ? html`<div class="task-detail-desc">${currentTask.description}</div>`
                                : nothing
                            }
                            ${
                              currentTask.tags?.length
                                ? html`<div class="task-tags">
                                    ${currentTask.tags.map((t) => html`<span class="tag">${t}</span>`)}
                                  </div>`
                                : nothing
                            }
                          </div>
                        `
                        : worker.state === "idle"
                          ? html`
                              <div class="activity-card-meta" style="color: var(--color-muted)">No active task</div>
                            `
                          : nothing
                    }

                    <!-- Attempt detail -->
                    ${latestAttempt ? renderAttemptDetail(latestAttempt) : nothing}

                    <!-- Worker error -->
                    ${
                      worker.lastError && worker.errorStreak > 0
                        ? html`<div class="activity-error">
                            ${worker.errorStreak > 1 ? html`(×${worker.errorStreak}) ` : nothing}${worker.lastError}
                          </div>`
                        : nothing
                    }

                    <!-- Session transcript -->
                    ${preview?.items.length ? renderSessionTranscript(preview.items) : nothing}
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
        max-width: 960px;
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
        gap: 12px;
      }

      /* Agent Card */
      .activity-card {
        background: var(--color-card-bg, rgba(255,255,255,0.04));
        border: 1px solid var(--color-border, rgba(255,255,255,0.08));
        border-radius: 10px;
        padding: 14px 16px;
        transition: border-color 0.2s;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .activity-card--active {
        border-color: rgba(34,197,94,0.35);
        background: rgba(34,197,94,0.03);
      }
      .activity-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
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
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        flex-shrink: 0;
      }
      .state-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .state-dot--pulse {
        animation: pulse-dot 1.5s ease-in-out infinite;
      }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.85); }
      }
      .activity-card-meta {
        font-size: 12px;
        color: var(--color-muted, #9ca3af);
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
      }
      .activity-team { font-weight: 500; color: var(--color-text, #e5e7eb); }
      .activity-sep { color: var(--color-muted, #6b7280); }

      /* Task Detail */
      .task-detail {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 6px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .task-detail-header {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .task-priority-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .priority-critical { background: #ef4444; }
      .priority-high { background: #f97316; }
      .priority-medium { background: #eab308; }
      .priority-low { background: #6b7280; }
      .task-detail-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text, #e5e7eb);
        flex: 1;
      }
      .task-detail-status {
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-muted, #9ca3af);
        background: rgba(255,255,255,0.06);
        padding: 1px 6px;
        border-radius: 8px;
        flex-shrink: 0;
      }
      .task-detail-desc {
        font-size: 12px;
        color: var(--color-muted, #9ca3af);
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 120px;
        overflow-y: auto;
      }
      .task-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .tag {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 8px;
        background: rgba(99,102,241,0.15);
        color: #818cf8;
      }

      /* Attempt Detail */
      .attempt-detail {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 6px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .attempt-header {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .attempt-badge {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-muted, #9ca3af);
        background: rgba(255,255,255,0.06);
        padding: 1px 6px;
        border-radius: 8px;
      }
      .attempt-duration {
        font-size: 11px;
        color: var(--color-muted, #9ca3af);
        font-variant-numeric: tabular-nums;
      }
      .attempt-status {
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 1px 6px;
        border-radius: 8px;
      }
      .attempt-status--running { background: rgba(34,197,94,0.15); color: #4ade80; }
      .attempt-status--finished { background: rgba(34,197,94,0.1); color: #6b7280; }
      .attempt-status--failed { background: rgba(239,68,68,0.15); color: #f87171; }
      .attempt-summary {
        font-size: 12px;
        color: var(--color-text, #d1d5db);
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .attempt-error {
        font-size: 12px;
        color: var(--color-danger, #ef4444);
        background: rgba(239,68,68,0.08);
        border-radius: 4px;
        padding: 6px 8px;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 100px;
        overflow-y: auto;
      }
      .attempt-outcomes {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .outcome-chip {
        font-size: 10px;
        padding: 1px 7px;
        border-radius: 8px;
        font-weight: 500;
      }
      .outcome-chip--pass { background: rgba(34,197,94,0.15); color: #4ade80; }
      .outcome-chip--fail { background: rgba(239,68,68,0.15); color: #f87171; }
      .outcome-chip--neutral { background: rgba(255,255,255,0.07); color: #9ca3af; }
      .attempt-files {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
      }
      .attempt-files-label {
        font-size: 11px;
        color: var(--color-muted, #9ca3af);
      }
      .attempt-file {
        font-size: 10px;
        font-family: monospace;
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(255,255,255,0.05);
        color: #9ca3af;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .attempt-file--more { color: #6b7280; }

      /* Session transcript */
      .session-transcript {
        border-top: 1px solid rgba(255,255,255,0.06);
        padding-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .session-transcript-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--color-muted, #6b7280);
      }
      .session-messages {
        display: flex;
        flex-direction: column;
        gap: 5px;
        max-height: 320px;
        overflow-y: auto;
      }
      .session-msg {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        font-size: 12px;
        line-height: 1.5;
        padding: 5px 8px;
        border-radius: 5px;
      }
      .session-msg--assistant {
        background: rgba(99,102,241,0.08);
        border-left: 2px solid rgba(99,102,241,0.4);
      }
      .session-msg--tool {
        background: rgba(234,179,8,0.06);
        border-left: 2px solid rgba(234,179,8,0.3);
      }
      .session-msg-role {
        flex-shrink: 0;
        font-size: 13px;
      }
      .session-msg-text {
        color: var(--color-text, #d1d5db);
        white-space: pre-wrap;
        word-break: break-word;
        opacity: 0.9;
      }
      .session-msg--tool .session-msg-text {
        font-family: monospace;
        font-size: 11px;
        color: #d1d5db;
        opacity: 0.75;
      }

      /* Shared */
      .activity-error {
        font-size: 12px;
        color: var(--color-danger, #ef4444);
        background: rgba(239,68,68,0.08);
        border-radius: 4px;
        padding: 6px 8px;
        word-break: break-word;
        white-space: pre-wrap;
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
