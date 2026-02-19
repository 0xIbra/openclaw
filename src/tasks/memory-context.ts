export type TaskRuntimeMemoryContext = {
  projectId: string;
  teamId: string | null;
  taskId: string;
};

const TASK_CONTEXT_MARKER = ":taskctx:";

function encodePart(value: string): string {
  return encodeURIComponent(value.trim());
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function appendTaskRuntimeMemoryContext(params: {
  sessionKey: string;
  projectId: string;
  teamId?: string | null;
  taskId: string;
}): string {
  const base = params.sessionKey.trim();
  if (!base) {
    return base;
  }
  const projectId = params.projectId.trim();
  const taskId = params.taskId.trim();
  const teamId = params.teamId?.trim() || "none";
  if (!projectId || !taskId) {
    return base;
  }
  const encoded = [
    "project",
    encodePart(projectId),
    "team",
    encodePart(teamId),
    "task",
    encodePart(taskId),
  ].join(":");
  const markerIndex = base.indexOf(TASK_CONTEXT_MARKER);
  const stem = markerIndex >= 0 ? base.slice(0, markerIndex) : base;
  return `${stem}${TASK_CONTEXT_MARKER}${encoded}`;
}

export function parseTaskRuntimeMemoryContext(
  sessionKey: string | undefined,
): TaskRuntimeMemoryContext | null {
  const raw = sessionKey?.trim();
  if (!raw) {
    return null;
  }
  const markerIndex = raw.indexOf(TASK_CONTEXT_MARKER);
  if (markerIndex < 0) {
    return null;
  }
  const tail = raw.slice(markerIndex + TASK_CONTEXT_MARKER.length).trim();
  if (!tail) {
    return null;
  }
  const tokens = tail.split(":").filter(Boolean);
  if (tokens.length < 6) {
    return null;
  }
  const pairs = new Map<string, string>();
  for (let i = 0; i < tokens.length - 1; i += 2) {
    pairs.set(tokens[i] ?? "", tokens[i + 1] ?? "");
  }
  const projectRaw = decodePart((pairs.get("project") ?? "").trim());
  const teamRaw = decodePart((pairs.get("team") ?? "").trim());
  const taskRaw = decodePart((pairs.get("task") ?? "").trim());
  if (!projectRaw || !taskRaw) {
    return null;
  }
  const teamId = !teamRaw || teamRaw.toLowerCase() === "none" ? null : teamRaw;
  return {
    projectId: projectRaw,
    teamId,
    taskId: taskRaw,
  };
}
