import { create } from "zustand";
import type { ProjectDto } from "@/types";
import { registerGatewayEventHandler } from "./gateway.store";

type ProjectsState = {
  projects: ProjectDto[];
  selectedProjectId: string | null;
  loading: boolean;
  // Actions
  load: () => Promise<void>;
  selectProject: (id: string | null) => void;
};

export const useProjectsStore = create<ProjectsState>((set) => {
  // Register event handler at module init
  registerGatewayEventHandler((evt) => {
    if (evt.event === "projects.changed") {
      // payload: { reason, project }
      const payload = evt.payload as { reason?: string; project?: ProjectDto } | undefined;
      if (payload?.project) {
        set((s) => {
          const idx = s.projects.findIndex((p) => p.id === payload.project!.id);
          if (idx === -1) {
            return { projects: [...s.projects, payload.project!] };
          }
          const updated = [...s.projects];
          updated[idx] = payload.project!;
          return { projects: updated };
        });
      }
    }
  });

  return {
    projects: [],
    selectedProjectId: null,
    loading: false,

    load: async () => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      set({ loading: true });
      try {
        const result = await client.request<{ projects: ProjectDto[] }>("projects.list", {});
        set({ projects: result.projects ?? [] });
      } catch (err) {
        console.error("[projects] load failed:", err);
      } finally {
        set({ loading: false });
      }
    },

    selectProject: (id) => set({ selectedProjectId: id }),
  };
});
