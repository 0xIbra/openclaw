import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { AgentsPage } from "@/pages/Agents";
import { BoardPage } from "@/pages/Board";
import { BusPage } from "@/pages/Bus";
import { ChatPage } from "@/pages/Chat";
// Pages
import { DashboardPage } from "@/pages/Dashboard";
import { ProjectsPage } from "@/pages/Projects";
import { SettingsPage } from "@/pages/Settings";
import { TeamsPage } from "@/pages/Teams";
import {
  useGatewayStore,
  useTasksStore,
  useRuntimeStore,
  useTeamsStore,
  useProjectsStore,
  useAgentsStore,
} from "@/stores";

function AppInner() {
  const connect = useGatewayStore((s) => s.connect);
  const gatewayUrl = useGatewayStore((s) => s.gatewayUrl);
  const status = useGatewayStore((s) => s.status);
  const prevStatusRef = useRef<string>("");

  // Auto-connect on mount
  useEffect(() => {
    if (gatewayUrl) {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load data when connected
  useEffect(() => {
    if (status === "connected" && prevStatusRef.current !== "connected") {
      void useTasksStore.getState().load();
      void useRuntimeStore.getState().load();
      void useTeamsStore.getState().load();
      void useProjectsStore.getState().load();
      void useAgentsStore.getState().load();
    }
    prevStatusRef.current = status;
  }, [status]);

  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Chat gets the full height without padding */}
        <Route path="/chat" element={<ChatPage />} />
        {/* All other pages get a padded scrollable wrapper */}
        <Route
          element={
            <div className="flex-1 overflow-y-auto p-6">
              <Outlet />
            </div>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/bus" element={<BusPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter basename="/opengrid">
      <AppInner />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#0d0d1a",
            border: "1px solid #1a1a3e",
            color: "#e2e8f0",
          },
        }}
      />
    </BrowserRouter>
  );
}
