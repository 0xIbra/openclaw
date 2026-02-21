import { create } from "zustand";
import type { GatewayAgentRow } from "@/types";

type AgentsState = {
  agents: GatewayAgentRow[];
  loading: boolean;
  // Actions
  load: () => Promise<void>;
};

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  loading: false,

  load: async () => {
    const { useGatewayStore } = await import("./gateway.store");
    const client = useGatewayStore.getState().client;
    if (!client) {
      return;
    }
    set({ loading: true });
    try {
      const result = await client.request<{ agents: GatewayAgentRow[] }>("agents.list", {});
      set({ agents: result.agents ?? [] });
    } catch (err) {
      console.error("[agents] load failed:", err);
    } finally {
      set({ loading: false });
    }
  },
}));
