export type ProjectDto = {
  id: string;
  name: string;
  description?: string;
  repoRoot?: string;
  createdAtMs: number;
  updatedAtMs: number;
  archivedAtMs: number | null;
};

export type ProjectsListResult = { projects: ProjectDto[] };
