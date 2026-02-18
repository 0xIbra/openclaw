import { randomUUID } from "node:crypto";
import type {
  ProjectCreateInput,
  ProjectListFilters,
  ProjectRecord,
  ProjectUpdateInput,
  TaskCreateInput,
  TaskListFilters,
  TaskRecord,
} from "./types.js";
import { initializeTaskSchema, openTaskDatabase, type TaskDatabase } from "./sqlite.js";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  repo_root: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  archived_at_ms: number | null;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  type: TaskRecord["type"];
  priority: TaskRecord["priority"];
  complexity: TaskRecord["complexity"];
  status: TaskRecord["status"];
  parent_task_id: string | null;
  assigned_agent_id: string | null;
  max_attempts: number;
  attempt_count: number;
  relevant_paths_json: string;
  tags_json: string;
  created_by: string;
  created_at_ms: number;
  updated_at_ms: number;
  started_at_ms: number | null;
  completed_at_ms: number | null;
};

type TaskRowPatch = Partial<{
  title: string;
  description: string;
  type: TaskRecord["type"];
  priority: TaskRecord["priority"];
  complexity: TaskRecord["complexity"];
  parent_task_id: string | null;
  assigned_agent_id: string | null;
  max_attempts: number;
  attempt_count: number;
  relevant_paths_json: string;
  tags_json: string;
  status: TaskRecord["status"];
  updated_at_ms: number;
  started_at_ms: number | null;
  completed_at_ms: number | null;
}>;

function asStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
  } catch {
    return [];
  }
}

function placeholderList(length: number): string {
  return Array.from({ length }, () => "?").join(", ");
}

function mapProjectRow(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    repoRoot: row.repo_root ?? undefined,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    archivedAtMs: row.archived_at_ms == null ? null : Number(row.archived_at_ms),
  };
}

