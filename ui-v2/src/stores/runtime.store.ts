import { create } from "zustand";
import type { TaskRuntimeWorkerDto, TaskRuntimeLeadDto, TaskEscalationDto } from "@/types";
import { registerGatewayEventHandler } from "./gateway.store";

type RuntimeState = {
  workers: TaskRuntimeWorkerDto[];
  leads: TaskRuntimeLeadDto[];
  escalations: TaskEscalationDto[];
  loading: boolean;
  // Actions
  load: () => Promise<void>;
  pauseWorker: (agentId: string) => Promise<void>;
  resumeWorker: (agentId: string) => Promise<void>;
  restartWorker: (agentId: string) => Promise<void>;
};

function patchWorker(
  workers: TaskRuntimeWorkerDto[],
  patch: Partial<TaskRuntimeWorkerDto> & { agentId: string },
): TaskRuntimeWorkerDto[] {
  const idx = workers.findIndex((w) => w.agentId === patch.agentId);
  if (idx === -1) {
    return workers;
  }
  const updated = [...workers];
  updated[idx] = { ...updated[idx], ...patch };
  return updated;
}

function upsertWorker(
  workers: TaskRuntimeWorkerDto[],
  worker: TaskRuntimeWorkerDto,
): TaskRuntimeWorkerDto[] {
  const idx = workers.findIndex((w) => w.agentId === worker.agentId);
  if (idx === -1) {
    return [...workers, worker];
  }
  const updated = [...workers];
  updated[idx] = worker;
  return updated;
}

function upsertLead(leads: TaskRuntimeLeadDto[], lead: TaskRuntimeLeadDto): TaskRuntimeLeadDto[] {
  const idx = leads.findIndex((l) => l.teamId === lead.teamId);
  if (idx === -1) {
    return [...leads, lead];
  }
  const updated = [...leads];
  updated[idx] = lead;
  return updated;
}

export const useRuntimeStore = create<RuntimeState>((set) => {
  registerGatewayEventHandler((evt) => {
    if (evt.event === "tasks.worker.changed") {
      const payload = evt.payload as { worker?: TaskRuntimeWorkerDto } | undefined;
      if (payload?.worker) {
        set((s) => ({ workers: upsertWorker(s.workers, payload.worker!) }));
      }
    }
    if (evt.event === "tasks.lead.changed") {
      const payload = evt.payload as { lead?: TaskRuntimeLeadDto } | undefined;
      if (payload?.lead) {
        set((s) => ({ leads: upsertLead(s.leads, payload.lead!) }));
      }
    }
    if (evt.event === "tasks.escalated") {
      const payload = evt.payload as TaskEscalationDto | undefined;
      if (payload?.teamId) {
        set((s) => ({
          escalations: [
            payload,
            ...s.escalations.filter((e) => e.threadId !== payload.threadId),
          ].slice(0, 50),
        }));
      }
    }
    if (evt.event === "tasks.escalation.resolved") {
      const payload = evt.payload as { threadId?: string } | undefined;
      if (payload?.threadId) {
        set((s) => ({ escalations: s.escalations.filter((e) => e.threadId !== payload.threadId) }));
      }
    }
  });

  return {
    workers: [],
    leads: [],
    escalations: [],
    loading: false,

    load: async () => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      set({ loading: true });
      try {
        const result = await client.request<{
          workers: TaskRuntimeWorkerDto[];
          leads: TaskRuntimeLeadDto[];
        }>("tasks.runtime.status", {});
        set({ workers: result.workers ?? [], leads: result.leads ?? [] });
      } catch (err) {
        console.error("[runtime] load failed:", err);
      } finally {
        set({ loading: false });
      }
    },

    pauseWorker: async (agentId) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      set((s) => ({ workers: patchWorker(s.workers, { agentId, state: "paused" }) }));
      await client.request("tasks.runtime.pauseAgent", { agentId });
    },

    resumeWorker: async (agentId) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      set((s) => ({ workers: patchWorker(s.workers, { agentId, state: "idle" }) }));
      await client.request("tasks.runtime.resumeAgent", { agentId });
    },

    restartWorker: async (agentId) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      await client.request("tasks.runtime.restartAgent", { agentId });
    },
  };
});
