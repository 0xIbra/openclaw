import { randomUUID } from "node:crypto";
import type {
  BusAckInput,
  BusDeliveryRecord,
  BusMessageRecord,
  BusPublishInput,
  BusPublishResult,
  LeadDelegationDecision,
  ProjectCreateInput,
  ProjectListFilters,
  ProjectRecord,
  ProjectRepoRecord,
  ProjectRepoUpsertInput,
  ProjectUpdateInput,
  TaskAttemptCreateInput,
  TaskAttemptRecord,
  TaskAttemptFailInput,
  TaskAttemptFailResult,
  TaskAttemptFinishInput,
  TaskAttemptFinishResult,
  TaskAttemptStartInput,
  TaskAttemptStartResult,
  TaskAttemptUpdateInput,
  TaskForceFailActiveInput,
  TaskClaimLeaseInput,
  TaskClaimLeaseResult,
  TaskClaimNextInput,
  TaskClaimCreateInput,
  TaskClaimRecord,
  TaskCreateInput,
  TaskListFilters,
  TaskRequeueInput,
  TaskRequeueResult,
  TaskRecord,
  TaskStatus,
  TaskQuestionThreadOpenInput,
  TaskQuestionThreadRecord,
  TaskQuestionThreadStatus,
  TaskDecomposeInput,
  TaskDecomposeResult,
  TaskDecompositionRunRecord,
  TaskDecompositionRunStatus,
  TaskReviewCreateOrUpdateInput,
  TaskReviewDecideInput,
  TaskReviewDecideResult,
  TaskReviewListFilters,
  TaskReviewRecord,
  TaskPendingReviewRecord,
  TaskReviewStatus,
  TeamListFilters,
  TeamMemberRecord,
  TeamMemberUpsertInput,
  TeamRecord,
} from "./types.js";
import { initializeTaskSchema, openTaskDatabase, type TaskDatabase } from "./sqlite.js";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  repo_root: string | null;
  primary_team_id: string | null;
  build_cmd: string | null;
  test_cmd: string | null;
  lint_cmd: string | null;
  language: string | null;
  framework: string | null;
  indexed_at_ms: number | null;
  index_status: string | null;
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
  team_id: string | null;
  current_attempt_id: string | null;
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

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  lead_agent_id: string | null;
  settings_json: string;
  created_at_ms: number;
  updated_at_ms: number;
  archived_at_ms: number | null;
};

type TeamMemberRow = {
  team_id: string;
  agent_id: string;
  role: TeamMemberRecord["role"];
  created_at_ms: number;
  updated_at_ms: number;
};

type ProjectRepoRow = {
  id: string;
  project_id: string;
  repo_key: string;
  role: string;
  repo_root: string;
  is_primary: number;
  branch_prefix: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

type TaskClaimRow = {
  id: string;
  task_id: string;
  agent_id: string;
  team_id: string | null;
  lease_token: string;
  state: TaskClaimRecord["state"];
  leased_at_ms: number;
  heartbeat_at_ms: number;
  lease_expires_at_ms: number;
  released_at_ms: number | null;
};

type TaskAttemptRow = {
  id: string;
  task_id: string;
  status: string;
  started_at_ms: number;
  ended_at_ms: number | null;
  agent_id: string | null;
  notes: string | null;
  attempt_number: number | null;
  claim_id: string | null;
  team_id: string | null;
  session_backend: string | null;
  session_id: string | null;
  summary: string | null;
  error_text: string | null;
  command_outcome_json: string;
  test_outcome_json: string;
  changed_files_json: string;
  metrics_json: string;
  created_at_ms: number | null;
  updated_at_ms: number | null;
};

type BusMessageRow = {
  id: string;
  sender_agent_id: string;
  receiver_agent_id: string;
  task_id: string | null;
  correlation_id: string | null;
  reply_to_message_id: string | null;
  message_type: string;
  subject: string | null;
  body: string;
  payload_json: string;
  dedupe_key: string | null;
  state: BusMessageRecord["state"];
  delivery_count: number;
  max_deliveries: number;
  created_at_ms: number;
  available_at_ms: number;
  leased_at_ms: number | null;
  lease_expires_at_ms: number | null;
  acked_at_ms: number | null;
  expires_at_ms: number | null;
};

type TaskQuestionThreadRow = {
  id: string;
  team_id: string;
  task_id: string | null;
  lead_agent_id: string;
  requester_agent_id: string;
  question_message_id: string;
  status: TaskQuestionThreadStatus;
  opened_at_ms: number;
  reminder_due_at_ms: number;
  escalate_due_at_ms: number;
  last_notified_at_ms: number | null;
  answer_message_id: string | null;
  resolved_at_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
};

type TaskDecompositionRunRow = {
  id: string;
  parent_task_id: string;
  team_id: string | null;
  lead_agent_id: string;
  status: TaskDecompositionRunStatus;
  planner_backend: string | null;
  planner_session_id: string | null;
  plan_json: string;
  child_task_ids_json: string;
  error_text: string | null;
  dedupe_key: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

type TaskReviewRow = {
  id: string;
  task_id: string;
  team_id: string | null;
  lead_agent_id: string;
  status: TaskReviewStatus;
  require_human_approval: number;
  auto_approve_on_clean: number;
  decision_actor: string | null;
  decision_reason: string | null;
  verdict_json: string;
  created_at_ms: number;
  updated_at_ms: number;
  resolved_at_ms: number | null;
};

type TaskRowPatch = Partial<{
  title: string;
  description: string;
  type: TaskRecord["type"];
  priority: TaskRecord["priority"];
  complexity: TaskRecord["complexity"];
  parent_task_id: string | null;
  assigned_agent_id: string | null;
  team_id: string | null;
  current_attempt_id: string | null;
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

function asRecord(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
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
    buildCmd: row.build_cmd ?? null,
    testCmd: row.test_cmd ?? null,
    lintCmd: row.lint_cmd ?? null,
    language: row.language ?? null,
    framework: row.framework ?? null,
    indexedAtMs: row.indexed_at_ms == null ? null : Number(row.indexed_at_ms),
    indexStatus: (row.index_status as ProjectRecord["indexStatus"]) ?? null,
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
    teamId: row.team_id ?? null,
    currentAttemptId: row.current_attempt_id ?? null,
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

function mapTeamRow(row: TeamRow): TeamRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    leadAgentId: row.lead_agent_id ?? null,
    settings: asRecord(row.settings_json),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    archivedAtMs: row.archived_at_ms == null ? null : Number(row.archived_at_ms),
  };
}

function mapTeamMemberRow(row: TeamMemberRow): TeamMemberRecord {
  return {
    teamId: row.team_id,
    agentId: row.agent_id,
    role: row.role,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function mapProjectRepoRow(row: ProjectRepoRow): ProjectRepoRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    repoKey: row.repo_key,
    role: row.role,
    repoRoot: row.repo_root,
    isPrimary: Number(row.is_primary) === 1,
    branchPrefix: row.branch_prefix ?? null,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function mapTaskClaimRow(row: TaskClaimRow): TaskClaimRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    teamId: row.team_id ?? null,
    leaseToken: row.lease_token,
    state: row.state,
    leasedAtMs: Number(row.leased_at_ms),
    heartbeatAtMs: Number(row.heartbeat_at_ms),
    leaseExpiresAtMs: Number(row.lease_expires_at_ms),
    releasedAtMs: row.released_at_ms == null ? null : Number(row.released_at_ms),
  };
}

function mapTaskAttemptRow(row: TaskAttemptRow): TaskAttemptRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    startedAtMs: Number(row.started_at_ms),
    endedAtMs: row.ended_at_ms == null ? null : Number(row.ended_at_ms),
    agentId: row.agent_id ?? null,
    notes: row.notes ?? null,
    attemptNumber: row.attempt_number == null ? null : Number(row.attempt_number),
    claimId: row.claim_id ?? null,
    teamId: row.team_id ?? null,
    sessionBackend: row.session_backend ?? null,
    sessionId: row.session_id ?? null,
    summary: row.summary ?? null,
    errorText: row.error_text ?? null,
    commandOutcome: asRecord(row.command_outcome_json),
    testOutcome: asRecord(row.test_outcome_json),
    changedFiles: asStringArray(row.changed_files_json),
    metrics: asRecord(row.metrics_json),
    createdAtMs: row.created_at_ms == null ? null : Number(row.created_at_ms),
    updatedAtMs: row.updated_at_ms == null ? null : Number(row.updated_at_ms),
  };
}

function mapBusMessageRow(row: BusMessageRow): BusMessageRecord {
  return {
    id: row.id,
    senderAgentId: row.sender_agent_id,
    receiverAgentId: row.receiver_agent_id,
    taskId: row.task_id ?? null,
    correlationId: row.correlation_id ?? null,
    replyToMessageId: row.reply_to_message_id ?? null,
    messageType: row.message_type,
    subject: row.subject ?? null,
    body: row.body,
    payload: asRecord(row.payload_json),
    dedupeKey: row.dedupe_key ?? null,
    state: row.state,
    deliveryCount: Number(row.delivery_count),
    maxDeliveries: Number(row.max_deliveries),
    createdAtMs: Number(row.created_at_ms),
    availableAtMs: Number(row.available_at_ms),
    leasedAtMs: row.leased_at_ms == null ? null : Number(row.leased_at_ms),
    leaseExpiresAtMs: row.lease_expires_at_ms == null ? null : Number(row.lease_expires_at_ms),
    ackedAtMs: row.acked_at_ms == null ? null : Number(row.acked_at_ms),
    expiresAtMs: row.expires_at_ms == null ? null : Number(row.expires_at_ms),
  };
}