function mapTaskRow(params: {
  row: TaskRow;
  dependsOnTaskIds: string[];
  blockedByTaskIds: string[];
}): TaskRecord {
  const { row } = params;
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    complexity: row.complexity ?? null,
    status: row.status,
    parentTaskId: row.parent_task_id ?? null,
    dependsOnTaskIds: params.dependsOnTaskIds,
    blockedByTaskIds: params.blockedByTaskIds,
    assignedAgentId: row.assigned_agent_id ?? null,
    maxAttempts: Number(row.max_attempts),
    attemptCount: Number(row.attempt_count),
    relevantPaths: asStringArray(row.relevant_paths_json),
    tags: asStringArray(row.tags_json),
    createdBy: row.created_by,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    startedAtMs: row.started_at_ms == null ? null : Number(row.started_at_ms),
    completedAtMs: row.completed_at_ms == null ? null : Number(row.completed_at_ms),
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;

export function createTaskStore(params?: { db?: TaskDatabase; dbPath?: string }) {
  const db = params?.db ?? openTaskDatabase({ dbPath: params?.dbPath });
  const ownsDb = !params?.db;
  initializeTaskSchema(db);

  function close() {
    if (!ownsDb) {
      return;
    }
    db.close();
  }

  function getActiveProjectByName(name: string): ProjectRecord | null {
    const row = db
      .prepare(
        `SELECT * FROM projects WHERE lower(name) = lower(?) AND archived_at_ms IS NULL LIMIT 1`,
      )
      .get(name) as ProjectRow | undefined;
    return row ? mapProjectRow(row) : null;
  }

  function listProjects(filters?: ProjectListFilters): ProjectRecord[] {
    const includeArchived = filters?.includeArchived === true;
    const query = includeArchived
      ? `SELECT * FROM projects ORDER BY updated_at_ms DESC`
      : `SELECT * FROM projects WHERE archived_at_ms IS NULL ORDER BY updated_at_ms DESC`;
    const rows = db.prepare(query).all() as ProjectRow[];
    return rows.map(mapProjectRow);
  }

  function getProject(id: string): ProjectRecord | null {
    const row = db.prepare(`SELECT * FROM projects WHERE id = ? LIMIT 1`).get(id) as
      | ProjectRow
      | undefined;
    return row ? mapProjectRow(row) : null;
  }

  function createProject(input: ProjectCreateInput, nowMs: number): ProjectRecord {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO projects (
        id,
        name,
        description,
        repo_root,
        created_at_ms,
        updated_at_ms,
        archived_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run(id, input.name, input.description ?? null, input.repoRoot ?? null, nowMs, nowMs);
    return getProject(id) as ProjectRecord;
  }

  function updateProject(input: ProjectUpdateInput, nowMs: number): ProjectRecord | null {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) {
      sets.push("name = ?");
      values.push(input.name);
    }
    if (input.description !== undefined) {
      sets.push("description = ?");
      values.push(input.description || null);
    }
    if (input.repoRoot !== undefined) {
      sets.push("repo_root = ?");
      values.push(input.repoRoot || null);
    }
    if (sets.length === 0) {
      return getProject(input.id);
    }
    sets.push("updated_at_ms = ?");
    values.push(nowMs, input.id);
    db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(
      ...(values as Array<string | number | null>),
    );
    return getProject(input.id);
  }

  function archiveProject(id: string, nowMs: number): ProjectRecord | null {
    db.prepare(`UPDATE projects SET archived_at_ms = ?, updated_at_ms = ? WHERE id = ?`).run(
      nowMs,
      nowMs,
      id,
    );
    return getProject(id);
  }

  function projectExists(id: string): boolean {
    const row = db.prepare(`SELECT id FROM projects WHERE id = ? LIMIT 1`).get(id) as
      | { id: string }
      | undefined;
    return Boolean(row?.id);
  }

  function taskExists(id: string): boolean {
    const row = db.prepare(`SELECT id FROM tasks WHERE id = ? LIMIT 1`).get(id) as
      | { id: string }
      | undefined;
    return Boolean(row?.id);
  }

  function listTaskRows(filters?: TaskListFilters): TaskRow[] {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filters?.projectId) {
      where.push("t.project_id = ?");
      values.push(filters.projectId);
    }
    if (filters?.status) {
      where.push("t.status = ?");
      values.push(filters.status);
    }
    if (filters?.assignedAgentId) {
      where.push("t.assigned_agent_id = ?");
      values.push(filters.assignedAgentId);
    }
    if (filters?.type) {
      where.push("t.type = ?");
      values.push(filters.type);
    }
    if (filters?.priority) {
      where.push("t.priority = ?");
      values.push(filters.priority);
    }
    if (filters?.query?.trim()) {
      where.push("(t.title LIKE ? OR t.description LIKE ?)");
      const like = `%${filters.query.trim()}%`;
      values.push(like, like);
    }
    if (!filters?.includeArchivedProjects) {
      where.push("p.archived_at_ms IS NULL");
    }

    const limit = Math.max(1, Math.min(500, filters?.limit ?? 200));
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT t.*
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         ${whereSql}
         ORDER BY t.updated_at_ms DESC
         LIMIT ?`,
      )
      .all(...values, limit) as TaskRow[];

    if (!filters?.tag?.trim()) {
      return rows;
    }
    const tag = filters.tag.trim().toLowerCase();
    return rows.filter((row) =>
      asStringArray(row.tags_json).some((entry) => entry.toLowerCase() === tag),
    );
  }

  function getTaskRow(id: string): TaskRow | null {
    const row = db.prepare(`SELECT * FROM tasks WHERE id = ? LIMIT 1`).get(id) as
      | TaskRow
      | undefined;
    return row ?? null;
  }

  function listDependencyIdsByTaskIds(taskIds: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const taskId of taskIds) {
      map.set(taskId, []);
    }
    if (taskIds.length === 0) {
      return map;
    }
    const rows = db
      .prepare(
        `SELECT task_id, depends_on_task_id
         FROM task_dependencies
         WHERE task_id IN (${placeholderList(taskIds.length)})
         ORDER BY rowid ASC`,
      )
      .all(...taskIds) as Array<{ task_id: string; depends_on_task_id: string }>;
    for (const row of rows) {
      const list = map.get(row.task_id);
      if (!list) {
        map.set(row.task_id, [row.depends_on_task_id]);
        continue;
      }
      list.push(row.depends_on_task_id);
    }
    return map;
  }

  function listIncompleteDependencyIdsByTaskIds(taskIds: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const taskId of taskIds) {
      map.set(taskId, []);
    }
    if (taskIds.length === 0) {
      return map;
    }
    const rows = db
      .prepare(
        `SELECT d.task_id, d.depends_on_task_id
         FROM task_dependencies d
         JOIN tasks dep ON dep.id = d.depends_on_task_id
         WHERE d.task_id IN (${placeholderList(taskIds.length)})
           AND dep.status != 'done'
         ORDER BY d.rowid ASC`,
      )
      .all(...taskIds) as Array<{ task_id: string; depends_on_task_id: string }>;
    for (const row of rows) {
      const list = map.get(row.task_id);
      if (!list) {
        map.set(row.task_id, [row.depends_on_task_id]);
        continue;
      }
      list.push(row.depends_on_task_id);
    }
    return map;
  }

  function listTasks(filters?: TaskListFilters): TaskRecord[] {
    const rows = listTaskRows(filters);
    const ids = rows.map((row) => row.id);
    const dependsByTask = listDependencyIdsByTaskIds(ids);
    const blockedByTask = listIncompleteDependencyIdsByTaskIds(ids);
    return rows.map((row) =>
      mapTaskRow({
        row,
        dependsOnTaskIds: dependsByTask.get(row.id) ?? [],
        blockedByTaskIds: blockedByTask.get(row.id) ?? [],
      }),
    );
  }

  function getTask(id: string): TaskRecord | null {
    const row = getTaskRow(id);
    if (!row) {
      return null;
    }
    const dependsOnTaskIds = listDependencyIdsByTaskIds([id]).get(id) ?? [];
    const blockedByTaskIds = listIncompleteDependencyIdsByTaskIds([id]).get(id) ?? [];
    return mapTaskRow({ row, dependsOnTaskIds, blockedByTaskIds });
  }

  function createTask(input: TaskCreateInput, nowMs: number): TaskRecord {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO tasks (
        id,
        project_id,
        title,
        description,
        type,
        priority,
        complexity,
        status,
        parent_task_id,
        assigned_agent_id,
        max_attempts,
        attempt_count,
        relevant_paths_json,
        tags_json,
        created_by,
        created_at_ms,
        updated_at_ms,
        started_at_ms,
        completed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.title,
      input.description,
      input.type,
      input.priority ?? "medium",
      input.complexity ?? null,
      input.status ?? "created",
      input.parentTaskId ?? null,
      input.assignedAgentId ?? null,
      input.maxAttempts ?? 3,
      0,
      JSON.stringify(input.relevantPaths ?? []),
      JSON.stringify(input.tags ?? []),
      input.createdBy ?? "human",
      nowMs,
      nowMs,
      null,
      null,
    );
    replaceTaskDependencies(id, input.dependsOnTaskIds ?? []);
    return getTask(id) as TaskRecord;
  }

  function updateTask(id: string, patch: TaskRowPatch): TaskRecord | null {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return getTask(id);
    }
    const setSql = entries.map(([column]) => `${column} = ?`).join(", ");
    const values = entries.map(([, value]) => value);
    db.prepare(`UPDATE tasks SET ${setSql} WHERE id = ?`).run(...values, id);
    return getTask(id);
  }

  function replaceTaskDependencies(taskId: string, dependsOnTaskIds: string[]): void {
    db.exec("BEGIN");
    try {
      db.prepare(`DELETE FROM task_dependencies WHERE task_id = ?`).run(taskId);
      const insert = db.prepare(
        `INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`,
      );
      for (const dependencyTaskId of dependsOnTaskIds) {
        insert.run(taskId, dependencyTaskId);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function countIncompleteDependencies(taskId: string): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM task_dependencies d
         JOIN tasks dep ON dep.id = d.depends_on_task_id
         WHERE d.task_id = ?
           AND dep.status != 'done'`,
      )
      .get(taskId) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  return {
    db,
    close,
    getActiveProjectByName,
    listProjects,
    getProject,
    createProject,
    updateProject,
    archiveProject,
    projectExists,
    taskExists,
    listTasks,
    getTask,
    createTask,
    updateTask,
    replaceTaskDependencies,
    countIncompleteDependencies,
  };
}
