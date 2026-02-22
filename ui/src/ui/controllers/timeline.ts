import type { OpenClawApp } from "../app.ts";
import type { AgentTranscriptResult, TimelineEvent, TranscriptEntry } from "../types.ts";

type TimelineHost = {
  client: OpenClawApp["client"];
  connected: boolean;
  boardRuntimeStatus: OpenClawApp["boardRuntimeStatus"];
  timelineTranscripts: OpenClawApp["timelineTranscripts"];
  timelineEvents: OpenClawApp["timelineEvents"];
  timelineLoading: OpenClawApp["timelineLoading"];
  timelineError: OpenClawApp["timelineError"];
};

export async function loadTimeline(host: TimelineHost): Promise<void> {
  if (!host.client || !host.connected) {
    return;
  }

  const runtimeStatus = host.boardRuntimeStatus;
  if (!runtimeStatus) {
    return;
  }

  const sessionKeys: Array<{ key: string; agentId: string }> = [];
  for (const lead of runtimeStatus.leads) {
    sessionKeys.push({
      key: `agent:${lead.leadAgentId}:team-lead`,
      agentId: lead.leadAgentId,
    });
  }
  for (const worker of runtimeStatus.workers) {
    if (worker.state === "running" || worker.state === "recovering") {
      sessionKeys.push({
        key: `agent:${worker.agentId}:task-runtime`,
        agentId: worker.agentId,
      });
    }
  }

  if (sessionKeys.length === 0) {
    return;
  }

  const results = await Promise.allSettled(
    sessionKeys.map(({ key }) =>
      host.client!.request<AgentTranscriptResult>("sessions.transcript", { key, limit: 500 }),
    ),
  );

  const transcripts: Record<string, AgentTranscriptResult> = { ...host.timelineTranscripts };

  // Keep only live events; transcript events will be rebuilt from JSONL
  const liveEvents = host.timelineEvents.filter((e) => e.source === "live");
  const nextTranscriptEvents: TimelineEvent[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r) {
      continue;
    }
    const sk = sessionKeys[i];
    if (!sk) {
      continue;
    }
    const { key, agentId } = sk;
    if (r.status === "fulfilled" && r.value) {
      transcripts[key] = r.value;
      for (const entry of r.value.entries) {
        nextTranscriptEvents.push(transcriptEntryToEvent(entry, key, agentId));
      }
    }
  }

  // Sort transcript events by agentId + idx for stable ordering
  // Live events sit at the top (most recent, sorted by ts)
  nextTranscriptEvents.sort((a, b) => {
    const keyDiff = a.sessionKey.localeCompare(b.sessionKey);
    if (keyDiff !== 0) {
      return keyDiff;
    }
    return a.idx - b.idx;
  });

  const liveEventsSorted = [...liveEvents].toSorted((a, b) => a.ts - b.ts);

  // Merge: all transcript events first (historical), then live events appended
  const merged = dedupEvents([...nextTranscriptEvents, ...liveEventsSorted]);

  host.timelineTranscripts = transcripts;
  host.timelineEvents = merged;
}

function transcriptEntryToEvent(
  entry: TranscriptEntry,
  key: string,
  agentId: string,
): TimelineEvent {
  return {
    id: `${key}:${entry.idx}`,
    idx: entry.idx,
    ts: 0,
    agentId,
    sessionKey: key,
    source: "transcript",
    type: entry.type,
    text: entry.text,
    thinking: entry.thinking,
    toolName: entry.toolName,
    toolId: entry.toolId,
    input: entry.input,
    toolUseId: entry.toolUseId,
    content: entry.content,
  };
}

function dedupEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.id)) {
      return false;
    }
    seen.add(e.id);
    return true;
  });
}

export function appendLiveTimelineEvent(
  host: { timelineEvents: TimelineEvent[] },
  event: TimelineEvent,
): void {
  // Cap ring buffer at 2000 live events
  const existing = host.timelineEvents.filter((e) => e.source === "live");
  const transcript = host.timelineEvents.filter((e) => e.source === "transcript");
  const nextLive = dedupEvents([...existing, event]).slice(-2000);
  host.timelineEvents = [...transcript, ...nextLive];
}
