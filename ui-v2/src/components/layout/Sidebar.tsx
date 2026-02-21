import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  FolderKanban,
  Bot,
  Radio,
  MessageSquare,
  Settings,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { ConnectionStatus } from "@/components/gateway/ConnectionStatus";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/board", icon: KanbanSquare, label: "Board" },
  { to: "/teams", icon: Users, label: "Teams" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/agents", icon: Bot, label: "Agents" },
  { to: "/bus", icon: Radio, label: "Message Bus" },
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex flex-col w-56 min-h-screen bg-tron-surface border-r border-tron-border shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-tron-border">
        <span className="font-display text-lg font-bold text-tron-cyan tracking-widest uppercase">
          Opengrid
        </span>
        <div className="text-[10px] text-tron-muted-fg tracking-widest mt-0.5">CONTROL PLANE</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-all duration-150",
                isActive
                  ? "bg-tron-cyan/10 text-tron-cyan border border-tron-cyan/20"
                  : "text-tron-muted-fg hover:text-foreground hover:bg-tron-surface2 border border-transparent",
              )
            }
          >
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Connection status */}
      <div className="px-4 py-3 border-t border-tron-border">
        <ConnectionStatus showLabel />
      </div>
    </aside>
  );
}