function mapTaskQuestionThreadRow(row: TaskQuestionThreadRow): TaskQuestionThreadRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    taskId: row.task_id ?? null,
    leadAgentId: row.lead_agent_id,
    requesterAgentId: row.requester_agent_id,
    questionMessageId: row.question_message_id,
    status: row.status,
    openedAtMs: Number(row.opened_at_ms),
    reminderDueAtMs: Number(row.reminder_due_at_ms),
    escalateDueAtMs: Number(row.escalate_due_at_ms),
    lastNotifiedAtMs: row.last_notified_at_ms == null ? null : Number(row.last_notified_at_ms),
    answerMessageId: row.answer_message_id ?? null,
    resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function mapTaskDecompositionRunRow(row: TaskDecompositionRunRow): TaskDecompositionRunRecord {
  return {
    id: row.id,
    parentTaskId: row.parent_task_id,
    teamId: row.team_id ?? null,
    leadAgentId: row.lead_agent_id,
    status: row.status,
    plannerBackend: row.planner_backend ?? null,
    plannerSessionId: row.planner_session_id ?? null,
    plan: asRecord(row.plan_json),
    childTaskIds: asStringArray(row.child_task_ids_json),
    errorText: row.error_text ?? null,
    dedupeKey: row.dedupe_key ?? null,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function mapTaskReviewRow(row: TaskReviewRow): TaskReviewRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    teamId: row.team_id ?? null,
    leadAgentId: row.lead_agent_id,
    status: row.status,
    requireHumanApproval: Number(row.require_human_approval) === 1,
    autoApproveOnClean: Number(row.auto_approve_on_clean) === 1,
    decisionActor: row.decision_actor ?? null,
    decisionReason: row.decision_reason ?? null,
    verdict: asRecord(row.verdict_json),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    resolvedAtMs: row.resolved_at_ms == null ? null : Number(row.resolved_at_ms),
  };
}

function buildAckToken(
  row: Pick<BusMessageRow, "id" | "delivery_count" | "lease_expires_at_ms">,
): string {
  return `${row.id}:${row.delivery_count}:${row.lease_expires_at_ms ?? 0}`;
}

