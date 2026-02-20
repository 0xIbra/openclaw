/**
 * Ares Master Control Runtime
 *
 * Executes classified intents against the task/project services.
 */

import type { AresContext, AresIntent, AresResult, AresRuntime } from "./types.js";
import { callGatewayTool } from "../tools/gateway.js";
import { classifyIntent, shouldHandleAsAres } from "./intents.js";

function formatTeam(team: {
  id: string;
  name: string;
  description?: string;
  leadAgentId: string | null;
}): string {
  const lead = team.leadAgentId ? `led by ${team.leadAgentId}` : "no lead assigned";
  const desc = team.description ? ` - ${team.description}` : "";
  return `• **${team.name}** (${lead})${desc}`;
}

function formatProject(project: {
  id: string;
  name: string;
  description?: string;
  repoRoot?: string;
}): string {
  const repo = project.repoRoot ? ` @ ${project.repoRoot}` : "";
  const desc = project.description ? ` - ${project.description}` : "";
  return `• **${project.name}**${repo}${desc}`;
}

function formatTask(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedAgentId: string | null;
}): string {
  const assignee = task.assignedAgentId ? ` → ${task.assignedAgentId}` : " (unassigned)";
  return `• [${task.status}] **${task.title}** (${task.priority})${assignee}`;
}

async function executeTeamCreate(
  intent: Extract<AresIntent, { type: "team_create" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    // Generate suggested lead agent ID if not provided
    const suggestedLead =
      intent.leadAgentId ?? `${intent.name.toLowerCase().replace(/\s+/g, "-")}-lead`;

    const result = await callGatewayTool<{ team: { name: string; leadAgentId: string | null } }>(
      "teams.create",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        name: intent.name,
        description: intent.description,
        leadAgentId: suggestedLead,
      },
    );

    return {
      ok: true,
      message: `Created team "${result.team.name}" with lead agent "${result.team.leadAgentId ?? suggestedLead}".\n\nNext steps:\n1. Add member agents: \`Add ${suggestedLead.replace("-lead", "-impl")} to ${intent.name} team\`\n2. Create tasks for the team: \`Create a task in <project> for ${intent.name} team\``,
      data: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already exists")) {
      return {
        ok: false,
        error: `A team named "${intent.name}" already exists.`,
        suggestion: "Use a different name or update the existing team.",
      };
    }
    return { ok: false, error: `Failed to create team: ${message}` };
  }
}

