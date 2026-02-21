import type {
  BusAckInput,
  BusDeliveryRecord,
  BusMessageRecord,
  BusPublishInput,
  BusPublishResult,
  LeadDelegationDecision,
  LeadEscalationRecord,
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
  TaskDecomposeInput,
  TaskDecomposeResult,
  TaskDecompositionRunRecord,
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
  TaskQuestionThreadRecord,
  TaskQuestionThreadStatus,
  TaskPendingReviewRecord,
  TaskReviewCreateOrUpdateInput,
  TaskReviewDecideInput,
  TaskReviewDecideResult,
  TaskReviewListFilters,
  TaskReviewRecord,
  TaskTransitionInput,
  TaskUpdateInput,
  TeamCreateInput,
  TeamListFilters,
  TeamMemberRecord,
  TeamMemberRole,
  TeamMemberUpsertInput,
  TeamRecord,
  TeamUpdateInput,
} from "./types.js";
import { validateTaskTransition } from "./lifecycle.js";
import { createTaskStore, type TaskStore } from "./store.js";

const DEPENDENCY_GUARDED_STATUSES = new Set<TaskRecord["status"]>([
  "assigned",
  "running",
  "review",
  "done",
]);
const ASSIGNEE_GUARDED_STATUSES = new Set<TaskRecord["status"]>(["assigned", "running"]);
const TEAM_MEMBER_ROLES = new Set<TeamMemberRole>(["lead", "member"]);

export type TaskServiceErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "invalid_transition";

export class TaskServiceError extends Error {
  constructor(
    readonly code: TaskServiceErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "TaskServiceError";
  }
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalNullableString(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      continue;
    }
    deduped.add(trimmed);
  }
  return [...deduped];
}

function requireNonEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TaskServiceError("invalid_input", `${fieldName} is required`);
  }
  return trimmed;
}

function normalizeRole(role: string): TeamMemberRole {
  const normalized = role.trim().toLowerCase() as TeamMemberRole;
  if (!TEAM_MEMBER_ROLES.has(normalized)) {
    throw new TaskServiceError("invalid_input", `invalid team member role '${role}'`);
  }
  return normalized;
}

function readBooleanSetting(
  settings: Record<string, unknown> | undefined,
  keys: string[],
  fallback: boolean,
): boolean {
  let current: unknown = settings;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return fallback;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "boolean" ? current : fallback;
}

