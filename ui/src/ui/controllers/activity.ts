import type { OpenClawApp } from "../app.ts";
import type { SessionsPreviewEntry, TaskAttemptDto } from "../types.ts";
import { listTaskAttempts } from "./tasks.ts";

type ActivityDetailState = {
  client: OpenClawApp["client"];
  connected: boolean;
  boardRuntimeStatus: OpenClawApp["boardRuntimeStatus"];
  boardTaskAttemptsByTaskId: OpenClawApp["boardTaskAttemptsByTaskId"];
  activitySessionPreviews: OpenClawApp["activitySessionPreviews"];
};

export async function loadActivityDetails(host: ActivityDetailState): Promise<void> {
  if (!host.client || !host.connected || !host.boardRuntimeStatus) {
    return;
  }

  const runtimeStatus = host.boardRuntimeStatus;

  // Load the latest attempt for each task a worker is currently executing
  const workerTaskIds = runtimeStatus.workers
    .filter((w) => w.currentTaskId && w.state === "running")
    .map((w) => w.currentTaskId as string);

  await Promise.allSettled(
    workerTaskIds.map((taskId) =>
      listTaskAttempts(host as unknown as OpenClawApp, { taskId, limit: 1 }),
    ),
  );

  // Build session keys for preview
  // Lead: agent:{leadAgentId}:team-lead
  // Worker (active): agent:{agentId}:task-runtime
  const sessionKeys: string[] = [];
  for (const lead of runtimeStatus.leads) {
    sessionKeys.push(`agent:${lead.leadAgentId}:team-lead`);
  }
  for (const worker of runtimeStatus.workers) {
    if (worker.state === "running" || worker.state === "recovering") {
      sessionKeys.push(`agent:${worker.agentId}:task-runtime`);
    }
  }

  if (sessionKeys.length === 0) {
    return;
  }

  try {
    const result = await host.client.request<{ previews?: SessionsPreviewEntry[] }>(
      "sessions.preview",
      { keys: sessionKeys, limit: 30, maxChars: 800 },
    );
    const byKey: Record<string, SessionsPreviewEntry> = {};
    for (const preview of result.previews ?? []) {
      byKey[preview.key] = preview;
    }
    host.activitySessionPreviews = byKey;
  } catch {
    // session preview is best-effort — don't error the page
  }
}

export function getLatestAttempt(attempts: TaskAttemptDto[] | undefined): TaskAttemptDto | null {
  if (!attempts || attempts.length === 0) {
    return null;
  }
  return attempts[0] ?? null;
}
