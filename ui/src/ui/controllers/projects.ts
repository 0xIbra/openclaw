import type { GatewayBrowserClient } from "../gateway.ts";
import type { ProjectDto } from "../types.ts";

export type ProjectsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  boardLoading: boolean;
  boardError: string | null;
  boardProjects: ProjectDto[];
  boardSelectedProjectId: string | null;
  boardShowArchivedProjects: boolean;
};

export async function loadProjects(state: ProjectsState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.boardLoading = true;
  state.boardError = null;
  try {
    const res = await state.client.request<{ projects?: ProjectDto[] }>("projects.list", {
      includeArchived: state.boardShowArchivedProjects,
    });
    const projects = Array.isArray(res.projects) ? res.projects : [];
    state.boardProjects = projects;

    const selectedExists =
      state.boardSelectedProjectId &&
      projects.some((project) => project.id === state.boardSelectedProjectId);
    if (selectedExists) {
      return;
    }

    const firstActive =
      projects.find((project) => project.archivedAtMs == null) ?? projects[0] ?? null;
    state.boardSelectedProjectId = firstActive?.id ?? null;
  } catch (err) {
    state.boardError = String(err);
  } finally {
    state.boardLoading = false;
  }
}

export async function createProject(
  state: ProjectsState,
  input: { name: string; description?: string; repoRoot?: string },
) {
  if (!state.client || !state.connected) {
    return null;
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("project name is required");
  }
  const created = await state.client.request<{ project?: ProjectDto }>("projects.create", {
    name,
    description: input.description?.trim() || undefined,
    repoRoot: input.repoRoot?.trim() || undefined,
  });
  const project = created.project;
  if (project) {
    state.boardProjects = [
      project,
      ...state.boardProjects.filter((entry) => entry.id !== project.id),
    ];
    state.boardSelectedProjectId = project.id;
  }
  return project ?? null;
}

export function patchProjectFromEvent(
  state: Pick<ProjectsState, "boardProjects" | "boardSelectedProjectId">,
  payload: unknown,
) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const project = (payload as { project?: ProjectDto }).project;
  if (!project || typeof project.id !== "string") {
    return;
  }

  const next = [...state.boardProjects];
  const index = next.findIndex((entry) => entry.id === project.id);
  if (index >= 0) {
    next[index] = project;
  } else {
    next.unshift(project);
  }
  state.boardProjects = next;

  if (!state.boardSelectedProjectId) {
    state.boardSelectedProjectId = project.id;
  }
}
