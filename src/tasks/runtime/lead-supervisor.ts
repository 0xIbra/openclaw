import type {
  TaskLead,
  TaskLeadEvent,
  TaskLeadOptions,
  TaskLeadStatus,
  TaskLeadSupervisor,
  TaskLeadSupervisorOptions,
} from "./types.js";
import { TASK_LEAD_RECONCILE_MS, TASK_LEAD_UNHEALTHY_THRESHOLD_MS } from "./defaults.js";
import { createTaskLead } from "./lead.js";
import { createLLMTaskLead } from "./llm-lead.js";

type TeamLeadBinding = {
  teamId: string;
  teamName: string;
  leadAgentId: string;
};

function mapActiveTeamLeads(
  taskService: TaskLeadSupervisorOptions["taskService"],
): Map<string, TeamLeadBinding> {
  const active = new Map<string, TeamLeadBinding>();
  for (const team of taskService.listTeams({ includeArchived: false })) {
    const leadAgentId = team.leadAgentId?.trim();
    if (!leadAgentId) {
      continue;
    }
    active.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      leadAgentId,
    });
  }
  return active;
}

export function createTaskLeadSupervisor(options: TaskLeadSupervisorOptions): TaskLeadSupervisor {
  const reconcileIntervalMs = Math.max(
    1_000,
    Math.floor(options.reconcileIntervalMs ?? TASK_LEAD_RECONCILE_MS),
  );
  const defaultLeadFactory = options.useLLMLead
    ? (opts: TaskLeadOptions) => createLLMTaskLead(opts)
    : (opts: TaskLeadOptions) => createTaskLead(opts);
  const createLead = options.createLead ?? defaultLeadFactory;
  const leads = new Map<string, TaskLead>();
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;
  let reconcilePromise: Promise<void> | null = null;
  let reconcilePending = false;
  let stopping = false;

  const emitLead = (event: TaskLeadEvent) => {
    options.onLeadEvent?.(event);
    if (event.reason === "escalated") {
      options.onEscalation?.({
        ...event.payload,
        teamId: event.lead.teamId,
        leadAgentId: event.lead.leadAgentId,
      });
    }
  };

  const runReconcile = async () => {
    const active = mapActiveTeamLeads(options.taskService);
    for (const [teamId, binding] of active.entries()) {
      const existing = leads.get(teamId);
      if (existing) {
        continue;
      }
      const lead = createLead({
        taskService: options.taskService,
        config: options.config,
        teamId: binding.teamId,
        teamName: binding.teamName,
        leadAgentId: binding.leadAgentId,
        questionAnswerer: options.questionAnswerer,
        onEvent: emitLead,
      });
      leads.set(teamId, lead);
      lead.start();
      emitLead({
        reason: "started",
        lead: lead.getStatus(),
      });
    }

    // Health check: stop stale leads so they get recreated next cycle
    for (const [teamId, lead] of leads.entries()) {
      const leadStatus = lead.getStatus();
      // Skip leads that haven't had a chance to poll yet
      if (leadStatus.lastPolledAtMs == null) {
        continue;
      }
      const staleMs = Date.now() - leadStatus.lastPolledAtMs;
      if (leadStatus.state === "paused" || staleMs > TASK_LEAD_UNHEALTHY_THRESHOLD_MS) {
        await lead.stop();
        emitLead({
          reason: "stopped",
          lead: lead.getStatus(),
        });
        leads.delete(teamId);
        // Will be recreated on next reconcile cycle
      }
    }

    const activeTeamIds = new Set(active.keys());
    for (const [teamId, lead] of leads.entries()) {
      if (activeTeamIds.has(teamId)) {
        continue;
      }
      await lead.stop();
      emitLead({
        reason: "stopped",
        lead: lead.getStatus(),
      });
      leads.delete(teamId);
    }
  };

  const reconcileLeads = async () => {
    if (stopping) {
      return;
    }
    if (reconcilePromise) {
      reconcilePending = true;
      await reconcilePromise;
      return;
    }
    do {
      reconcilePending = false;
      reconcilePromise = runReconcile();
      try {
        await reconcilePromise;
      } finally {
        reconcilePromise = null;
      }
    } while (reconcilePending && !stopping);
  };

  return {
    start: () => {
      if (reconcileTimer) {
        return;
      }
      stopping = false;
      void reconcileLeads();
      reconcileTimer = setInterval(() => {
        void reconcileLeads();
      }, reconcileIntervalMs);
      reconcileTimer.unref?.();
    },
    stop: async () => {
      stopping = true;
      if (reconcileTimer) {
        clearInterval(reconcileTimer);
        reconcileTimer = null;
      }
      if (reconcilePromise) {
        await reconcilePromise;
      }
      for (const [teamId, lead] of leads.entries()) {
        await lead.stop();
        emitLead({
          reason: "stopped",
          lead: lead.getStatus(),
        });
        leads.delete(teamId);
      }
    },
    getLeadStatuses: (): TaskLeadStatus[] => [...leads.values()].map((lead) => lead.getStatus()),
    reconcileNow: async () => {
      await reconcileLeads();
    },
  };
}