async function executeTeamList(context: AresContext): Promise<AresResult> {
  try {
    const result = await callGatewayTool(
      "teams.list",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {},
    );

    const teams = result.teams as Array<{
      id: string;
      name: string;
      description?: string;
      leadAgentId: string | null;
    }>;

    if (teams.length === 0) {
      return {
        ok: true,
        message: "No teams exist yet. Create one with: `Create a team called <name>`",
      };
    }

    const lines = [`**${teams.length} team(s):**`, ""];
    for (const team of teams) {
      lines.push(formatTeam(team));
    }
    lines.push("");
    lines.push("To see details: `Show me the <team-name> team`");

    return { ok: true, message: lines.join("\n"), data: result };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to list teams: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTeamGet(
  intent: Extract<AresIntent, { type: "team_get" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    let team: {
      id: string;
      name: string;
      description?: string;
      leadAgentId: string | null;
    } | null = null;
    let members: Array<{ teamId: string; agentId: string; role: string }> = [];

    if (intent.id) {
      const result = await callGatewayTool<{
        team: { id: string; name: string; description?: string; leadAgentId: string | null } | null;
        members?: Array<{ teamId: string; agentId: string; role: string }>;
      }>(
        "teams.get",
        { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
        { id: intent.id },
      );
      team = result.team;
      members = result.members ?? [];
    } else if (intent.name) {
      const result = await callGatewayTool<{
        team: { id: string; name: string; description?: string; leadAgentId: string | null } | null;
        members?: Array<{ teamId: string; agentId: string; role: string }>;
      }>(
        "teams.getByName",
        { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
        { name: intent.name },
      );
      team = result.team;
      members = result.members ?? [];
    } else {
      return { ok: false, error: "Need either team ID or name to look up." };
    }

    if (!team) {
      return {
        ok: false,
        error: `Team not found.`,
        suggestion: "Check the name or list all teams with `List teams`",
      };
    }

    const lines = [`**${team.name}**`, `ID: \`${team.id}\``, `Lead: ${team.leadAgentId ?? "none"}`];

    if (team.description) {
      lines.push(`Description: ${team.description}`);
    }

    if (members.length > 0) {
      lines.push("", `**Members (${members.length}):**`);
      for (const member of members) {
        lines.push(`• ${member.agentId} (${member.role})`);
      }
    }

    return { ok: true, message: lines.join("\n"), data: { team, members } };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to get team: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTeamUpdate(
  intent: Extract<AresIntent, { type: "team_update" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool<{ team: { name: string } }>(
      "teams.update",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        id: intent.id,
        ...(intent.updates.name !== undefined && { name: intent.updates.name }),
        ...(intent.updates.description !== undefined && {
          description: intent.updates.description,
        }),
        ...(intent.updates.leadAgentId !== undefined && {
          leadAgentId: intent.updates.leadAgentId,
        }),
      },
    );

    return {
      ok: true,
      message: `Updated team "${result.team.name}".`,
      data: result,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to update team: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTeamDelete(
  intent: Extract<AresIntent, { type: "team_delete" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool<{ team: { name: string } }>(
      "teams.delete",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      { id: intent.id },
    );

    return {
      ok: true,
      message: `Archived team "${result.team.name}".`,
      data: result,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to delete team: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTeamAddMember(
  intent: Extract<AresIntent, { type: "team_add_member" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool(
      "teams.members.add",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        teamId: intent.teamId,
        agentId: intent.agentId,
        role: intent.role,
      },
    );

    return {
      ok: true,
      message: `Added ${intent.agentId} to team as ${intent.role}.`,
      data: result,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to add member: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTeamRemoveMember(
  intent: Extract<AresIntent, { type: "team_remove_member" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool(
      "teams.members.remove",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        teamId: intent.teamId,
        agentId: intent.agentId,
      },
    );

    return {
      ok: true,
      message: `Removed ${intent.agentId} from team.`,
      data: result,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to remove member: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTaskCreate(
  intent: Extract<AresIntent, { type: "task_create" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool<{ id: string; title: string; status: string }>(
      "tasks.create",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        projectId: intent.projectId,
        title: intent.title,
        description: intent.description,
        type: intent.taskType,
      },
    );

    return {
      ok: true,
      message: `Created task "${result.title}" (${result.id}) in project ${intent.projectId}.\n\nStatus: ${result.status}`,
      data: result,
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTaskList(
  intent: Extract<AresIntent, { type: "task_list" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool(
      "tasks.list",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        ...(intent.filters?.projectId && { projectId: intent.filters.projectId }),
        ...(intent.filters?.status && { status: intent.filters.status }),
        ...(intent.filters?.assignedAgentId && { assignedAgentId: intent.filters.assignedAgentId }),
      },
    );

    const tasks = result.tasks as Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      assignedAgentId: string | null;
    }>;

    if (tasks.length === 0) {
      return { ok: true, message: "No tasks found matching your criteria." };
    }

    const lines = [`**${tasks.length} task(s):**`, ""];
    for (const task of tasks) {
      lines.push(formatTask(task));
    }

    return { ok: true, message: lines.join("\n"), data: result };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTaskGet(
  intent: Extract<AresIntent, { type: "task_get" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool<{
      task: {
        id: string;
        title: string;
        description?: string;
        status: string;
        priority: string;
        assignedAgentId: string | null;
        type: string;
        createdAtMs: number;
        updatedAtMs?: number;
      } | null;
    }>(
      "tasks.get",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      { id: intent.id },
    );

    if (!result.task) {
      return {
        ok: false,
        error: `Task "${intent.id}" not found.`,
        suggestion: "Check the task ID or list tasks with `List tasks`",
      };
    }

    const task = result.task;
    const lines = [
      `**${task.title}**`,
      `ID: \`${task.id}\``,
      `Status: ${task.status}`,
      `Priority: ${task.priority}`,
      `Type: ${task.type}`,
      `Assignee: ${task.assignedAgentId ?? "unassigned"}`,
    ];

    if (task.description) {
      lines.push("", `**Description:**`, task.description);
    }

    return { ok: true, message: lines.join("\n"), data: result };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeTaskAssign(
  intent: Extract<AresIntent, { type: "task_assign" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool<{
      task: {
        id: string;
        title: string;
        assignedAgentId: string | null;
        status: string;
      };
    }>(
      "tasks.update",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        id: intent.taskId,
        assignedAgentId: intent.assignedAgentId,
      },
    );

    return {
      ok: true,
      message: `Assigned task "${result.task.title}" (${result.task.id}) to ${intent.assignedAgentId}.`,
      data: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      return {
        ok: false,
        error: `Task "${intent.taskId}" not found.`,
        suggestion: "Check the task ID or list tasks with `List tasks`",
      };
    }
    return { ok: false, error: `Failed to assign task: ${message}` };
  }
}

async function executeProjectGet(
  intent: Extract<AresIntent, { type: "project_get" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    let project: {
      id: string;
      name: string;
      description?: string;
      repoRoot?: string;
    } | null = null;

    if (intent.id) {
      const result = await callGatewayTool<{
        project: {
          id: string;
          name: string;
          description?: string;
          repoRoot?: string;
        } | null;
      }>(
        "projects.get",
        { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
        { id: intent.id },
      );
      project = result.project;
    } else if (intent.name) {
      // Try to find by name using list
      const result = await callGatewayTool<{
        projects: Array<{
          id: string;
          name: string;
          description?: string;
          repoRoot?: string;
        }>;
      }>(
        "projects.list",
        { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
        {},
      );
      project =
        result.projects.find((p) => p.name.toLowerCase() === intent.name?.toLowerCase()) ?? null;
    } else {
      return { ok: false, error: "Need either project ID or name to look up." };
    }

    if (!project) {
      return {
        ok: false,
        error: `Project not found.`,
        suggestion: "Check the name or list all projects with `List projects`",
      };
    }

    const lines = [`**${project.name}**`, `ID: \`${project.id}\``];

    if (project.description) {
      lines.push(`Description: ${project.description}`);
    }

    if (project.repoRoot) {
      lines.push(`Repo: ${project.repoRoot}`);
    }

    return { ok: true, message: lines.join("\n"), data: { project } };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to get project: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeProjectCreate(
  intent: Extract<AresIntent, { type: "project_create" }>,
  context: AresContext,
): Promise<AresResult> {
  try {
    const result = await callGatewayTool<{ id: string; name: string }>(
      "projects.create",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {
        name: intent.name,
        description: intent.description,
        repoRoot: intent.repoRoot,
      },
    );

    const lines = [
      `Created project "${result.name}" (${result.id}).`,
      "",
      "Next steps:",
      `1. Create tasks: \`Create a task in ${intent.name} to implement X\``,
      `2. Assign to team: \`Assign the first task to the backend team\``,
    ];

    return { ok: true, message: lines.join("\n"), data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("already exists")) {
      return {
        ok: false,
        error: `A project named "${intent.name}" already exists.`,
        suggestion: "Use a different name or use the existing project.",
      };
    }
    return { ok: false, error: `Failed to create project: ${message}` };
  }
}

async function executeProjectList(context: AresContext): Promise<AresResult> {
  try {
    const result = await callGatewayTool(
      "projects.list",
      { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
      {},
    );

    const projects = result.projects as Array<{
      id: string;
      name: string;
      description?: string;
      repoRoot?: string;
    }>;

    if (projects.length === 0) {
      return {
        ok: true,
        message: "No projects exist yet. Create one with: `Create a project called <name>`",
      };
    }

    const lines = [`**${projects.length} project(s):**`, ""];
    for (const project of projects) {
      lines.push(formatProject(project));
    }

    return { ok: true, message: lines.join("\n"), data: result };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeStatusOverview(context: AresContext): Promise<AresResult> {
  try {
    // Fetch all data in parallel
    const [teamsResult, projectsResult] = await Promise.all([
      callGatewayTool(
        "teams.list",
        { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
        {},
      ),
      callGatewayTool(
        "projects.list",
        { gatewayUrl: context.gatewayUrl, gatewayToken: context.gatewayToken },
        {},
      ),
    ]);

    const teams = teamsResult.teams as Array<{
      id: string;
      name: string;
      leadAgentId: string | null;
    }>;
    const projects = projectsResult.projects as Array<{ id: string; name: string }>;

    const lines = [
      "🛡️ **OpenClaw System Overview**",
      "",
      `**Teams:** ${teams.length}`,
      ...teams.map((t) => `  • ${t.name} (${t.leadAgentId ? "has lead" : "no lead"})`),
      "",
      `**Projects:** ${projects.length}`,
      ...projects.map((p) => `  • ${p.name}`),
      "",
      "**Quick actions:**",
      "• `Create a team called <name>`",
      "• `Create a project called <name>`",
      "• `Show me the status of <team-name>`",
    ];

    return { ok: true, message: lines.join("\n"), data: { teams, projects } };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function executeHelp(intent: Extract<AresIntent, { type: "help" }>): Promise<AresResult> {
  const topic = intent.topic?.toLowerCase();

  if (topic === "teams") {
    return {
      ok: true,
      message: [
        "**Team Management**",
        "",
        "Teams consist of a lead agent and member agents. The lead decomposes work and delegates to members.",
        "",
        "Commands:",
        "• `Create a team called <name>` - Create new team",
        "• `List teams` - Show all teams",
        "• `Add <agent-id> to <team> team as lead/member` - Add member",
        "• `Remove <agent-id> from <team> team` - Remove member",
        "• `Delete team <name>` - Archive team",
      ].join("\n"),
    };
  }

  if (topic === "tasks") {
    return {
      ok: true,
      message: [
        "**Task Management**",
        "",
        "Tasks flow through states: backlog → assigned → running → review → done",
        "",
        "Commands:",
        "• `Create a task in <project> titled <title>` - Create task",
        "• `List tasks in <project>` - Show tasks",
        "• `Assign task <id> to <agent>` - Assign task",
      ].join("\n"),
    };
  }

  return {
    ok: true,
    message: [
      "🛡️ **Ares - OpenClaw Master Control**",
      "",
      "I help you manage teams, projects, and tasks through natural language.",
      "",
      "**Topics:**",
      "• Teams - Team creation and management",
      "• Tasks - Task creation and assignment",
      "",
      "**Examples:**",
      "• `Create a backend team with a lead and 2 implementers`",
      "• `Create a project called my-api at /path/to/repo`",
      "• `Create a task to implement auth in my-api`",
      "• `Give that task to the backend team`",
    ].join("\n"),
  };
}

/**
 * Execute a classified intent
 */
async function executeIntent(intent: AresIntent, context: AresContext): Promise<AresResult> {
  switch (intent.type) {
    case "team_create":
      return executeTeamCreate(intent, context);
    case "team_list":
      return executeTeamList(context);
    case "team_get":
      return executeTeamGet(intent, context);
    case "team_update":
      return executeTeamUpdate(intent, context);
    case "team_delete":
      return executeTeamDelete(intent, context);
    case "team_add_member":
      return executeTeamAddMember(intent, context);
    case "team_remove_member":
      return executeTeamRemoveMember(intent, context);
    case "task_create":
      return executeTaskCreate(intent, context);
    case "task_list":
      return executeTaskList(intent, context);
    case "task_get":
      return executeTaskGet(intent, context);
    case "task_assign":
      return executeTaskAssign(intent, context);
    case "project_create":
      return executeProjectCreate(intent, context);
    case "project_list":
      return executeProjectList(context);
    case "project_get":
      return executeProjectGet(intent, context);
    case "status_overview":
      return executeStatusOverview(context);
    case "help":
      return executeHelp(intent);
    case "unknown":
      return {
        ok: false,
        error: "I didn't understand that request.",
        suggestion: "Try: `Create a team called backend` or `Show me the status`",
      };
    default:
      return {
        ok: false,
        error: `Unknown intent type: ${(intent as { type: string }).type}`,
      };
  }
}

/**
 * Create Ares runtime instance
 */
export function createAresRuntime(): AresRuntime {
  return {
    processMessage: async (message: string, context: AresContext): Promise<AresResult> => {
      // Check if this should be handled by Ares
      if (!shouldHandleAsAres(message)) {
        return {
          ok: false,
          error: "Not an Ares request",
        };
      }

      // Classify the intent
      const classification = await classifyIntent(message, context);

      if (!classification) {
        return {
          ok: false,
          error: "Could not understand the request.",
          suggestion: "Try being more specific, e.g., 'Create a team called backend'",
        };
      }

      // Execute the intent
      return executeIntent(classification.intent, context);
    },
  };
}

// Export singleton instance
export const ares = createAresRuntime();
