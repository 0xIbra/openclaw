import { create } from "zustand";

type UiState = {
  selectedTaskId: string | null;
  drawerOpen: boolean;
  runtimeSidebarOpen: boolean;
  activeModal: string | null;
  // Actions
  openTaskDrawer: (taskId: string) => void;
  closeTaskDrawer: () => void;
  setRuntimeSidebar: (open: boolean) => void;
  openModal: (id: string) => void;
  closeModal: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  selectedTaskId: null,
  drawerOpen: false,
  runtimeSidebarOpen: false,
  activeModal: null,

  openTaskDrawer: (taskId) => set({ selectedTaskId: taskId, drawerOpen: true }),
  closeTaskDrawer: () => set({ drawerOpen: false, selectedTaskId: null }),
  setRuntimeSidebar: (open) => set({ runtimeSidebarOpen: open }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}));
