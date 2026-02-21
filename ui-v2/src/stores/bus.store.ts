import { create } from "zustand";
import type { BusMessageDto, BusMessageRecord } from "@/types";
import { registerGatewayEventHandler } from "./gateway.store";

const MAX_MESSAGES = 500;

type BusFilters = {
  senderAgentId: string;
  receiverAgentId: string;
  messageType: string;
  taskId: string;
};

type BusState = {
  messages: BusMessageRecord[];
  filters: BusFilters;
  // Actions
  setFilter: (patch: Partial<BusFilters>) => void;
  clearMessages: () => void;
  pullMessages: () => Promise<void>;
};

export const useBusStore = create<BusState>((set) => {
  registerGatewayEventHandler((evt) => {
    if (evt.event === "bus.message") {
      // A new message is available — pull latest batch
      void useBusStore.getState().pullMessages();
    }
  });

  return {
    messages: [],
    filters: { senderAgentId: "", receiverAgentId: "", messageType: "", taskId: "" },

    setFilter: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),

    clearMessages: () => set({ messages: [] }),

    pullMessages: async () => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      try {
        const result = await client.request<{ messages: BusMessageDto[] }>("bus.pull", {
          limit: 50,
        });
        const pulled = result.messages ?? [];
        if (pulled.length === 0) {
          return;
        }

        // Ack all pulled messages
        const ids = pulled.map((m) => m.id);
        client.request("bus.ack", { ids }).catch(() => {
          // best-effort ack
        });

        // Add to ring buffer (newest first)
        set((s) => {
          const existing = new Set(s.messages.map((m) => m.id));
          const newRecords: BusMessageRecord[] = pulled
            .filter((m) => !existing.has(m.id))
            .map((m) => ({ ...m, _fetchedAtMs: Date.now() }));
          if (newRecords.length === 0) {
            return s;
          }
          const updated = [...newRecords, ...s.messages].slice(0, MAX_MESSAGES);
          return { messages: updated };
        });
      } catch {
        // best-effort
      }
    },
  };
});