function normalizeJsonRecord(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {});
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

  function getPrimaryProjectRepo(projectId: string): ProjectRepoRecord | null {
    const row = db
      .prepare(
        `SELECT *
         FROM project_repos
         WHERE project_id = ? AND is_primary = 1
         ORDER BY updated_at_ms DESC
         LIMIT 1`,
      )
      .get(projectId) as ProjectRepoRow | undefined;
    if (!row) {
      return null;
    }
    return mapProjectRepoRow(row);
  }

  function listProjectRepos(projectId: string): ProjectRepoRecord[] {
    const rows = db
      .prepare(
        `SELECT *
         FROM project_repos
         WHERE project_id = ?
         ORDER BY is_primary DESC, updated_at_ms DESC`,
      )
      .all(projectId) as ProjectRepoRow[];
    return rows.map(mapProjectRepoRow);
  }

  function syncProjectPrimaryRepoFromRepoRoot(
    projectId: string,
    repoRoot: string | null | undefined,
    nowMs: number,
  ): void {
    const normalizedRoot = repoRoot?.trim() ? repoRoot.trim() : null;

    db.exec("BEGIN");
    try {
      db.prepare(
        `UPDATE project_repos SET is_primary = 0, updated_at_ms = ? WHERE project_id = ?`,
      ).run(nowMs, projectId);

      if (!normalizedRoot) {
        db.exec("COMMIT");
        return;
      }

      const byRoot = db
        .prepare(
          `SELECT *
           FROM project_repos
           WHERE project_id = ? AND repo_root = ?
           LIMIT 1`,
        )
        .get(projectId, normalizedRoot) as ProjectRepoRow | undefined;
      if (byRoot) {
        db.prepare(
          `UPDATE project_repos
           SET is_primary = 1,
               role = 'primary',
               updated_at_ms = ?
           WHERE id = ?`,
        ).run(nowMs, byRoot.id);
        db.exec("COMMIT");
        return;
      }

      const defaultRepo = db
        .prepare(
          `SELECT *
           FROM project_repos
           WHERE project_id = ? AND repo_key = 'default'
           LIMIT 1`,
        )
        .get(projectId) as ProjectRepoRow | undefined;

      if (defaultRepo) {
        db.prepare(
          `UPDATE project_repos
           SET role = 'primary',
               repo_root = ?,
               is_primary = 1,
               updated_at_ms = ?
           WHERE id = ?`,
        ).run(normalizedRoot, nowMs, defaultRepo.id);
      } else {
        db.prepare(
          `INSERT INTO project_repos (
            id,
            project_id,
            repo_key,
            role,
            repo_root,
            is_primary,
            branch_prefix,
            created_at_ms,
            updated_at_ms
          ) VALUES (?, ?, 'default', 'primary', ?, 1, NULL, ?, ?)`,
        ).run(randomUUID(), projectId, normalizedRoot, nowMs, nowMs);
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function createProject(input: ProjectCreateInput, nowMs: number): ProjectRecord {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO projects (
        id,
        name,
        description,
        repo_root,
        build_cmd,
        test_cmd,
        lint_cmd,
        language,
        framework,
        created_at_ms,
        updated_at_ms,
        archived_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      id,
      input.name,
      input.description ?? null,
      input.repoRoot ?? null,
      input.buildCmd ?? null,
      input.testCmd ?? null,
      input.lintCmd ?? null,
      input.language ?? null,
      input.framework ?? null,
      nowMs,
      nowMs,
    );

    if (input.repoRoot !== undefined) {
      syncProjectPrimaryRepoFromRepoRoot(id, input.repoRoot ?? null, nowMs);
    }

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
    if (input.buildCmd !== undefined) {
      sets.push("build_cmd = ?");
      values.push(input.buildCmd ?? null);
    }
    if (input.testCmd !== undefined) {
      sets.push("test_cmd = ?");
      values.push(input.testCmd ?? null);
    }
    if (input.lintCmd !== undefined) {
      sets.push("lint_cmd = ?");
      values.push(input.lintCmd ?? null);
    }
    if (input.language !== undefined) {
      sets.push("language = ?");
      values.push(input.language ?? null);
    }
    if (input.framework !== undefined) {
      sets.push("framework = ?");
      values.push(input.framework ?? null);
    }
    if (input.indexStatus !== undefined) {
      sets.push("index_status = ?");
      values.push(input.indexStatus ?? null);
    }
    if (sets.length === 0) {
      return getProject(input.id);
    }
    sets.push("updated_at_ms = ?");
    values.push(nowMs, input.id);
    db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(
      ...(values as Array<string | number | null>),
    );

    if (input.repoRoot !== undefined) {
      syncProjectPrimaryRepoFromRepoRoot(input.id, input.repoRoot ?? null, nowMs);
    }

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

  function getActiveTeamByName(name: string): TeamRecord | null {
    const row = db
      .prepare(
        `SELECT * FROM teams WHERE lower(name) = lower(?) AND archived_at_ms IS NULL LIMIT 1`,
      )
      .get(name) as TeamRow | undefined;
    return row ? mapTeamRow(row) : null;
  }

  function listTeams(filters?: TeamListFilters): TeamRecord[] {
    const includeArchived = filters?.includeArchived === true;
    const rows = db
      .prepare(
        includeArchived
          ? `SELECT * FROM teams ORDER BY updated_at_ms DESC`
          : `SELECT * FROM teams WHERE archived_at_ms IS NULL ORDER BY updated_at_ms DESC`,
      )
      .all() as TeamRow[];
    return rows.map(mapTeamRow);
  }

  function getTeam(id: string): TeamRecord | null {
    const row = db.prepare(`SELECT * FROM teams WHERE id = ? LIMIT 1`).get(id) as
      | TeamRow
      | undefined;
    return row ? mapTeamRow(row) : null;
  }

  function createTeam(
    input: {
      name: string;
      description?: string;
      leadAgentId?: string;
      settings?: Record<string, unknown>;
    },
    nowMs: number,
  ): TeamRecord {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO teams (
        id,
        name,
        description,
        lead_agent_id,
        settings_json,
        created_at_ms,
        updated_at_ms,
        archived_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      id,
      input.name,
      input.description ?? null,
      input.leadAgentId ?? null,
      normalizeJsonRecord(input.settings),
      nowMs,
      nowMs,
    );
    return getTeam(id) as TeamRecord;
  }

  function updateTeam(
    input: {
      id: string;
      name?: string;
      description?: string;
      leadAgentId?: string | null;
      settings?: Record<string, unknown>;
    },
    nowMs: number,
  ): TeamRecord | null {
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
    if (input.leadAgentId !== undefined) {
      sets.push("lead_agent_id = ?");
      values.push(input.leadAgentId || null);
    }
    if (input.settings !== undefined) {
      sets.push("settings_json = ?");
      values.push(normalizeJsonRecord(input.settings));
    }
    if (sets.length === 0) {
      return getTeam(input.id);
    }
    sets.push("updated_at_ms = ?");
    values.push(nowMs, input.id);

    db.prepare(`UPDATE teams SET ${sets.join(", ")} WHERE id = ?`).run(
      ...(values as Array<string | number | null>),
    );
    return getTeam(input.id);
  }

  function archiveTeam(id: string, nowMs: number): TeamRecord | null {
    db.prepare(`UPDATE teams SET archived_at_ms = ?, updated_at_ms = ? WHERE id = ?`).run(
      nowMs,
      nowMs,
      id,
    );
    return getTeam(id);
  }

  function listTeamMembers(teamId: string): TeamMemberRecord[] {
    const rows = db
      .prepare(
        `SELECT *
         FROM team_members
         WHERE team_id = ?
         ORDER BY CASE role WHEN 'lead' THEN 0 ELSE 1 END, updated_at_ms DESC`,
      )
      .all(teamId) as TeamMemberRow[];
    return rows.map(mapTeamMemberRow);
  }

  function upsertTeamMember(input: TeamMemberUpsertInput, nowMs: number): TeamMemberRecord {
    db.prepare(
      `INSERT INTO team_members (
        team_id,
        agent_id,
        role,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(team_id, agent_id)
      DO UPDATE SET role = excluded.role, updated_at_ms = excluded.updated_at_ms`,
    ).run(input.teamId, input.agentId, input.role, nowMs, nowMs);

    const row = db
      .prepare(
        `SELECT *
         FROM team_members
         WHERE team_id = ? AND agent_id = ?
         LIMIT 1`,
      )
      .get(input.teamId, input.agentId) as TeamMemberRow;
    return mapTeamMemberRow(row);
  }

  function removeTeamMember(teamId: string, agentId: string): boolean {
    const result = db
      .prepare(`DELETE FROM team_members WHERE team_id = ? AND agent_id = ?`)
      .run(teamId, agentId) as { changes?: number };
    return Number(result.changes ?? 0) > 0;
  }

  function upsertProjectRepo(input: ProjectRepoUpsertInput, nowMs: number): ProjectRepoRecord {
    const current = input.id
      ? (db.prepare(`SELECT * FROM project_repos WHERE id = ? LIMIT 1`).get(input.id) as
          | ProjectRepoRow
          | undefined)
      : (db
          .prepare(`SELECT * FROM project_repos WHERE project_id = ? AND repo_key = ? LIMIT 1`)
          .get(input.projectId, input.repoKey) as ProjectRepoRow | undefined);

    const nextIsPrimary =
      input.isPrimary === undefined ? Number(current?.is_primary ?? 0) === 1 : input.isPrimary;

    const repoId = current?.id ?? input.id ?? randomUUID();

    db.exec("BEGIN");
    try {
      if (nextIsPrimary) {
        db.prepare(
          `UPDATE project_repos SET is_primary = 0, updated_at_ms = ? WHERE project_id = ?`,
        ).run(nowMs, input.projectId);
      }

      if (current) {
        db.prepare(
          `UPDATE project_repos
           SET repo_key = ?,
               role = ?,
               repo_root = ?,
               is_primary = ?,
               branch_prefix = ?,
               updated_at_ms = ?
           WHERE id = ?`,
        ).run(
          input.repoKey,
          input.role,
          input.repoRoot,
          nextIsPrimary ? 1 : 0,
          input.branchPrefix ?? null,
          nowMs,
          repoId,
        );
      } else {
        db.prepare(
          `INSERT INTO project_repos (
            id,
            project_id,
            repo_key,
            role,
            repo_root,
            is_primary,
            branch_prefix,
            created_at_ms,
            updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          repoId,
          input.projectId,
          input.repoKey,
          input.role,
          input.repoRoot,
          nextIsPrimary ? 1 : 0,
          input.branchPrefix ?? null,
          nowMs,
          nowMs,
        );
      }

      if (nextIsPrimary) {
        db.prepare(`UPDATE projects SET repo_root = ?, updated_at_ms = ? WHERE id = ?`).run(
          input.repoRoot,
          nowMs,
          input.projectId,
        );
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const row = db.prepare(`SELECT * FROM project_repos WHERE id = ? LIMIT 1`).get(repoId) as
      | ProjectRepoRow
      | undefined;
    if (!row) {
      throw new Error(`failed to upsert project repo: ${repoId}`);
    }
    return mapProjectRepoRow(row);
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

  function listChildTasks(parentTaskId: string): TaskRecord[] {
    const rows = db
      .prepare(
        `SELECT *
         FROM tasks
         WHERE parent_task_id = ?
         ORDER BY created_at_ms ASC`,
      )
      .all(parentTaskId) as TaskRow[];
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

  function getLatestDecompositionRun(parentTaskId: string): TaskDecompositionRunRecord | null {
    const row = db
      .prepare(
        `SELECT *
         FROM task_decomposition_runs
         WHERE parent_task_id = ?
         ORDER BY created_at_ms DESC
         LIMIT 1`,
      )
      .get(parentTaskId) as TaskDecompositionRunRow | undefined;
    return row ? mapTaskDecompositionRunRow(row) : null;
  }

  function listTeamReadyTasks(teamId: string): TaskRecord[] {
    const rows = db
      .prepare(
        `SELECT t.*
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.team_id = ?
           AND t.status IN ('backlog', 'assigned')
           AND p.archived_at_ms IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM task_dependencies d
             JOIN tasks dep ON dep.id = d.depends_on_task_id
             WHERE d.task_id = t.id
               AND dep.status != 'done'
           )
         ORDER BY
           CASE t.priority
             WHEN 'critical' THEN 0
             WHEN 'high' THEN 1
             WHEN 'medium' THEN 2
             WHEN 'low' THEN 3
             ELSE 4
           END ASC,
           t.updated_at_ms ASC`,
      )
      .all(teamId) as TaskRow[];
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

  function listTeamActiveTasks(teamId: string): TaskRecord[] {
    const rows = db
      .prepare(
        `SELECT t.*
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.team_id = ?
           AND t.status IN ('assigned', 'running', 'review', 'blocked', 'failed')
           AND p.archived_at_ms IS NULL
         ORDER BY t.updated_at_ms DESC`,
      )
      .all(teamId) as TaskRow[];
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

  function assignTaskToAgent(input: {
    taskId: string;
    assignedAgentId: string;
    teamId?: string | null;
    nowMs: number;
  }): LeadDelegationDecision | null {
    db.exec("BEGIN IMMEDIATE");
    try {
      const task = getTask(input.taskId);
      if (!task) {
        db.exec("COMMIT");
        return null;
      }
      if (countIncompleteDependencies(task.id) > 0) {
        db.exec("COMMIT");
        return null;
      }
      const nextTeamId = input.teamId === undefined ? task.teamId : input.teamId;
      db.prepare(
        `UPDATE tasks
         SET assigned_agent_id = ?,
             team_id = ?,
             status = 'assigned',
             updated_at_ms = ?
         WHERE id = ?`,
      ).run(input.assignedAgentId, nextTeamId ?? null, input.nowMs, input.taskId);

      db.exec("COMMIT");
      return {
        teamId: nextTeamId ?? null,
        taskId: input.taskId,
        assignedAgentId: input.assignedAgentId,
        reason: "lead_assignment",
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
        team_id,
        current_attempt_id,
        max_attempts,
        attempt_count,
        relevant_paths_json,
        tags_json,
        created_by,
        created_at_ms,
        updated_at_ms,
        started_at_ms,
        completed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.teamId ?? null,
      null,
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

  function setTaskStatus(taskId: string, status: TaskStatus, nowMs: number): TaskRecord | null {
    db.prepare(
      `UPDATE tasks
       SET status = ?,
           updated_at_ms = ?,
           completed_at_ms = CASE WHEN ? = 'done' THEN COALESCE(completed_at_ms, ?) ELSE NULL END
       WHERE id = ?`,
    ).run(status, nowMs, status, nowMs, taskId);
    return getTask(taskId);
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

  function createTaskAttempt(input: TaskAttemptCreateInput, nowMs: number): TaskAttemptRecord {
    const id = randomUUID();
    const startedAtMs = input.startedAtMs ?? nowMs;
    db.prepare(
      `INSERT INTO task_attempts (
        id,
        task_id,
        status,
        started_at_ms,
        ended_at_ms,
        agent_id,
        notes,
        attempt_number,
        claim_id,
        team_id,
        session_backend,
        session_id,
        summary,
        error_text,
        command_outcome_json,
        test_outcome_json,
        changed_files_json,
        metrics_json,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.taskId,
      input.status,
      startedAtMs,
      input.endedAtMs ?? null,
      input.agentId ?? null,
      input.notes ?? null,
      input.attemptNumber ?? null,
      input.claimId ?? null,
      input.teamId ?? null,
      input.sessionBackend ?? null,
      input.sessionId ?? null,
      input.summary ?? null,
      input.errorText ?? null,
      normalizeJsonRecord(input.commandOutcome),
      normalizeJsonRecord(input.testOutcome),
      JSON.stringify(input.changedFiles ?? []),
      normalizeJsonRecord(input.metrics),
      nowMs,
      nowMs,
    );

    db.prepare(`UPDATE tasks SET current_attempt_id = ?, updated_at_ms = ? WHERE id = ?`).run(
      id,
      nowMs,
      input.taskId,
    );

    const row = db.prepare(`SELECT * FROM task_attempts WHERE id = ? LIMIT 1`).get(id) as
      | TaskAttemptRow
      | undefined;
    if (!row) {
      throw new Error(`failed to create task attempt: ${id}`);
    }
    return mapTaskAttemptRow(row);
  }

  function updateTaskAttempt(
    input: TaskAttemptUpdateInput,
    nowMs: number,
  ): TaskAttemptRecord | null {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (input.status !== undefined) {
      sets.push("status = ?");
      values.push(input.status);
    }
    if (input.endedAtMs !== undefined) {
      sets.push("ended_at_ms = ?");
      values.push(input.endedAtMs ?? null);
    }
    if (input.notes !== undefined) {
      sets.push("notes = ?");
      values.push(input.notes ?? null);
    }
    if (input.summary !== undefined) {
      sets.push("summary = ?");
      values.push(input.summary ?? null);
    }
    if (input.errorText !== undefined) {
      sets.push("error_text = ?");
      values.push(input.errorText ?? null);
    }
    if (input.commandOutcome !== undefined) {
      sets.push("command_outcome_json = ?");
      values.push(normalizeJsonRecord(input.commandOutcome));
    }
    if (input.testOutcome !== undefined) {
      sets.push("test_outcome_json = ?");
      values.push(normalizeJsonRecord(input.testOutcome));
    }
    if (input.changedFiles !== undefined) {
      sets.push("changed_files_json = ?");
      values.push(JSON.stringify(input.changedFiles));
    }
    if (input.metrics !== undefined) {
      sets.push("metrics_json = ?");
      values.push(normalizeJsonRecord(input.metrics));
    }
    if (input.sessionBackend !== undefined) {
      sets.push("session_backend = ?");
      values.push(input.sessionBackend ?? null);
    }
    if (input.sessionId !== undefined) {
      sets.push("session_id = ?");
      values.push(input.sessionId ?? null);
    }

    if (sets.length === 0) {
      const row = db.prepare(`SELECT * FROM task_attempts WHERE id = ? LIMIT 1`).get(input.id) as
        | TaskAttemptRow
        | undefined;
      return row ? mapTaskAttemptRow(row) : null;
    }

    sets.push("updated_at_ms = ?");
    values.push(nowMs, input.id);

    db.prepare(`UPDATE task_attempts SET ${sets.join(", ")} WHERE id = ?`).run(
      ...(values as Array<string | number | null>),
    );

    const row = db.prepare(`SELECT * FROM task_attempts WHERE id = ? LIMIT 1`).get(input.id) as
      | TaskAttemptRow
      | undefined;
    return row ? mapTaskAttemptRow(row) : null;
  }

  function listTaskAttempts(taskId: string, limit = 50): TaskAttemptRecord[] {
    const rows = db
      .prepare(
        `SELECT *
         FROM task_attempts
         WHERE task_id = ?
         ORDER BY started_at_ms DESC
         LIMIT ?`,
      )
      .all(taskId, Math.max(1, Math.min(500, limit))) as TaskAttemptRow[];
    return rows.map(mapTaskAttemptRow);
  }

  function createTaskClaim(input: TaskClaimCreateInput): TaskClaimRecord {
    const id = randomUUID();
    const nowMs = input.nowMs ?? Date.now();
    const expiresAtMs = nowMs + Math.max(1, input.leaseDurationMs);

    db.prepare(
      `INSERT INTO task_claims (
        id,
        task_id,
        agent_id,
        team_id,
        lease_token,
        state,
        leased_at_ms,
        heartbeat_at_ms,
        lease_expires_at_ms,
        released_at_ms
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL)`,
    ).run(
      id,
      input.taskId,
      input.agentId,
      input.teamId ?? null,
      input.leaseToken,
      nowMs,
      nowMs,
      expiresAtMs,
    );

    const row = db.prepare(`SELECT * FROM task_claims WHERE id = ? LIMIT 1`).get(id) as
      | TaskClaimRow
      | undefined;
    if (!row) {
      throw new Error(`failed to create task claim: ${id}`);
    }
    return mapTaskClaimRow(row);
  }

  function getTaskClaim(id: string): TaskClaimRecord | null {
    const row = db.prepare(`SELECT * FROM task_claims WHERE id = ? LIMIT 1`).get(id) as
      | TaskClaimRow
      | undefined;
    return row ? mapTaskClaimRow(row) : null;
  }

  function getActiveTaskClaimByTaskId(taskId: string): TaskClaimRecord | null {
    const row = db
      .prepare(
        `SELECT *
         FROM task_claims
         WHERE task_id = ? AND state = 'active'
         LIMIT 1`,
      )
      .get(taskId) as TaskClaimRow | undefined;
    return row ? mapTaskClaimRow(row) : null;
  }

  function heartbeatTaskClaim(
    claimId: string,
    leaseDurationMs: number,
    nowMs: number,
  ): TaskClaimRecord | null {
    const expiresAtMs = nowMs + Math.max(1, leaseDurationMs);
    db.prepare(
      `UPDATE task_claims
       SET heartbeat_at_ms = ?,
           lease_expires_at_ms = ?
       WHERE id = ? AND state = 'active'`,
    ).run(nowMs, expiresAtMs, claimId);
    return getTaskClaim(claimId);
  }

  function releaseTaskClaim(
    claimId: string,
    nowMs: number,
    state: "released" | "expired" = "released",
  ): TaskClaimRecord | null {
    db.prepare(
      `UPDATE task_claims
       SET state = ?,
           released_at_ms = ?,
           heartbeat_at_ms = ?
       WHERE id = ? AND state = 'active'`,
    ).run(state, nowMs, nowMs, claimId);
    return getTaskClaim(claimId);
  }

  function expireStaleTaskClaims(nowMs: number): number {
    const result = db
      .prepare(
        `UPDATE task_claims
         SET state = 'expired',
             released_at_ms = ?,
             heartbeat_at_ms = ?
         WHERE state = 'active' AND lease_expires_at_ms < ?`,
      )
      .run(nowMs, nowMs, nowMs) as { changes?: number };
    return Number(result.changes ?? 0);
  }

  function claimNextTask(input: TaskClaimNextInput): TaskClaimLeaseResult | null {
    const nowMs = Date.now();
    const leaseDurationMs = Math.max(1, Math.floor(input.leaseDurationMs ?? 45_000));
    const teamIdsJson = JSON.stringify(input.teamIds ?? []);

    db.exec("BEGIN IMMEDIATE");
    try {
      expireStaleTaskClaims(nowMs);

      const candidate = db
        .prepare(
          `SELECT t.id, t.team_id
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE p.archived_at_ms IS NULL
             AND (
               (t.status = 'assigned' AND t.assigned_agent_id = @agentId)
               OR (
                 t.status = 'backlog'
                 AND t.assigned_agent_id IS NULL
                 AND (
                   @teamIdsJson = '[]'
                   OR t.team_id IN (SELECT value FROM json_each(@teamIdsJson))
                 )
               )
             )
             AND NOT EXISTS (
               SELECT 1
               FROM task_dependencies d
               JOIN tasks dep ON dep.id = d.depends_on_task_id
               WHERE d.task_id = t.id
                 AND dep.status != 'done'
             )
             AND NOT EXISTS (
               SELECT 1
               FROM task_claims c
               WHERE c.task_id = t.id
                 AND c.state = 'active'
             )
             AND NOT EXISTS (
               SELECT 1
               FROM tasks child
               WHERE child.parent_task_id = t.id
             )
           ORDER BY
             CASE t.priority
               WHEN 'critical' THEN 0
               WHEN 'high' THEN 1
               WHEN 'medium' THEN 2
               WHEN 'low' THEN 3
               ELSE 4
             END ASC,
             t.updated_at_ms ASC
           LIMIT 1`,
        )
        .get({ agentId: input.agentId, teamIdsJson }) as
        | { id?: string; team_id?: string | null }
        | undefined;

      if (!candidate?.id) {
        db.exec("COMMIT");
        return null;
      }

      const claimId = randomUUID();
      const leaseToken = randomUUID();
      const teamId = input.teamId ?? candidate.team_id ?? null;
      const leaseExpiresAtMs = nowMs + leaseDurationMs;
      db.prepare(
        `INSERT INTO task_claims (
          id,
          task_id,
          agent_id,
          team_id,
          lease_token,
          state,
          leased_at_ms,
          heartbeat_at_ms,
          lease_expires_at_ms,
          released_at_ms
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL)`,
      ).run(
        claimId,
        candidate.id,
        input.agentId,
        teamId,
        leaseToken,
        nowMs,
        nowMs,
        leaseExpiresAtMs,
      );

      if (input.teamId !== undefined) {
        db.prepare(`UPDATE tasks SET team_id = ?, updated_at_ms = ? WHERE id = ?`).run(
          input.teamId,
          nowMs,
          candidate.id,
        );
      }

      const task = getTask(candidate.id);
      const claim = getTaskClaim(claimId);
      if (!task || !claim) {
        throw new Error(`failed to create claim for task: ${candidate.id}`);
      }

      db.exec("COMMIT");
      return { task, claim };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function leaseHeartbeat(input: TaskClaimLeaseInput): TaskClaimLeaseResult | null {
    const nowMs = Date.now();
    const leaseDurationMs = Math.max(1, Math.floor(input.leaseDurationMs));
    const expiresAtMs = nowMs + leaseDurationMs;

    const claimRow = db
      .prepare(
        `SELECT *
         FROM task_claims
         WHERE id = ?
           AND state = 'active'
           AND agent_id = ?
           AND lease_token = ?
           AND lease_expires_at_ms >= ?
         LIMIT 1`,
      )
      .get(input.claimId, input.agentId, input.leaseToken, nowMs) as TaskClaimRow | undefined;
    if (!claimRow) {
      return null;
    }

    db.prepare(
      `UPDATE task_claims
       SET heartbeat_at_ms = ?,
           lease_expires_at_ms = ?
       WHERE id = ?
         AND state = 'active'
         AND lease_token = ?`,
    ).run(nowMs, expiresAtMs, input.claimId, input.leaseToken);

    const claim = getTaskClaim(input.claimId);
    const task = getTask(claimRow.task_id);
    if (!claim || !task) {
      return null;
    }

    return { task, claim };
  }

  function startAttempt(input: TaskAttemptStartInput): TaskAttemptStartResult | null {
    const nowMs = Date.now();

    db.exec("BEGIN IMMEDIATE");
    try {
      const claimRow = db
        .prepare(
          `SELECT *
           FROM task_claims
           WHERE id = ?
             AND task_id = ?
             AND agent_id = ?
             AND lease_token = ?
             AND state = 'active'
             AND lease_expires_at_ms >= ?
           LIMIT 1`,
        )
        .get(input.claimId, input.taskId, input.agentId, input.leaseToken, nowMs) as
        | TaskClaimRow
        | undefined;
      if (!claimRow) {
        db.exec("COMMIT");
        return null;
      }

      const taskRow = db.prepare(`SELECT * FROM tasks WHERE id = ? LIMIT 1`).get(input.taskId) as
        | TaskRow
        | undefined;
      if (!taskRow) {
        db.exec("COMMIT");
        return null;
      }
      if (taskRow.status !== "assigned" && taskRow.status !== "running") {
        db.exec("COMMIT");
        return null;
      }

      const attemptId = randomUUID();
      const attemptNumber = Number(taskRow.attempt_count) + 1;
      db.prepare(
        `INSERT INTO task_attempts (
          id,
          task_id,
          status,
          started_at_ms,
          ended_at_ms,
          agent_id,
          notes,
          attempt_number,
          claim_id,
          team_id,
          session_backend,
          session_id,
          summary,
          error_text,
          command_outcome_json,
          test_outcome_json,
          changed_files_json,
          metrics_json,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, 'running', ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, '{}', '{}', '[]', '{}', ?, ?)`,
      ).run(
        attemptId,
        input.taskId,
        nowMs,
        input.agentId,
        attemptNumber,
        input.claimId,
        input.teamId ?? claimRow.team_id ?? null,
        input.sessionBackend ?? null,
        input.sessionId ?? null,
        input.summary ?? null,
        nowMs,
        nowMs,
      );

      db.prepare(
        `UPDATE tasks
         SET status = 'running',
             team_id = COALESCE(team_id, ?),
             current_attempt_id = ?,
             attempt_count = ?,
             updated_at_ms = ?,
             started_at_ms = COALESCE(started_at_ms, ?)
         WHERE id = ?`,
      ).run(
        input.teamId ?? claimRow.team_id ?? null,
        attemptId,
        attemptNumber,
        nowMs,
        nowMs,
        input.taskId,
      );

      const task = getTask(input.taskId);
      const claim = getTaskClaim(input.claimId);
      const attempt = db
        .prepare(`SELECT * FROM task_attempts WHERE id = ? LIMIT 1`)
        .get(attemptId) as TaskAttemptRow | undefined;
      if (!task || !claim || !attempt) {
        throw new Error(`failed to start attempt for task: ${input.taskId}`);
      }

      db.exec("COMMIT");
      return { task, claim, attempt: mapTaskAttemptRow(attempt) };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function finishAttempt(input: TaskAttemptFinishInput): TaskAttemptFinishResult | null {
    const nowMs = Date.now();

    db.exec("BEGIN IMMEDIATE");
    try {
      const claimRow = db
        .prepare(
          `SELECT *
           FROM task_claims
           WHERE id = ?
             AND task_id = ?
             AND agent_id = ?
             AND lease_token = ?
             AND state = 'active'
             AND lease_expires_at_ms >= ?
           LIMIT 1`,
        )
        .get(input.claimId, input.taskId, input.agentId, input.leaseToken, nowMs) as
        | TaskClaimRow
        | undefined;
      if (!claimRow) {
        db.exec("COMMIT");
        return null;
      }

      db.prepare(
        `UPDATE task_attempts
         SET status = 'completed',
             ended_at_ms = ?,
             notes = ?,
             summary = ?,
             command_outcome_json = ?,
             test_outcome_json = ?,
             changed_files_json = ?,
             metrics_json = ?,
             updated_at_ms = ?
         WHERE id = ? AND task_id = ?`,
      ).run(
        nowMs,
        input.notes ?? null,
        input.summary ?? null,
        normalizeJsonRecord(input.commandOutcome),
        normalizeJsonRecord(input.testOutcome),
        JSON.stringify(input.changedFiles ?? []),
        normalizeJsonRecord(input.metrics),
        nowMs,
        input.attemptId,
        input.taskId,
      );

      db.prepare(
        `UPDATE task_claims
         SET state = 'released',
             released_at_ms = ?,
             heartbeat_at_ms = ?
         WHERE id = ? AND state = 'active'`,
      ).run(nowMs, nowMs, input.claimId);

      db.prepare(`UPDATE tasks SET status = 'review', updated_at_ms = ? WHERE id = ?`).run(
        nowMs,
        input.taskId,
      );

      const task = getTask(input.taskId);
      const claim = getTaskClaim(input.claimId);
      const attempt = db
        .prepare(`SELECT * FROM task_attempts WHERE id = ? LIMIT 1`)
        .get(input.attemptId) as TaskAttemptRow | undefined;
      if (!task || !claim || !attempt) {
        throw new Error(`failed to finish attempt for task: ${input.taskId}`);
      }

      db.exec("COMMIT");
      return { task, claim, attempt: mapTaskAttemptRow(attempt) };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function failAttempt(input: TaskAttemptFailInput): TaskAttemptFailResult | null {
    const nowMs = Date.now();

    db.exec("BEGIN IMMEDIATE");
    try {
      const claimRow = db
        .prepare(
          `SELECT *
           FROM task_claims
           WHERE id = ?
             AND task_id = ?
             AND agent_id = ?
             AND lease_token = ?
             AND state = 'active'
             AND lease_expires_at_ms >= ?
           LIMIT 1`,
        )
        .get(input.claimId, input.taskId, input.agentId, input.leaseToken, nowMs) as
        | TaskClaimRow
        | undefined;
      if (!claimRow) {
        db.exec("COMMIT");
        return null;
      }

      db.prepare(
        `UPDATE task_attempts
         SET status = 'failed',
             ended_at_ms = ?,
             notes = ?,
             summary = ?,
             error_text = ?,
             command_outcome_json = ?,
             test_outcome_json = ?,
             changed_files_json = ?,
             metrics_json = ?,
             updated_at_ms = ?
         WHERE id = ? AND task_id = ?`,
      ).run(
        nowMs,
        input.notes ?? null,
        input.summary ?? null,
        input.errorText ?? null,
        normalizeJsonRecord(input.commandOutcome),
        normalizeJsonRecord(input.testOutcome),
        JSON.stringify(input.changedFiles ?? []),
        normalizeJsonRecord(input.metrics),
        nowMs,
        input.attemptId,
        input.taskId,
      );

      db.prepare(
        `UPDATE task_claims
         SET state = 'released',
             released_at_ms = ?,
             heartbeat_at_ms = ?
         WHERE id = ? AND state = 'active'`,
      ).run(nowMs, nowMs, input.claimId);

      db.prepare(`UPDATE tasks SET status = 'failed', updated_at_ms = ? WHERE id = ?`).run(
        nowMs,
        input.taskId,
      );

      const task = getTask(input.taskId);
      const claim = getTaskClaim(input.claimId);
      const attempt = db
        .prepare(`SELECT * FROM task_attempts WHERE id = ? LIMIT 1`)
        .get(input.attemptId) as TaskAttemptRow | undefined;
      if (!task || !claim || !attempt) {
        throw new Error(`failed to fail attempt for task: ${input.taskId}`);
      }

      const remainingAttempts = Math.max(0, task.maxAttempts - task.attemptCount);
      const retryEligible = remainingAttempts > 0;

      db.exec("COMMIT");
      return {
        task,
        claim,
        attempt: mapTaskAttemptRow(attempt),
        retryEligible,
        remainingAttempts,
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function forceFailActiveTask(
    input: TaskForceFailActiveInput & { nowMs: number },
  ): TaskAttemptFailResult | null {
    const actor = input.actor.trim() || "operator";
    const reason = input.reason.trim() || "operator requested force-fail";
    const summary = `Force-failed by ${actor}: ${reason}`;

    db.exec("BEGIN IMMEDIATE");
    try {
      const taskRow = db.prepare(`SELECT * FROM tasks WHERE id = ? LIMIT 1`).get(input.taskId) as
        | TaskRow
        | undefined;
      if (!taskRow) {
        db.exec("COMMIT");
        return null;
      }

      const claimRow = db
        .prepare(
          `SELECT *
           FROM task_claims
           WHERE task_id = ?
             AND state = 'active'
           ORDER BY leased_at_ms DESC
           LIMIT 1`,
        )
        .get(input.taskId) as TaskClaimRow | undefined;
      if (!claimRow) {
        db.exec("COMMIT");
        return null;
      }

      const attemptRow =
        (taskRow.current_attempt_id
          ? (db
              .prepare(
                `SELECT *
                 FROM task_attempts
                 WHERE id = ?
                   AND task_id = ?
                 LIMIT 1`,
              )
              .get(taskRow.current_attempt_id, input.taskId) as TaskAttemptRow | undefined)
          : undefined) ??
        (db
          .prepare(
            `SELECT *
             FROM task_attempts
             WHERE task_id = ?
               AND status = 'running'
             ORDER BY started_at_ms DESC
             LIMIT 1`,
          )
          .get(input.taskId) as TaskAttemptRow | undefined);

      if (!attemptRow) {
        db.exec("COMMIT");
        return null;
      }

      db.prepare(
        `UPDATE task_attempts
         SET status = 'failed',
             ended_at_ms = ?,
             summary = ?,
             error_text = ?,
             notes = ?,
             updated_at_ms = ?
         WHERE id = ?`,
      ).run(
        input.nowMs,
        summary,
        reason,
        `[operator:${actor}] ${reason}`,
        input.nowMs,
        attemptRow.id,
      );

      db.prepare(
        `UPDATE task_claims
         SET state = 'released',
             released_at_ms = ?,
             heartbeat_at_ms = ?
         WHERE id = ?
           AND state = 'active'`,
      ).run(input.nowMs, input.nowMs, claimRow.id);

      db.prepare(
        `UPDATE tasks
         SET status = 'failed',
             current_attempt_id = ?,
             updated_at_ms = ?
         WHERE id = ?`,
      ).run(attemptRow.id, input.nowMs, input.taskId);

      const task = getTask(input.taskId);
      const claim = getTaskClaim(claimRow.id);
      const attempt = db
        .prepare(`SELECT * FROM task_attempts WHERE id = ? LIMIT 1`)
        .get(attemptRow.id) as TaskAttemptRow | undefined;
      if (!task || !claim || !attempt) {
        throw new Error(`failed to force fail task: ${input.taskId}`);
      }

      const remainingAttempts = Math.max(0, task.maxAttempts - task.attemptCount);
      const retryEligible = remainingAttempts > 0;

      db.exec("COMMIT");
      return {
        task,
        claim,
        attempt: mapTaskAttemptRow(attempt),
        retryEligible,
        remainingAttempts,
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function requeueTask(input: TaskRequeueInput): TaskRequeueResult | null {
    const nowMs = Date.now();
    const nextAssignee = input.assignedAgentId?.trim() ? input.assignedAgentId.trim() : null;

    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = getTask(input.taskId);
      if (!existing) {
        db.exec("COMMIT");
        return null;
      }
      if (
        existing.status !== "failed" &&
        existing.status !== "blocked" &&
        existing.status !== "backlog" &&
        existing.status !== "assigned"
      ) {
        db.exec("COMMIT");
        return null;
      }

      let nextStatus: TaskStatus = existing.status;
      if (existing.status === "failed" || existing.status === "blocked") {
        nextStatus = "backlog";
      }
      if (nextAssignee) {
        const hasIncomplete = countIncompleteDependencies(existing.id) > 0;
        if (hasIncomplete) {
          db.exec("COMMIT");
          return null;
        }
        nextStatus = "assigned";
      } else if (nextStatus === "assigned") {
        nextStatus = "backlog";
      }

      db.prepare(
        `UPDATE task_claims
         SET state = 'released',
             released_at_ms = ?,
             heartbeat_at_ms = ?
         WHERE task_id = ? AND state = 'active'`,
      ).run(nowMs, nowMs, existing.id);

      db.prepare(
        `UPDATE tasks
         SET status = ?,
             assigned_agent_id = ?,
             current_attempt_id = NULL,
             updated_at_ms = ?,
             completed_at_ms = CASE WHEN ? = 'done' THEN completed_at_ms ELSE NULL END
         WHERE id = ?`,
      ).run(nextStatus, nextAssignee, nowMs, nextStatus, existing.id);

      const task = getTask(existing.id);
      if (!task) {
        throw new Error(`failed to requeue task: ${existing.id}`);
      }

      db.exec("COMMIT");
      return { task, previousStatus: existing.status };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function decomposeTask(input: TaskDecomposeInput, nowMs: number): TaskDecomposeResult | null {
    const teamId = input.teamId ?? null;
    const leadAgentId = input.leadAgentId.trim();
    const dedupeKey = input.dedupeKey?.trim() || null;
    const plannerBackend = input.plannerBackend?.trim() || null;
    const plannerSessionId = input.plannerSessionId?.trim() || null;

    const normalizedChildren = input.plan.children.map((child, index) => {
      const localId = child.localId.trim() || `child-${index + 1}`;
      return {
        localId,
        title: child.title.trim(),
        description: child.description.trim(),
        type: child.type,
        priority: child.priority,
        dependsOnLocalIds: [...new Set(child.dependsOnLocalIds.map((entry) => entry.trim()))]
          .filter(Boolean)
          .filter((entry) => entry !== localId),
        tags: [...new Set((child.tags ?? []).map((entry) => entry.trim()).filter(Boolean))],
        relevantPaths: [
          ...new Set((child.relevantPaths ?? []).map((entry) => entry.trim()).filter(Boolean)),
        ],
      };
    });

    if (normalizedChildren.length < 1) {
      return null;
    }
    if (normalizedChildren.length > 12) {
      return null;
    }

    const localIdSet = new Set<string>();
    for (const child of normalizedChildren) {
      if (!child.title || !child.description) {
        return null;
      }
      if (localIdSet.has(child.localId)) {
        return null;
      }
      localIdSet.add(child.localId);
    }
    for (const child of normalizedChildren) {
      for (const dependencyLocalId of child.dependsOnLocalIds) {
        if (!localIdSet.has(dependencyLocalId)) {
          return null;
        }
      }
    }

    const edges = new Map<string, string[]>(normalizedChildren.map((entry) => [entry.localId, []]));
    for (const child of normalizedChildren) {
      edges.set(child.localId, [...child.dependsOnLocalIds]);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasCycle = (node: string): boolean => {
      if (visiting.has(node)) {
        return true;
      }
      if (visited.has(node)) {
        return false;
      }
      visiting.add(node);
      for (const dep of edges.get(node) ?? []) {
        if (hasCycle(dep)) {
          return true;
        }
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    };
    for (const node of localIdSet) {
      if (hasCycle(node)) {
        return null;
      }
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const parent = getTask(input.parentTaskId);
      if (!parent) {
        db.exec("COMMIT");
        return null;
      }

      const existingChildren = listChildTasks(parent.id);
      const latestRun = getLatestDecompositionRun(parent.id);
      if (existingChildren.length > 0 && !input.force) {
        if (latestRun) {
          db.exec("COMMIT");
          return {
            parentTask: parent,
            children: existingChildren,
            decompositionRun: latestRun,
            deduped: true,
          };
        }

        const fallbackRunId = randomUUID();
        db.prepare(
          `INSERT INTO task_decomposition_runs (
            id,
            parent_task_id,
            team_id,
            lead_agent_id,
            status,
            planner_backend,
            planner_session_id,
            plan_json,
            child_task_ids_json,
            error_text,
            dedupe_key,
            created_at_ms,
            updated_at_ms
          ) VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, ?, NULL, ?, ?, ?)`,
        ).run(
          fallbackRunId,
          parent.id,
          teamId ?? parent.teamId ?? null,
          leadAgentId,
          plannerBackend,
          plannerSessionId,
          normalizeJsonRecord({
            summary: input.plan.summary ?? null,
            children: normalizedChildren,
          }),
          JSON.stringify(existingChildren.map((entry) => entry.id)),
          dedupeKey,
          nowMs,
          nowMs,
        );
        const inserted = getLatestDecompositionRun(parent.id);
        if (!inserted) {
          throw new Error(`failed to persist decomposition run for parent: ${parent.id}`);
        }
        db.exec("COMMIT");
        return {
          parentTask: parent,
          children: existingChildren,
          decompositionRun: inserted,
          deduped: true,
        };
      }

      if (input.force) {
        db.prepare(
          `UPDATE task_decomposition_runs
           SET status = 'superseded',
               updated_at_ms = ?
           WHERE parent_task_id = ?
             AND status != 'superseded'`,
        ).run(nowMs, parent.id);
        db.prepare(
          `UPDATE tasks
           SET status = CASE WHEN status = 'done' THEN status ELSE 'blocked' END,
               updated_at_ms = ?
           WHERE parent_task_id = ?`,
        ).run(nowMs, parent.id);
      }

      const runId = randomUUID();
      db.prepare(
        `INSERT INTO task_decomposition_runs (
          id,
          parent_task_id,
          team_id,
          lead_agent_id,
          status,
          planner_backend,
          planner_session_id,
          plan_json,
          child_task_ids_json,
          error_text,
          dedupe_key,
          created_at_ms,
          updated_at_ms
        ) VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, '[]', NULL, ?, ?, ?)`,
      ).run(
        runId,
        parent.id,
        teamId ?? parent.teamId ?? null,
        leadAgentId,
        plannerBackend,
        plannerSessionId,
        normalizeJsonRecord({
          summary: input.plan.summary ?? null,
          children: normalizedChildren,
        }),
        dedupeKey,
        nowMs,
        nowMs,
      );

      const childIdByLocalId = new Map<string, string>();
      for (const child of normalizedChildren) {
        childIdByLocalId.set(child.localId, randomUUID());
      }

      const childIds: string[] = [];
      const insertTask = db.prepare(
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
          team_id,
          current_attempt_id,
          max_attempts,
          attempt_count,
          relevant_paths_json,
          tags_json,
          created_by,
          created_at_ms,
          updated_at_ms,
          started_at_ms,
          completed_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'backlog', ?, NULL, ?, NULL, ?, 0, ?, ?, ?, ?, ?, NULL, NULL)`,
      );
      for (const child of normalizedChildren) {
        const childId = childIdByLocalId.get(child.localId);
        if (!childId) {
          throw new Error(`missing child id for ${child.localId}`);
        }
        childIds.push(childId);
        insertTask.run(
          childId,
          parent.projectId,
          child.title,
          child.description,
          child.type,
          child.priority,
          null,
          parent.id,
          teamId ?? parent.teamId ?? null,
          parent.maxAttempts,
          JSON.stringify(child.relevantPaths),
          JSON.stringify(child.tags),
          input.requestedBy?.trim() || leadAgentId,
          nowMs,
          nowMs,
        );
      }

      const insertDependency = db.prepare(
        `INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`,
      );
      for (const child of normalizedChildren) {
        const childTaskId = childIdByLocalId.get(child.localId);
        if (!childTaskId) {
          continue;
        }
        for (const dependencyLocalId of child.dependsOnLocalIds) {
          const dependencyTaskId = childIdByLocalId.get(dependencyLocalId);
          if (!dependencyTaskId) {
            continue;
          }
          insertDependency.run(childTaskId, dependencyTaskId);
        }
      }

      db.prepare(
        `UPDATE task_decomposition_runs
         SET status = 'applied',
             child_task_ids_json = ?,
             updated_at_ms = ?
         WHERE id = ?`,
      ).run(JSON.stringify(childIds), nowMs, runId);

      db.prepare(
        `UPDATE tasks
         SET assigned_agent_id = ?,
             team_id = COALESCE(team_id, ?),
             status = CASE
               WHEN status = 'done' THEN status
               WHEN status = 'running' THEN status
               ELSE 'assigned'
             END,
             updated_at_ms = ?
         WHERE id = ?`,
      ).run(leadAgentId, teamId ?? parent.teamId ?? null, nowMs, parent.id);

      const nextParent = getTask(parent.id);
      const nextChildren = listChildTasks(parent.id).filter((child) => childIds.includes(child.id));
      const run = getLatestDecompositionRun(parent.id);
      if (!nextParent || !run) {
        throw new Error(`failed to complete decomposition for parent: ${parent.id}`);
      }

      db.exec("COMMIT");
      return {
        parentTask: nextParent,
        children: nextChildren,
        decompositionRun: run,
        deduped: false,
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function createOrUpdateTaskReview(
    input: TaskReviewCreateOrUpdateInput,
    nowMs: number,
  ): TaskReviewRecord | null {
    const existing = db
      .prepare(
        `SELECT *
         FROM task_review_records
         WHERE task_id = ?
           AND status IN ('pending_lead', 'pending_human')
         ORDER BY created_at_ms DESC
         LIMIT 1`,
      )
      .get(input.taskId) as TaskReviewRow | undefined;

    const verdictJson = normalizeJsonRecord(input.verdict);
    if (!existing) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO task_review_records (
          id,
          task_id,
          team_id,
          lead_agent_id,
          status,
          require_human_approval,
          auto_approve_on_clean,
          decision_actor,
          decision_reason,
          verdict_json,
          created_at_ms,
          updated_at_ms,
          resolved_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.taskId,
        input.teamId ?? null,
        input.leadAgentId,
        input.status,
        input.requireHumanApproval ? 1 : 0,
        input.autoApproveOnClean ? 1 : 0,
        input.decisionActor ?? null,
        input.decisionReason ?? null,
        verdictJson,
        nowMs,
        nowMs,
        input.resolvedAtMs ?? null,
      );
      const created = db
        .prepare(`SELECT * FROM task_review_records WHERE id = ? LIMIT 1`)
        .get(id) as TaskReviewRow | undefined;
      return created ? mapTaskReviewRow(created) : null;
    }

    db.prepare(
      `UPDATE task_review_records
       SET team_id = ?,
           lead_agent_id = ?,
           status = ?,
           require_human_approval = ?,
           auto_approve_on_clean = ?,
           decision_actor = ?,
           decision_reason = ?,
           verdict_json = ?,
           updated_at_ms = ?,
           resolved_at_ms = ?
       WHERE id = ?`,
    ).run(
      input.teamId ?? null,
      input.leadAgentId,
      input.status,
      input.requireHumanApproval ? 1 : 0,
      input.autoApproveOnClean ? 1 : 0,
      input.decisionActor ?? null,
      input.decisionReason ?? null,
      verdictJson,
      nowMs,
      input.resolvedAtMs ?? null,
      existing.id,
    );

    const updated = db
      .prepare(`SELECT * FROM task_review_records WHERE id = ? LIMIT 1`)
      .get(existing.id) as TaskReviewRow | undefined;
    return updated ? mapTaskReviewRow(updated) : null;
  }

  function getOpenTaskReview(taskId: string): TaskReviewRecord | null {
    const row = db
      .prepare(
        `SELECT *
         FROM task_review_records
         WHERE task_id = ?
           AND status IN ('pending_lead', 'pending_human')
         ORDER BY created_at_ms DESC
         LIMIT 1`,
      )
      .get(taskId) as TaskReviewRow | undefined;
    return row ? mapTaskReviewRow(row) : null;
  }

  function getLatestTaskReview(taskId: string): TaskReviewRecord | null {
    const row = db
      .prepare(
        `SELECT *
         FROM task_review_records
         WHERE task_id = ?
         ORDER BY created_at_ms DESC
         LIMIT 1`,
      )
      .get(taskId) as TaskReviewRow | undefined;
    return row ? mapTaskReviewRow(row) : null;
  }

  function listPendingTaskReviews(filters?: TaskReviewListFilters): TaskPendingReviewRecord[] {
    const clauses: string[] = ["r.status IN ('pending_lead', 'pending_human')"];
    const values: Array<string | number> = [];
    if (filters?.teamId?.trim()) {
      clauses.push("r.team_id = ?");
      values.push(filters.teamId.trim());
    }
    if (filters?.projectId?.trim()) {
      clauses.push("t.project_id = ?");
      values.push(filters.projectId.trim());
    }
    const limit = Math.max(1, Math.min(500, Math.floor(filters?.limit ?? 100)));
    const rows = db
      .prepare(
        `SELECT r.*
         FROM task_review_records r
         JOIN tasks t ON t.id = r.task_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY r.updated_at_ms DESC
         LIMIT ?`,
      )
      .all(...values, limit) as TaskReviewRow[];

    return rows
      .map((row) => {
        const task = getTask(row.task_id);
        if (!task) {
          return null;
        }
        return {
          review: mapTaskReviewRow(row),
          task,
        };
      })
      .filter((entry): entry is TaskPendingReviewRecord => entry != null);
  }

  function decideTaskReview(
    input: TaskReviewDecideInput,
    nowMs: number,
  ): TaskReviewDecideResult | null {
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = db
        .prepare(
          `SELECT *
           FROM task_review_records
           WHERE task_id = ?
             AND status IN ('pending_lead', 'pending_human')
           ORDER BY created_at_ms DESC
           LIMIT 1`,
        )
        .get(input.taskId) as TaskReviewRow | undefined;
      if (!current) {
        db.exec("COMMIT");
        return null;
      }

      const decisionStatus: TaskReviewStatus =
        input.decision === "approve" ? "approved" : "rejected";
      db.prepare(
        `UPDATE task_review_records
         SET status = ?,
             decision_actor = ?,
             decision_reason = ?,
             updated_at_ms = ?,
             resolved_at_ms = ?
         WHERE id = ?`,
      ).run(decisionStatus, input.actor, input.reason ?? null, nowMs, nowMs, current.id);

      const nextTaskStatus: TaskStatus = input.decision === "approve" ? "done" : "blocked";
      db.prepare(
        `UPDATE tasks
         SET status = ?,
             updated_at_ms = ?,
             completed_at_ms = CASE WHEN ? = 'done' THEN COALESCE(completed_at_ms, ?) ELSE NULL END
         WHERE id = ?`,
      ).run(nextTaskStatus, nowMs, nextTaskStatus, nowMs, input.taskId);

      const reviewRow = db
        .prepare(`SELECT * FROM task_review_records WHERE id = ? LIMIT 1`)
        .get(current.id) as TaskReviewRow | undefined;
      const task = getTask(input.taskId);
      if (!reviewRow || !task) {
        throw new Error(`failed to decide review for task: ${input.taskId}`);
      }

      db.exec("COMMIT");
      return {
        task,
        review: mapTaskReviewRow(reviewRow),
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function openQuestionThread(
    input: TaskQuestionThreadOpenInput,
    nowMs: number,
  ): TaskQuestionThreadRecord {
    const existing = db
      .prepare(
        `SELECT *
         FROM task_question_threads
         WHERE question_message_id = ?
         LIMIT 1`,
      )
      .get(input.questionMessageId) as TaskQuestionThreadRow | undefined;
    if (existing) {
      return mapTaskQuestionThreadRow(existing);
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO task_question_threads (
        id,
        team_id,
        task_id,
        lead_agent_id,
        requester_agent_id,
        question_message_id,
        status,
        opened_at_ms,
        reminder_due_at_ms,
        escalate_due_at_ms,
        last_notified_at_ms,
        answer_message_id,
        resolved_at_ms,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    ).run(
      id,
      input.teamId,
      input.taskId ?? null,
      input.leadAgentId,
      input.requesterAgentId,
      input.questionMessageId,
      input.openedAtMs,
      input.reminderDueAtMs,
      input.escalateDueAtMs,
      nowMs,
      nowMs,
    );

    const created = db
      .prepare(`SELECT * FROM task_question_threads WHERE id = ? LIMIT 1`)
      .get(id) as TaskQuestionThreadRow | undefined;
    if (!created) {
      throw new Error(`failed to create task question thread: ${id}`);
    }
    return mapTaskQuestionThreadRow(created);
  }

  function updateQuestionThread(
    id: string,
    patch: Partial<{
      status: TaskQuestionThreadStatus;
      reminder_due_at_ms: number;
      escalate_due_at_ms: number;
      last_notified_at_ms: number | null;
      answer_message_id: string | null;
      resolved_at_ms: number | null;
      updated_at_ms: number;
    }>,
  ): TaskQuestionThreadRecord | null {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      const existing = db
        .prepare(`SELECT * FROM task_question_threads WHERE id = ? LIMIT 1`)
        .get(id) as TaskQuestionThreadRow | undefined;
      return existing ? mapTaskQuestionThreadRow(existing) : null;
    }
    const setSql = entries.map(([column]) => `${column} = ?`).join(", ");
    const values = entries.map(([, value]) => value);
    db.prepare(`UPDATE task_question_threads SET ${setSql} WHERE id = ?`).run(...values, id);
    const updated = db
      .prepare(`SELECT * FROM task_question_threads WHERE id = ? LIMIT 1`)
      .get(id) as TaskQuestionThreadRow | undefined;
    return updated ? mapTaskQuestionThreadRow(updated) : null;
  }

  function markQuestionAnswered(input: {
    threadId: string;
    answerMessageId: string;
    nowMs: number;
  }): TaskQuestionThreadRecord | null {
    return updateQuestionThread(input.threadId, {
      status: "answered",
      answer_message_id: input.answerMessageId,
      resolved_at_ms: input.nowMs,
      updated_at_ms: input.nowMs,
    });
  }

  function listDueQuestionReminders(nowMs: number): TaskQuestionThreadRecord[] {
    const rows = db
      .prepare(
        `SELECT *
         FROM task_question_threads
         WHERE status = 'open'
           AND reminder_due_at_ms <= ?
           AND (last_notified_at_ms IS NULL OR last_notified_at_ms < reminder_due_at_ms)
         ORDER BY reminder_due_at_ms ASC`,
      )
      .all(nowMs) as TaskQuestionThreadRow[];
    return rows.map(mapTaskQuestionThreadRow);
  }

  function listDueEscalations(nowMs: number): TaskQuestionThreadRecord[] {
    const rows = db
      .prepare(
        `SELECT *
         FROM task_question_threads
         WHERE status = 'open'
           AND escalate_due_at_ms <= ?
         ORDER BY escalate_due_at_ms ASC`,
      )
      .all(nowMs) as TaskQuestionThreadRow[];
    return rows.map(mapTaskQuestionThreadRow);
  }

  function countOpenQuestionThreads(input: { teamId: string; leadAgentId: string }): number {
    const row = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM task_question_threads
         WHERE team_id = ?
           AND lead_agent_id = ?
           AND status = 'open'`,
      )
      .get(input.teamId, input.leadAgentId) as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  function getBusMessage(id: string): BusMessageRecord | null {
    const row = db.prepare(`SELECT * FROM task_bus_messages WHERE id = ? LIMIT 1`).get(id) as
      | BusMessageRow
      | undefined;
    return row ? mapBusMessageRow(row) : null;
  }

  function publishBusMessage(input: BusPublishInput, nowMs: number): BusPublishResult {
    const id = randomUUID();
    const delayMs = Math.max(0, Math.floor(input.delayMs ?? 0));
    const ttlMs = input.ttlMs == null ? null : Math.max(1, Math.floor(input.ttlMs));
    const maxDeliveries = Math.max(1, Math.min(1000, Math.floor(input.maxDeliveries ?? 20)));
    const dedupeKey = input.dedupeKey?.trim() ? input.dedupeKey.trim() : null;

    try {
      db.prepare(
        `INSERT INTO task_bus_messages (
          id,
          sender_agent_id,
          receiver_agent_id,
          task_id,
          correlation_id,
          reply_to_message_id,
          message_type,
          subject,
          body,
          payload_json,
          dedupe_key,
          state,
          delivery_count,
          max_deliveries,
          created_at_ms,
          available_at_ms,
          leased_at_ms,
          lease_expires_at_ms,
          acked_at_ms,
          expires_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, NULL, NULL, NULL, ?)`,
      ).run(
        id,
        input.senderAgentId,
        input.receiverAgentId,
        input.taskId ?? null,
        input.correlationId ?? null,
        input.replyToMessageId ?? null,
        input.messageType,
        input.subject ?? null,
        input.body,
        normalizeJsonRecord(input.payload),
        dedupeKey,
        maxDeliveries,
        nowMs,
        nowMs + delayMs,
        ttlMs == null ? null : nowMs + ttlMs,
      );
      return { messageId: id, deduped: false };
    } catch (error) {
      const errorText = String(error);
      if (
        dedupeKey &&
        errorText.includes("UNIQUE constraint failed: task_bus_messages.receiver_agent_id")
      ) {
        const existing = db
          .prepare(
            `SELECT id
             FROM task_bus_messages
             WHERE receiver_agent_id = ?
               AND dedupe_key = ?
               AND state != 'expired'
             ORDER BY created_at_ms DESC
             LIMIT 1`,
          )
          .get(input.receiverAgentId, dedupeKey) as { id?: string } | undefined;
        if (existing?.id) {
          return { messageId: existing.id, deduped: true };
        }
      }
      throw error;
    }
  }

  function pullBusMessages(input: {
    receiverAgentId: string;
    maxMessages: number;
    visibilityTimeoutMs: number;
  }): BusDeliveryRecord[] {
    const nowMs = Date.now();
    const maxMessages = Math.max(1, Math.min(100, Math.floor(input.maxMessages)));
    const visibilityTimeoutMs = Math.max(1, Math.floor(input.visibilityTimeoutMs));

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        `UPDATE task_bus_messages
         SET state = 'expired'
         WHERE state IN ('pending', 'leased')
           AND expires_at_ms IS NOT NULL
           AND expires_at_ms <= ?`,
      ).run(nowMs);

      db.prepare(
        `UPDATE task_bus_messages
         SET state = 'dead_letter'
         WHERE state = 'leased'
           AND lease_expires_at_ms IS NOT NULL
           AND lease_expires_at_ms < ?
           AND delivery_count >= max_deliveries`,
      ).run(nowMs);

      db.prepare(
        `UPDATE task_bus_messages
         SET state = 'pending',
             available_at_ms = ?,
             leased_at_ms = NULL,
             lease_expires_at_ms = NULL
         WHERE state = 'leased'
           AND lease_expires_at_ms IS NOT NULL
           AND lease_expires_at_ms < ?
           AND delivery_count < max_deliveries`,
      ).run(nowMs, nowMs);

      const candidates = db
        .prepare(
          `SELECT *
           FROM task_bus_messages
           WHERE receiver_agent_id = ?
             AND state = 'pending'
             AND available_at_ms <= ?
             AND (expires_at_ms IS NULL OR expires_at_ms > ?)
           ORDER BY available_at_ms ASC, created_at_ms ASC
           LIMIT ?`,
        )
        .all(input.receiverAgentId, nowMs, nowMs, maxMessages) as BusMessageRow[];

      const deliveries: BusDeliveryRecord[] = [];
      for (const candidate of candidates) {
        const updated = db
          .prepare(
            `UPDATE task_bus_messages
             SET state = 'leased',
                 delivery_count = delivery_count + 1,
                 leased_at_ms = ?,
                 lease_expires_at_ms = ?
             WHERE id = ? AND state = 'pending'`,
          )
          .run(nowMs, nowMs + visibilityTimeoutMs, candidate.id) as { changes?: number };
        if (Number(updated.changes ?? 0) < 1) {
          continue;
        }
        const row = db
          .prepare(`SELECT * FROM task_bus_messages WHERE id = ? LIMIT 1`)
          .get(candidate.id) as BusMessageRow | undefined;
        if (!row) {
          continue;
        }
        deliveries.push({
          message: mapBusMessageRow(row),
          ackToken: buildAckToken(row),
        });
      }

      db.exec("COMMIT");
      return deliveries;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function ackBusMessage(input: BusAckInput, nowMs: number): BusMessageRecord | null {
    const row = db
      .prepare(
        `SELECT *
         FROM task_bus_messages
         WHERE id = ?
           AND receiver_agent_id = ?
           AND state = 'leased'
         LIMIT 1`,
      )
      .get(input.messageId, input.receiverAgentId) as BusMessageRow | undefined;
    if (!row) {
      return null;
    }

    if (row.lease_expires_at_ms != null && Number(row.lease_expires_at_ms) < nowMs) {
      return null;
    }
    if (buildAckToken(row) !== input.ackToken) {
      return null;
    }

    db.prepare(
      `UPDATE task_bus_messages
       SET state = 'acked',
           acked_at_ms = ?
       WHERE id = ? AND state = 'leased'`,
    ).run(nowMs, input.messageId);

    return getBusMessage(input.messageId);
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
    getActiveTeamByName,
    listTeams,
    getTeam,
    createTeam,
    updateTeam,
    archiveTeam,
    listTeamMembers,
    upsertTeamMember,
    removeTeamMember,
    listProjectRepos,
    getPrimaryProjectRepo,
    syncProjectPrimaryRepoFromRepoRoot,
    upsertProjectRepo,
    listTasks,
    getTask,
    listChildTasks,
    getLatestDecompositionRun,
    listTeamReadyTasks,
    listTeamActiveTasks,
    assignTaskToAgent,
    createTask,
    updateTask,
    setTaskStatus,
    replaceTaskDependencies,
    countIncompleteDependencies,
    createTaskAttempt,
    updateTaskAttempt,
    listTaskAttempts,
    createTaskClaim,
    getTaskClaim,
    getActiveTaskClaimByTaskId,
    heartbeatTaskClaim,
    releaseTaskClaim,
    expireStaleTaskClaims,
    claimNextTask,
    leaseHeartbeat,
    startAttempt,
    finishAttempt,
    failAttempt,
    forceFailActiveTask,
    requeueTask,
    decomposeTask,
    createOrUpdateTaskReview,
    getOpenTaskReview,
    getLatestTaskReview,
    listPendingTaskReviews,
    decideTaskReview,
    openQuestionThread,
    updateQuestionThread,
    markQuestionAnswered,
    listDueQuestionReminders,
    listDueEscalations,
    countOpenQuestionThreads,
    getBusMessage,
    publishBusMessage,
    pullBusMessages,
    ackBusMessage,
  };
}