function deepMergeSettings(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMergeSettings(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class TaskService {
  constructor(
    private readonly store: TaskStore,
    private readonly now: () => number,
  ) {}

  close() {
    this.store.close();
  }

  listProjects(filters?: ProjectListFilters): ProjectRecord[] {
    return this.store.listProjects(filters);
  }

  createProject(input: ProjectCreateInput): ProjectRecord {
    const name = requireNonEmpty(input.name, "project name");
    const existing = this.store.getActiveProjectByName(name);
    if (existing) {
      throw new TaskServiceError("conflict", `project '${name}' already exists (${existing.id})`);
    }

    return this.store.createProject(
      {
        name,
        description: normalizeOptionalString(input.description),
        repoRoot: normalizeOptionalString(input.repoRoot),
        buildCmd: input.buildCmd !== undefined ? input.buildCmd?.trim() || null : undefined,
        testCmd: input.testCmd !== undefined ? input.testCmd?.trim() || null : undefined,
        lintCmd: input.lintCmd !== undefined ? input.lintCmd?.trim() || null : undefined,
        language: input.language !== undefined ? input.language?.trim() || null : undefined,
        framework: input.framework !== undefined ? input.framework?.trim() || null : undefined,
      },
      this.now(),
    );
  }

  getProject(id: string): ProjectRecord | null {
    return this.store.getProject(id);
  }

  updateProject(input: ProjectUpdateInput): ProjectRecord {
    const existing = this.store.getProject(input.id);
    if (!existing) {
      throw new TaskServiceError("not_found", `project not found: ${input.id}`);
    }

    const nextName = input.name ? requireNonEmpty(input.name, "project name") : undefined;
    if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
      const conflict = this.store.getActiveProjectByName(nextName);
      if (conflict && conflict.id !== existing.id) {
        throw new TaskServiceError(
          "conflict",
          `project '${nextName}' already exists (${conflict.id})`,
        );
      }
    }

    const updated = this.store.updateProject(
      {
        id: input.id,
        name: nextName,
        description: normalizeOptionalString(input.description),
        repoRoot: normalizeOptionalString(input.repoRoot),
        buildCmd: input.buildCmd !== undefined ? input.buildCmd?.trim() || null : undefined,
        testCmd: input.testCmd !== undefined ? input.testCmd?.trim() || null : undefined,
        lintCmd: input.lintCmd !== undefined ? input.lintCmd?.trim() || null : undefined,
        language: input.language !== undefined ? input.language?.trim() || null : undefined,
        framework: input.framework !== undefined ? input.framework?.trim() || null : undefined,
      },
      this.now(),
    );

    if (!updated) {
      throw new TaskServiceError("not_found", `project not found: ${input.id}`);
    }
    return updated;
  }

  archiveProject(id: string): ProjectRecord {
    const existing = this.store.getProject(id);
    if (!existing) {
      throw new TaskServiceError("not_found", `project not found: ${id}`);
    }
    const archived = this.store.archiveProject(id, this.now());
    if (!archived) {
      throw new TaskServiceError("not_found", `project not found: ${id}`);
    }
    return archived;
  }

  listTeams(filters?: TeamListFilters): TeamRecord[] {
    return this.store.listTeams(filters);
  }

  getTeam(id: string): TeamRecord | null {
    return this.store.getTeam(id);
  }

  getTeamByName(name: string): TeamRecord | null {
    const normalizedName = normalizeOptionalString(name);
    if (!normalizedName) {
      throw new TaskServiceError("invalid_input", "team name is required");
    }
    return this.store.getActiveTeamByName(normalizedName);
  }

  createTeam(input: TeamCreateInput): TeamRecord {
    const name = requireNonEmpty(input.name, "team name");
    const existing = this.store.getActiveTeamByName(name);
    if (existing) {
      throw new TaskServiceError("conflict", `team '${name}' already exists (${existing.id})`);
    }

    const nowMs = this.now();
    const team = this.store.createTeam(
      {
        name,
        description: normalizeOptionalString(input.description),
        leadAgentId: normalizeOptionalString(input.leadAgentId),
        settings: input.settings ?? {},
      },
      nowMs,
    );

    if (team.leadAgentId) {
      this.store.upsertTeamMember(
        { teamId: team.id, agentId: team.leadAgentId, role: "lead" },
        nowMs,
      );
    }

    return team;
  }

  updateTeam(input: TeamUpdateInput): TeamRecord {
    const existing = this.store.getTeam(input.id);
    if (!existing) {
      throw new TaskServiceError("not_found", `team not found: ${input.id}`);
    }

    const nextName = input.name ? requireNonEmpty(input.name, "team name") : undefined;
    if (nextName && nextName.toLowerCase() !== existing.name.toLowerCase()) {
      const conflict = this.store.getActiveTeamByName(nextName);
      if (conflict && conflict.id !== existing.id) {
        throw new TaskServiceError(
          "conflict",
          `team '${nextName}' already exists (${conflict.id})`,
        );
      }
    }

    const nowMs = this.now();
    const updated = this.store.updateTeam(
      {
        id: input.id,
        name: nextName,
        description: normalizeOptionalString(input.description),
        leadAgentId: normalizeOptionalNullableString(input.leadAgentId),
        settings: input.settings,
      },
      nowMs,
    );

    if (!updated) {
      throw new TaskServiceError("not_found", `team not found: ${input.id}`);
    }

    if (updated.leadAgentId) {
      const members = this.store.listTeamMembers(updated.id);
      for (const member of members) {
        if (member.role === "lead" && member.agentId !== updated.leadAgentId) {
          this.store.upsertTeamMember(
            { teamId: updated.id, agentId: member.agentId, role: "member" },
            nowMs,
          );
        }
      }
      this.store.upsertTeamMember(
        { teamId: updated.id, agentId: updated.leadAgentId, role: "lead" },
        nowMs,
      );
    }

    return updated;
  }

  updateTeamSettings(teamId: string, patch: Record<string, unknown>): TeamRecord {
    const existing = this.store.getTeam(teamId);
    if (!existing) {
      throw new TaskServiceError("not_found", `team not found: ${teamId}`);
    }
    const merged = deepMergeSettings(existing.settings ?? {}, patch);
    const updated = this.store.updateTeam({ id: teamId, settings: merged }, this.now());
    if (!updated) {
      throw new TaskServiceError("not_found", `team not found: ${teamId}`);
    }
    return updated;
  }

  archiveTeam(id: string): TeamRecord {
    const existing = this.store.getTeam(id);
    if (!existing) {
      throw new TaskServiceError("not_found", `team not found: ${id}`);
    }
    const archived = this.store.archiveTeam(id, this.now());
    if (!archived) {
      throw new TaskServiceError("not_found", `team not found: ${id}`);
    }
    return archived;
  }

  listTeamMembers(teamId: string): TeamMemberRecord[] {
    const team = this.store.getTeam(teamId);
    if (!team) {
      throw new TaskServiceError("not_found", `team not found: ${teamId}`);
    }
    return this.store.listTeamMembers(teamId);
  }

  upsertTeamMember(input: TeamMemberUpsertInput): TeamMemberRecord {
    const team = this.store.getTeam(input.teamId);
    if (!team) {
      throw new TaskServiceError("not_found", `team not found: ${input.teamId}`);
    }

    const agentId = requireNonEmpty(input.agentId, "agentId");
    const role = normalizeRole(input.role);
    const nowMs = this.now();

    if (role === "lead") {
      const members = this.store.listTeamMembers(input.teamId);
      for (const member of members) {
        if (member.role === "lead" && member.agentId !== agentId) {
          this.store.upsertTeamMember(
            { teamId: input.teamId, agentId: member.agentId, role: "member" },
            nowMs,
          );
        }
      }
      this.store.updateTeam({ id: input.teamId, leadAgentId: agentId }, nowMs);
    }

    const member = this.store.upsertTeamMember({ teamId: input.teamId, agentId, role }, nowMs);

    if (role === "member" && team.leadAgentId === agentId) {
      this.store.updateTeam({ id: input.teamId, leadAgentId: null }, nowMs);
    }

    return member;
  }

  removeTeamMember(teamId: string, agentId: string): boolean {
    const team = this.store.getTeam(teamId);
    if (!team) {
      throw new TaskServiceError("not_found", `team not found: ${teamId}`);
    }

    const removed = this.store.removeTeamMember(teamId, requireNonEmpty(agentId, "agentId"));
    if (removed && team.leadAgentId === agentId) {
      this.store.updateTeam({ id: teamId, leadAgentId: null }, this.now());
    }
    return removed;
  }

  listTeamReadyTasks(teamId: string): TaskRecord[] {
    const team = this.store.getTeam(requireNonEmpty(teamId, "teamId"));
    if (!team || team.archivedAtMs != null) {
      throw new TaskServiceError("not_found", `team not found: ${teamId}`);
    }
    return this.store.listTeamReadyTasks(team.id);
  }

  listTeamActiveTasks(teamId: string): TaskRecord[] {
    const team = this.store.getTeam(requireNonEmpty(teamId, "teamId"));
    if (!team || team.archivedAtMs != null) {
      throw new TaskServiceError("not_found", `team not found: ${teamId}`);
    }
    return this.store.listTeamActiveTasks(team.id);
  }

  assignTaskToAgent(input: {
    taskId: string;
    assignedAgentId: string;
    teamId?: string | null;
  }): LeadDelegationDecision {
    const nowMs = this.now();
    const decision = this.store.assignTaskToAgent({
      taskId: requireNonEmpty(input.taskId, "taskId"),
      assignedAgentId: requireNonEmpty(input.assignedAgentId, "assignedAgentId"),
      teamId: normalizeOptionalNullableString(input.teamId),
      nowMs,
    });
    if (!decision) {
      throw new TaskServiceError("conflict", "task assignment preconditions failed");
    }
    return decision;
  }

  listProjectRepos(projectId: string): ProjectRepoRecord[] {
    const project = this.store.getProject(projectId);
    if (!project) {
      throw new TaskServiceError("not_found", `project not found: ${projectId}`);
    }
    return this.store.listProjectRepos(projectId);
  }

  getPrimaryProjectRepo(projectId: string): ProjectRepoRecord | null {
    const project = this.store.getProject(projectId);
    if (!project) {
      throw new TaskServiceError("not_found", `project not found: ${projectId}`);
    }
    return this.store.getPrimaryProjectRepo(projectId);
  }

  upsertProjectRepo(input: ProjectRepoUpsertInput): ProjectRepoRecord {
    if (!this.store.projectExists(input.projectId)) {
      throw new TaskServiceError("not_found", `project not found: ${input.projectId}`);
    }

    return this.store.upsertProjectRepo(
      {
        ...input,
        repoKey: requireNonEmpty(input.repoKey, "repoKey"),
        role: requireNonEmpty(input.role, "role"),
        repoRoot: requireNonEmpty(input.repoRoot, "repoRoot"),
        branchPrefix: normalizeOptionalNullableString(input.branchPrefix),
      },
      this.now(),
    );
  }

  listTasks(filters?: TaskListFilters): TaskRecord[] {
    return this.store.listTasks(filters);
  }

  getTask(id: string): TaskRecord | null {
    return this.store.getTask(id);
  }

  listChildTasks(parentTaskId: string): TaskRecord[] {
    const parent = this.store.getTask(requireNonEmpty(parentTaskId, "parentTaskId"));
    if (!parent) {
      throw new TaskServiceError("not_found", `task not found: ${parentTaskId}`);
    }
    return this.store.listChildTasks(parent.id);
  }

  getLatestDecompositionRun(parentTaskId: string): TaskDecompositionRunRecord | null {
    const parent = this.store.getTask(requireNonEmpty(parentTaskId, "parentTaskId"));
    if (!parent) {
      throw new TaskServiceError("not_found", `task not found: ${parentTaskId}`);
    }
    return this.store.getLatestDecompositionRun(parent.id);
  }

  resolveTeamReviewPolicy(teamId: string | null | undefined): {
    requireHumanApproval: boolean;
    autoApproveOnCleanResult: boolean;
    autoDecompose: boolean;
  } {
    const team = teamId ? this.store.getTeam(teamId) : null;
    const settings = team?.settings ?? {};
    return {
      requireHumanApproval: readBooleanSetting(settings, ["review", "requireHumanApproval"], false),
      autoApproveOnCleanResult: readBooleanSetting(
        settings,
        ["review", "autoApproveOnCleanResult"],
        true,
      ),
      autoDecompose: readBooleanSetting(settings, ["decomposition", "auto"], true),
    };
  }

  decomposeTask(input: TaskDecomposeInput): TaskDecomposeResult {
    const parentTaskId = requireNonEmpty(input.parentTaskId, "parentTaskId");
    const parent = this.store.getTask(parentTaskId);
    if (!parent) {
      throw new TaskServiceError("not_found", `task not found: ${parentTaskId}`);
    }
    if (parent.parentTaskId) {
      throw new TaskServiceError(
        "invalid_input",
        `task '${parentTaskId}' is not a parent/root task`,
      );
    }
    if (!input.plan || !Array.isArray(input.plan.children) || input.plan.children.length < 1) {
      throw new TaskServiceError("invalid_input", "decomposition plan must include children");
    }

    const leadAgentId = requireNonEmpty(input.leadAgentId, "leadAgentId");
    const result = this.store.decomposeTask(
      {
        ...input,
        parentTaskId: parent.id,
        teamId: normalizeOptionalNullableString(input.teamId) ?? parent.teamId,
        leadAgentId,
        requestedBy: normalizeOptionalNullableString(input.requestedBy),
        force: input.force === true,
        plannerBackend: normalizeOptionalNullableString(input.plannerBackend),
        plannerSessionId: normalizeOptionalNullableString(input.plannerSessionId),
        dedupeKey: normalizeOptionalNullableString(input.dedupeKey),
      },
      this.now(),
    );
    if (!result) {
      throw new TaskServiceError("conflict", `task cannot be decomposed: ${parentTaskId}`);
    }
    return result;
  }

  createOrUpdateTaskReview(input: TaskReviewCreateOrUpdateInput): TaskReviewRecord {
    const task = this.store.getTask(requireNonEmpty(input.taskId, "taskId"));
    if (!task) {
      throw new TaskServiceError("not_found", `task not found: ${input.taskId}`);
    }
    const leadAgentId = requireNonEmpty(input.leadAgentId, "leadAgentId");
    const review = this.store.createOrUpdateTaskReview(
      {
        ...input,
        taskId: task.id,
        teamId: normalizeOptionalNullableString(input.teamId) ?? task.teamId,
        leadAgentId,
        decisionActor: normalizeOptionalNullableString(input.decisionActor),
        decisionReason: normalizeOptionalNullableString(input.decisionReason),
      },
      this.now(),
    );
    if (!review) {
      throw new TaskServiceError("conflict", `task review update failed: ${task.id}`);
    }
    return review;
  }

  getOpenTaskReview(taskId: string): TaskReviewRecord | null {
    if (!this.store.taskExists(requireNonEmpty(taskId, "taskId"))) {
      throw new TaskServiceError("not_found", `task not found: ${taskId}`);
    }
    return this.store.getOpenTaskReview(taskId);
  }

  getLatestTaskReview(taskId: string): TaskReviewRecord | null {
    if (!this.store.taskExists(requireNonEmpty(taskId, "taskId"))) {
      throw new TaskServiceError("not_found", `task not found: ${taskId}`);
    }
    return this.store.getLatestTaskReview(taskId);
  }

  listPendingTaskReviews(filters?: TaskReviewListFilters): TaskPendingReviewRecord[] {
    return this.store.listPendingTaskReviews({
      teamId: normalizeOptionalString(filters?.teamId),
      projectId: normalizeOptionalString(filters?.projectId),
      limit: filters?.limit,
    });
  }

  decideTaskReview(input: TaskReviewDecideInput): TaskReviewDecideResult {
    const taskId = requireNonEmpty(input.taskId, "taskId");
    const actor = requireNonEmpty(input.actor, "actor");
    const decision = input.decision;
    const result = this.store.decideTaskReview(
      {
        taskId,
        decision,
        actor,
        reason: normalizeOptionalNullableString(input.reason),
      },
      this.now(),
    );
    if (!result) {
      throw new TaskServiceError("conflict", `no open review for task: ${taskId}`);
    }
    return result;
  }

  createTask(input: TaskCreateInput): TaskRecord {
    const project = this.store.getProject(input.projectId);
    if (!project) {
      throw new TaskServiceError("not_found", `project not found: ${input.projectId}`);
    }
    if (project.archivedAtMs != null) {
      throw new TaskServiceError("invalid_input", `project is archived: ${input.projectId}`);
    }

    const title = requireNonEmpty(input.title, "task title");
    const description = requireNonEmpty(input.description, "task description");
    const parentTaskId = normalizeOptionalString(input.parentTaskId);
    const dependsOnTaskIds = normalizeStringArray(input.dependsOnTaskIds);

    if (input.status && input.status !== "created" && input.status !== "backlog") {
      throw new TaskServiceError(
        "invalid_input",
        `tasks.create currently supports status 'created' or 'backlog' only (received '${input.status}')`,
      );
    }

    if (parentTaskId) {
      const parentTask = this.store.getTask(parentTaskId);
      if (!parentTask) {
        throw new TaskServiceError("not_found", `parent task not found: ${parentTaskId}`);
      }
      if (parentTask.projectId !== input.projectId) {
        throw new TaskServiceError(
          "invalid_input",
          `parent task '${parentTaskId}' must belong to project '${input.projectId}'`,
        );
      }
    }

    for (const dependencyTaskId of dependsOnTaskIds) {
      const dependencyTask = this.store.getTask(dependencyTaskId);
      if (!dependencyTask) {
        throw new TaskServiceError("not_found", `dependency task not found: ${dependencyTaskId}`);
      }
      if (dependencyTask.projectId !== input.projectId) {
        throw new TaskServiceError(
          "invalid_input",
          `dependency task '${dependencyTaskId}' must belong to project '${input.projectId}'`,
        );
      }
    }

    const maxAttempts = input.maxAttempts == null ? 3 : Math.floor(input.maxAttempts);
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1) {
      throw new TaskServiceError("invalid_input", "maxAttempts must be a positive integer");
    }
    const teamId = normalizeOptionalNullableString(input.teamId);
    if (teamId) {
      const team = this.store.getTeam(teamId);
      if (!team || team.archivedAtMs != null) {
        throw new TaskServiceError("not_found", `team not found: ${teamId}`);
      }
    }

    return this.store.createTask(
      {
        ...input,
        teamId,
        title,
        description,
        parentTaskId,
        dependsOnTaskIds,
        assignedAgentId: normalizeOptionalString(input.assignedAgentId),
        maxAttempts,
        relevantPaths: normalizeStringArray(input.relevantPaths),
        tags: normalizeStringArray(input.tags),
      },
      this.now(),
    );
  }

  updateTask(input: TaskUpdateInput): TaskRecord {
    const existing = this.store.getTask(input.id);
    if (!existing) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }

    const nextAssignedAgentId =
      normalizeOptionalNullableString(input.assignedAgentId) ?? existing.assignedAgentId;
    if (ASSIGNEE_GUARDED_STATUSES.has(existing.status) && !nextAssignedAgentId) {
      throw new TaskServiceError(
        "invalid_input",
        `status '${existing.status}' requires assignedAgentId`,
      );
    }

    const dependsOnTaskIds =
      input.dependsOnTaskIds === undefined
        ? existing.dependsOnTaskIds
        : normalizeStringArray(input.dependsOnTaskIds);

    for (const dependencyTaskId of dependsOnTaskIds) {
      if (dependencyTaskId === existing.id) {
        throw new TaskServiceError("invalid_input", "task cannot depend on itself");
      }
      const dependencyTask = this.store.getTask(dependencyTaskId);
      if (!dependencyTask) {
        throw new TaskServiceError("not_found", `dependency task not found: ${dependencyTaskId}`);
      }
      if (dependencyTask.projectId !== existing.projectId) {
        throw new TaskServiceError(
          "invalid_input",
          `dependency task '${dependencyTaskId}' must belong to project '${existing.projectId}'`,
        );
      }
      if (DEPENDENCY_GUARDED_STATUSES.has(existing.status) && dependencyTask.status !== "done") {
        throw new TaskServiceError(
          "invalid_input",
          `status '${existing.status}' requires all dependencies to be done`,
        );
      }
    }

    const maxAttempts =
      input.maxAttempts === undefined ? existing.maxAttempts : Math.floor(input.maxAttempts);
    if (!Number.isFinite(maxAttempts) || maxAttempts < 1) {
      throw new TaskServiceError("invalid_input", "maxAttempts must be a positive integer");
    }

    const nowMs = this.now();
    const teamId = normalizeOptionalNullableString(input.teamId);
    if (teamId) {
      const team = this.store.getTeam(teamId);
      if (!team || team.archivedAtMs != null) {
        throw new TaskServiceError("not_found", `team not found: ${teamId}`);
      }
    }
    const updated = this.store.updateTask(input.id, {
      title: input.title ? requireNonEmpty(input.title, "task title") : undefined,
      description: input.description
        ? requireNonEmpty(input.description, "task description")
        : undefined,
      type: input.type,
      priority: input.priority,
      complexity: input.complexity === undefined ? undefined : input.complexity,
      parent_task_id: normalizeOptionalNullableString(input.parentTaskId),
      assigned_agent_id:
        input.assignedAgentId === undefined
          ? undefined
          : normalizeOptionalNullableString(input.assignedAgentId),
      team_id: input.teamId === undefined ? undefined : teamId,
      max_attempts: maxAttempts,
      relevant_paths_json:
        input.relevantPaths === undefined
          ? undefined
          : JSON.stringify(normalizeStringArray(input.relevantPaths)),
      tags_json:
        input.tags === undefined ? undefined : JSON.stringify(normalizeStringArray(input.tags)),
      updated_at_ms: nowMs,
    });

    if (input.dependsOnTaskIds !== undefined) {
      this.store.replaceTaskDependencies(input.id, dependsOnTaskIds);
    }

    if (!updated) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }

    return updated;
  }

  transitionTask(input: TaskTransitionInput): TaskRecord {
    const existing = this.store.getTask(input.id);
    if (!existing) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }

    const requestedAssignee = normalizeOptionalString(input.assignedAgentId);
    const nextAssignedAgentId = requestedAssignee ?? existing.assignedAgentId;
    const hasIncompleteDependencies = this.store.countIncompleteDependencies(existing.id) > 0;

    const transitionValidation = validateTaskTransition({
      fromStatus: existing.status,
      toStatus: input.toStatus,
      assignedAgentId: nextAssignedAgentId,
      hasIncompleteDependencies,
    });

    if (!transitionValidation.ok) {
      throw new TaskServiceError("invalid_transition", transitionValidation.message, {
        reason: transitionValidation.reason,
      });
    }

    const nowMs = this.now();
    const startedAtMs =
      input.toStatus === "running" && existing.startedAtMs == null ? nowMs : existing.startedAtMs;
    const completedAtMs = input.toStatus === "done" ? (existing.completedAtMs ?? nowMs) : null;

    const updated = this.store.updateTask(existing.id, {
      status: input.toStatus,
      assigned_agent_id: nextAssignedAgentId,
      updated_at_ms: nowMs,
      started_at_ms: startedAtMs,
      completed_at_ms: completedAtMs,
    });

    if (!updated) {
      throw new TaskServiceError("not_found", `task not found: ${input.id}`);
    }
    return updated;
  }

  setTaskStatus(taskId: string, status: TaskRecord["status"]): TaskRecord {
    const existing = this.store.getTask(requireNonEmpty(taskId, "taskId"));
    if (!existing) {
      throw new TaskServiceError("not_found", `task not found: ${taskId}`);
    }
    const next = this.store.setTaskStatus(existing.id, status, this.now());
    if (!next) {
      throw new TaskServiceError("conflict", `failed to update task status: ${taskId}`);
    }
    return next;
  }

  claimNextTask(input: TaskClaimNextInput): TaskClaimLeaseResult | null {
    const agentId = requireNonEmpty(input.agentId, "agentId");
    const leaseDurationMs = Math.max(1, Math.floor(input.leaseDurationMs ?? 45_000));
    return this.store.claimNextTask({
      agentId,
      teamId: normalizeOptionalNullableString(input.teamId),
      teamIds: input.teamIds ?? [],
      leaseDurationMs,
    });
  }

  leaseHeartbeat(input: TaskClaimLeaseInput): TaskClaimLeaseResult {
    const claim = this.store.leaseHeartbeat({
      claimId: requireNonEmpty(input.claimId, "claimId"),
      agentId: requireNonEmpty(input.agentId, "agentId"),
      leaseToken: requireNonEmpty(input.leaseToken, "leaseToken"),
      leaseDurationMs: Math.max(1, Math.floor(input.leaseDurationMs)),
    });
    if (!claim) {
      throw new TaskServiceError("not_found", `active claim not found: ${input.claimId}`);
    }
    return claim;
  }

  startAttempt(input: TaskAttemptStartInput): TaskAttemptStartResult {
    const result = this.store.startAttempt({
      ...input,
      taskId: requireNonEmpty(input.taskId, "taskId"),
      claimId: requireNonEmpty(input.claimId, "claimId"),
      agentId: requireNonEmpty(input.agentId, "agentId"),
      leaseToken: requireNonEmpty(input.leaseToken, "leaseToken"),
      teamId: normalizeOptionalNullableString(input.teamId),
      sessionBackend: normalizeOptionalNullableString(input.sessionBackend),
      sessionId: normalizeOptionalNullableString(input.sessionId),
      summary: normalizeOptionalNullableString(input.summary),
    });
    if (!result) {
      throw new TaskServiceError("conflict", "attempt start preconditions failed");
    }
    return result;
  }

  finishAttempt(input: TaskAttemptFinishInput): TaskAttemptFinishResult {
    const result = this.store.finishAttempt({
      ...input,
      taskId: requireNonEmpty(input.taskId, "taskId"),
      claimId: requireNonEmpty(input.claimId, "claimId"),
      attemptId: requireNonEmpty(input.attemptId, "attemptId"),
      agentId: requireNonEmpty(input.agentId, "agentId"),
      leaseToken: requireNonEmpty(input.leaseToken, "leaseToken"),
      summary: normalizeOptionalNullableString(input.summary),
      notes: normalizeOptionalNullableString(input.notes),
      changedFiles: normalizeStringArray(input.changedFiles),
    });
    if (!result) {
      throw new TaskServiceError("conflict", "attempt finish preconditions failed");
    }
    return result;
  }

  failAttempt(input: TaskAttemptFailInput): TaskAttemptFailResult {
    const result = this.store.failAttempt({
      ...input,
      taskId: requireNonEmpty(input.taskId, "taskId"),
      claimId: requireNonEmpty(input.claimId, "claimId"),
      attemptId: requireNonEmpty(input.attemptId, "attemptId"),
      agentId: requireNonEmpty(input.agentId, "agentId"),
      leaseToken: requireNonEmpty(input.leaseToken, "leaseToken"),
      errorText: normalizeOptionalNullableString(input.errorText),
      summary: normalizeOptionalNullableString(input.summary),
      notes: normalizeOptionalNullableString(input.notes),
      changedFiles: normalizeStringArray(input.changedFiles),
    });
    if (!result) {
      throw new TaskServiceError("conflict", "attempt fail preconditions failed");
    }
    return result;
  }

  forceFailActiveTask(input: TaskForceFailActiveInput): TaskAttemptFailResult {
    const result = this.store.forceFailActiveTask({
      taskId: requireNonEmpty(input.taskId, "taskId"),
      reason: requireNonEmpty(input.reason, "reason"),
      actor: requireNonEmpty(input.actor, "actor"),
      nowMs: this.now(),
    });
    if (!result) {
      throw new TaskServiceError(
        "conflict",
        `task does not have an active running attempt: ${input.taskId}`,
      );
    }
    return result;
  }

  requeueTask(input: TaskRequeueInput): TaskRequeueResult {
    const result = this.store.requeueTask({
      taskId: requireNonEmpty(input.taskId, "taskId"),
      assignedAgentId: normalizeOptionalNullableString(input.assignedAgentId),
    });
    if (!result) {
      throw new TaskServiceError("conflict", `task cannot be requeued: ${input.taskId}`);
    }
    return result;
  }

  createTaskAttempt(input: TaskAttemptCreateInput): TaskAttemptRecord {
    if (!this.store.taskExists(input.taskId)) {
      throw new TaskServiceError("not_found", `task not found: ${input.taskId}`);
    }
    return this.store.createTaskAttempt(input, this.now());
  }

  updateTaskAttempt(input: TaskAttemptUpdateInput): TaskAttemptRecord {
    const updated = this.store.updateTaskAttempt(input, this.now());
    if (!updated) {
      throw new TaskServiceError("not_found", `task attempt not found: ${input.id}`);
    }
    return updated;
  }

  listTaskAttempts(taskId: string, limit?: number): TaskAttemptRecord[] {
    if (!this.store.taskExists(taskId)) {
      throw new TaskServiceError("not_found", `task not found: ${taskId}`);
    }
    return this.store.listTaskAttempts(taskId, limit ?? 50);
  }

  createTaskClaim(input: TaskClaimCreateInput): TaskClaimRecord {
    if (!this.store.taskExists(input.taskId)) {
      throw new TaskServiceError("not_found", `task not found: ${input.taskId}`);
    }
    try {
      return this.store.createTaskClaim({ ...input, nowMs: this.now() });
    } catch (error) {
      const message = String(error);
      if (message.includes("UNIQUE constraint failed: task_claims.task_id")) {
        throw new TaskServiceError("conflict", `task already has an active claim: ${input.taskId}`);
      }
      throw error;
    }
  }

  heartbeatTaskClaim(claimId: string, leaseDurationMs: number): TaskClaimRecord {
    const duration = Math.max(1, Math.floor(leaseDurationMs));
    const claim = this.store.heartbeatTaskClaim(claimId, duration, this.now());
    if (!claim) {
      throw new TaskServiceError("not_found", `task claim not found: ${claimId}`);
    }
    return claim;
  }

  releaseTaskClaim(claimId: string, state: "released" | "expired" = "released"): TaskClaimRecord {
    const claim = this.store.releaseTaskClaim(claimId, this.now(), state);
    if (!claim) {
      throw new TaskServiceError("not_found", `task claim not found: ${claimId}`);
    }
    return claim;
  }

  expireStaleTaskClaims(): number {
    return this.store.expireStaleTaskClaims(this.now());
  }

  openQuestionThread(input: {
    teamId: string;
    taskId?: string | null;
    leadAgentId: string;
    requesterAgentId: string;
    questionMessageId: string;
    reminderDelayMs: number;
    escalationDelayMs: number;
  }): TaskQuestionThreadRecord {
    const nowMs = this.now();
    return this.store.openQuestionThread(
      {
        teamId: requireNonEmpty(input.teamId, "teamId"),
        taskId: normalizeOptionalNullableString(input.taskId),
        leadAgentId: requireNonEmpty(input.leadAgentId, "leadAgentId"),
        requesterAgentId: requireNonEmpty(input.requesterAgentId, "requesterAgentId"),
        questionMessageId: requireNonEmpty(input.questionMessageId, "questionMessageId"),
        openedAtMs: nowMs,
        reminderDueAtMs: nowMs + Math.max(1, Math.floor(input.reminderDelayMs)),
        escalateDueAtMs: nowMs + Math.max(1, Math.floor(input.escalationDelayMs)),
      },
      nowMs,
    );
  }

  touchQuestionThread(input: {
    threadId: string;
    status?: TaskQuestionThreadStatus;
    reminderDueAtMs?: number;
    escalateDueAtMs?: number;
    lastNotifiedAtMs?: number | null;
    resolvedAtMs?: number | null;
    answerMessageId?: string | null;
  }): TaskQuestionThreadRecord {
    const updated = this.store.updateQuestionThread(requireNonEmpty(input.threadId, "threadId"), {
      status: input.status,
      reminder_due_at_ms: input.reminderDueAtMs,
      escalate_due_at_ms: input.escalateDueAtMs,
      last_notified_at_ms: input.lastNotifiedAtMs,
      answer_message_id: input.answerMessageId,
      resolved_at_ms: input.resolvedAtMs,
      updated_at_ms: this.now(),
    });
    if (!updated) {
      throw new TaskServiceError("not_found", `question thread not found: ${input.threadId}`);
    }
    return updated;
  }

  markQuestionAnswered(input: {
    threadId: string;
    answerMessageId: string;
  }): TaskQuestionThreadRecord {
    const updated = this.store.markQuestionAnswered({
      threadId: requireNonEmpty(input.threadId, "threadId"),
      answerMessageId: requireNonEmpty(input.answerMessageId, "answerMessageId"),
      nowMs: this.now(),
    });
    if (!updated) {
      throw new TaskServiceError("not_found", `question thread not found: ${input.threadId}`);
    }
    return updated;
  }

  listDueQuestionReminders(nowMs?: number): TaskQuestionThreadRecord[] {
    return this.store.listDueQuestionReminders(nowMs ?? this.now());
  }

  listDueEscalations(nowMs?: number): TaskQuestionThreadRecord[] {
    return this.store.listDueEscalations(nowMs ?? this.now());
  }

  countOpenQuestionThreads(input: { teamId: string; leadAgentId: string }): number {
    return this.store.countOpenQuestionThreads({
      teamId: requireNonEmpty(input.teamId, "teamId"),
      leadAgentId: requireNonEmpty(input.leadAgentId, "leadAgentId"),
    });
  }

  markQuestionEscalated(threadId: string): LeadEscalationRecord {
    const nowMs = this.now();
    const updated = this.touchQuestionThread({
      threadId,
      status: "escalated",
      resolvedAtMs: nowMs,
    });
    return {
      threadId: updated.id,
      teamId: updated.teamId,
      taskId: updated.taskId,
      leadAgentId: updated.leadAgentId,
      requesterAgentId: updated.requesterAgentId,
      questionMessageId: updated.questionMessageId,
      escalatedAtMs: nowMs,
    };
  }

  publishBusMessage(input: BusPublishInput): BusPublishResult {
    const senderAgentId = requireNonEmpty(input.senderAgentId, "senderAgentId");
    const receiverAgentId = requireNonEmpty(input.receiverAgentId, "receiverAgentId");
    const messageType = requireNonEmpty(input.messageType, "messageType");
    const body = requireNonEmpty(input.body, "body");
    const result = this.store.publishBusMessage(
      {
        ...input,
        senderAgentId,
        receiverAgentId,
        messageType,
        body,
        taskId: normalizeOptionalNullableString(input.taskId),
        correlationId: normalizeOptionalNullableString(input.correlationId),
        replyToMessageId: normalizeOptionalNullableString(input.replyToMessageId),
        subject: normalizeOptionalNullableString(input.subject),
        dedupeKey: normalizeOptionalNullableString(input.dedupeKey),
      },
      this.now(),
    );
    return result;
  }

  pullBusMessages(input: {
    receiverAgentId: string;
    maxMessages?: number;
    visibilityTimeoutMs?: number;
  }): BusDeliveryRecord[] {
    return this.store.pullBusMessages({
      receiverAgentId: requireNonEmpty(input.receiverAgentId, "receiverAgentId"),
      maxMessages: Math.max(1, Math.floor(input.maxMessages ?? 20)),
      visibilityTimeoutMs: Math.max(1, Math.floor(input.visibilityTimeoutMs ?? 30_000)),
    });
  }

  ackBusMessage(input: BusAckInput) {
    const record = this.store.ackBusMessage(
      {
        receiverAgentId: requireNonEmpty(input.receiverAgentId, "receiverAgentId"),
        messageId: requireNonEmpty(input.messageId, "messageId"),
        ackToken: requireNonEmpty(input.ackToken, "ackToken"),
      },
      this.now(),
    );
    if (!record) {
      throw new TaskServiceError("not_found", `bus message not leased/ackable: ${input.messageId}`);
    }
    return record;
  }

  getBusMessage(messageId: string): BusMessageRecord | null {
    return this.store.getBusMessage(requireNonEmpty(messageId, "messageId"));
  }
}

export function createTaskService(params?: {
  dbPath?: string;
  store?: TaskStore;
  now?: () => number;
}): TaskService {
  const store = params?.store ?? createTaskStore({ dbPath: params?.dbPath });
  return new TaskService(store, params?.now ?? (() => Date.now()));
}
