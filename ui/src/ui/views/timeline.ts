import { html, nothing } from "lit";
import type { AgentTranscriptResult, TaskRuntimeStatusDto, TimelineEvent } from "../types.ts";

export type TimelineProps = {
  runtimeStatus: TaskRuntimeStatusDto | null;
  events: TimelineEvent[];
  transcripts: Record<string, AgentTranscriptResult>;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

// Deterministic color palette for agent pills
const AGENT_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#f97316", // orange
  "#a855f7", // purple
];

function agentColor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) & 0xffffffff;
  }
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

function renderAgentBadge(agentId: string) {
  const color = agentColor(agentId);
  return html`<span
    class="timeline-agent-badge"
    style="background:${color}22;color:${color};border:1px solid ${color}55"
  >${agentId}</span>`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…`;
}

function renderEventRow(event: TimelineEvent, idx: number) {
  switch (event.type) {
    case "thinking":
      return html`
        <div class="timeline-row timeline-row--thinking" data-idx=${idx}>
          <div class="timeline-row-left">
            ${renderAgentBadge(event.agentId)}
            <span class="timeline-icon" title="Thinking">💭</span>
          </div>
          <div class="timeline-row-content">
            <details class="timeline-details">
              <summary class="timeline-thinking-preview">${truncate(event.thinking ?? "", 120)}</summary>
              <pre class="timeline-thinking-full">${event.thinking}</pre>
            </details>
          </div>
          <div class="timeline-row-meta">
            <span class="timeline-type-label">think</span>
          </div>
        </div>
      `;

    case "text":
      return html`
        <div class="timeline-row timeline-row--text" data-idx=${idx}>
          <div class="timeline-row-left">
            ${renderAgentBadge(event.agentId)}
            <span class="timeline-icon" title="Text output">💬</span>
          </div>
          <div class="timeline-row-content">
            <span class="timeline-text">${event.text}</span>
          </div>
          <div class="timeline-row-meta">
            <span class="timeline-type-label">text</span>
          </div>
        </div>
      `;

    case "tool_call": {
      const inputStr = event.input != null ? JSON.stringify(event.input, null, 2) : null;
      return html`
        <div class="timeline-row timeline-row--tool-call" data-idx=${idx}>
          <div class="timeline-row-left">
            ${renderAgentBadge(event.agentId)}
            <span class="timeline-icon" title="Tool call">🔧</span>
          </div>
          <div class="timeline-row-content">
            <details class="timeline-details">
              <summary class="timeline-tool-name">${event.toolName ?? "unknown"}(…)</summary>
              ${inputStr ? html`<pre class="timeline-json">${inputStr}</pre>` : nothing}
            </details>
          </div>
          <div class="timeline-row-meta">
            <span class="timeline-type-label">tool</span>
          </div>
        </div>
      `;
    }

    case "tool_result": {
      const resultStr = event.content != null ? JSON.stringify(event.content, null, 2) : null;
      const isError =
        typeof event.content === "object" &&
        event.content != null &&
        (event.content as Record<string, unknown>).type === "tool_result_error";
      return html`
        <div class="timeline-row timeline-row--tool-result" data-idx=${idx}>
          <div class="timeline-row-left">
            ${renderAgentBadge(event.agentId)}
            <span class="timeline-icon" title="Tool result">${isError ? "❌" : "✅"}</span>
          </div>
          <div class="timeline-row-content">
            <details class="timeline-details">
              <summary class="timeline-result-preview">result for ${event.toolUseId ? event.toolUseId.slice(0, 12) : "tool"}</summary>
              ${
                resultStr
                  ? html`<pre class="timeline-json">${truncate(resultStr, 4000)}</pre>`
                  : nothing
              }
            </details>
          </div>
          <div class="timeline-row-meta">
            <span class="timeline-type-label">result</span>
          </div>
        </div>
      `;
    }

    default:
      return nothing;
  }
}

function renderEmptyState(runtimeStatus: TaskRuntimeStatusDto | null) {
  const hasActiveAgents =
    runtimeStatus &&
    (runtimeStatus.leads.length > 0 ||
      runtimeStatus.workers.some((w) => w.state === "running" || w.state === "recovering"));

  if (!runtimeStatus) {
    return html`
      <div class="timeline-empty">
        <div class="timeline-empty-icon">📡</div>
        <div class="timeline-empty-title">No runtime status yet</div>
        <div class="timeline-empty-sub">Click refresh to load agent status.</div>
      </div>
    `;
  }

  if (!hasActiveAgents) {
    return html`
      <div class="timeline-empty">
        <div class="timeline-empty-icon">💤</div>
        <div class="timeline-empty-title">No active agents</div>
        <div class="timeline-empty-sub">
          The Timeline shows full accountability for active agents. Start a task on the Board tab to see
          agent activity here.
        </div>
      </div>
    `;
  }

  return html`
    <div class="timeline-empty">
      <div class="timeline-empty-icon">⏳</div>
      <div class="timeline-empty-title">Loading transcripts…</div>
      <div class="timeline-empty-sub">Fetching full session history for active agents.</div>
    </div>
  `;
}

export function renderTimeline(props: TimelineProps) {
  const { runtimeStatus, events, loading, error, onRefresh } = props;

  const activeLeads = runtimeStatus?.leads ?? [];
  const activeWorkers = (runtimeStatus?.workers ?? []).filter(
    (w) => w.state === "running" || w.state === "recovering",
  );
  const totalActive = activeLeads.length + activeWorkers.length;

  // Group events by agent for summary
  const agentIds = new Set<string>();
  for (const e of events) {
    if (e.agentId) {
      agentIds.add(e.agentId);
    }
  }

  return html`
    <div class="timeline-page">
      <div class="timeline-header">
        <div class="timeline-header-left">
          ${
            totalActive > 0
              ? html`<span class="pill ok">${totalActive} active agent${totalActive !== 1 ? "s" : ""}</span>`
              : html`
                  <span class="pill">No active agents</span>
                `
          }
          ${
            events.length > 0
              ? html`<span class="pill mono">${events.length} events</span>`
              : nothing
          }
        </div>
        <div class="timeline-header-right">
          <button
            class="btn btn--sm"
            @click=${onRefresh}
            ?disabled=${loading}
          >
            ${loading ? "Loading…" : "↺ Refresh"}
          </button>
        </div>
      </div>

      ${error ? html`<div class="alert alert--danger">${error}</div>` : nothing}

      ${
        activeLeads.length > 0 || activeWorkers.length > 0
          ? html`
          <div class="timeline-agents-bar">
            ${activeLeads.map(
              (lead) => html`
                <div class="timeline-agent-chip">
                  <span class="state-dot state-dot--pulse" style="background:var(--color-success,#22c55e)"></span>
                  ${renderAgentBadge(lead.leadAgentId)}
                  <span class="timeline-agent-role">lead</span>
                </div>
              `,
            )}
            ${activeWorkers.map(
              (worker) => html`
                <div class="timeline-agent-chip">
                  <span class="state-dot state-dot--pulse" style="background:var(--color-success,#22c55e)"></span>
                  ${renderAgentBadge(worker.agentId)}
                  <span class="timeline-agent-role">worker</span>
                </div>
              `,
            )}
          </div>
        `
          : nothing
      }

      ${
        events.length === 0
          ? renderEmptyState(runtimeStatus)
          : html`
          <div class="timeline-feed">
            ${events.map((event, i) => renderEventRow(event, i))}
          </div>
        `
      }
    </div>

    <style>
      .timeline-page {
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .timeline-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .timeline-header-left, .timeline-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .timeline-agents-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 12px;
        background: var(--surface-raised, #1a1a2e);
        border: 1px solid var(--border, #333);
        border-radius: 6px;
      }
      .timeline-agent-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
      }
      .timeline-agent-role {
        color: var(--text-muted, #888);
        font-size: 0.75rem;
      }
      .timeline-agent-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 0.75rem;
        font-weight: 600;
        font-family: var(--font-mono, monospace);
        white-space: nowrap;
      }
      .timeline-feed {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.8rem;
      }
      .timeline-row {
        display: grid;
        grid-template-columns: 180px 1fr 56px;
        gap: 8px;
        align-items: start;
        padding: 5px 8px;
        border-radius: 4px;
        border-left: 2px solid transparent;
      }
      .timeline-row--thinking {
        border-left-color: #7c3aed;
        background: #7c3aed0a;
      }
      .timeline-row--text {
        border-left-color: #3b82f6;
        background: #3b82f60a;
      }
      .timeline-row--tool-call {
        border-left-color: #f59e0b;
        background: #f59e0b0a;
      }
      .timeline-row--tool-result {
        border-left-color: #10b981;
        background: #10b9810a;
      }
      .timeline-row-left {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        overflow: hidden;
      }
      .timeline-icon {
        font-size: 0.9rem;
        flex-shrink: 0;
      }
      .timeline-row-content {
        overflow: hidden;
        word-break: break-word;
      }
      .timeline-row-meta {
        text-align: right;
        color: var(--text-muted, #888);
        font-size: 0.7rem;
        padding-top: 2px;
        white-space: nowrap;
      }
      .timeline-type-label {
        font-family: var(--font-mono, monospace);
        opacity: 0.7;
      }
      .timeline-details {
        width: 100%;
      }
      .timeline-details > summary {
        cursor: pointer;
        list-style: none;
        outline: none;
        color: inherit;
        padding: 1px 0;
      }
      .timeline-details > summary::-webkit-details-marker { display: none; }
      .timeline-details > summary::before {
        content: "▶ ";
        font-size: 0.6rem;
        opacity: 0.5;
      }
      .timeline-details[open] > summary::before {
        content: "▼ ";
      }
      .timeline-thinking-preview {
        font-style: italic;
        color: #a78bfa;
        font-size: 0.78rem;
      }
      .timeline-thinking-full {
        margin-top: 6px;
        white-space: pre-wrap;
        font-family: var(--font-mono, monospace);
        font-size: 0.75rem;
        color: #c4b5fd;
        background: #1e1b2e;
        padding: 8px;
        border-radius: 4px;
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid #4c1d9533;
      }
      .timeline-text {
        color: var(--text, #e5e7eb);
        line-height: 1.5;
        white-space: pre-wrap;
      }
      .timeline-tool-name {
        font-family: var(--font-mono, monospace);
        color: #fbbf24;
        font-weight: 600;
      }
      .timeline-result-preview {
        font-family: var(--font-mono, monospace);
        color: #6ee7b7;
        font-size: 0.75rem;
      }
      .timeline-json {
        margin-top: 6px;
        white-space: pre-wrap;
        font-family: var(--font-mono, monospace);
        font-size: 0.7rem;
        color: var(--text-muted, #9ca3af);
        background: var(--surface, #111827);
        padding: 8px;
        border-radius: 4px;
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid var(--border, #333);
      }
      .timeline-empty {
        text-align: center;
        padding: 48px 24px;
        color: var(--text-muted, #888);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .timeline-empty-icon { font-size: 2rem; }
      .timeline-empty-title { font-size: 1rem; font-weight: 600; color: var(--text, #e5e7eb); }
      .timeline-empty-sub { font-size: 0.85rem; max-width: 400px; line-height: 1.5; }
    </style>
  `;
}
