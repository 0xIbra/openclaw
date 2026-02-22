"use client";

import { Bot, CheckSquare, LayoutDashboard, Settings, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWs } from "@/lib/ws";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/tasks", icon: CheckSquare, label: "Tasks" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { connected } = useWs();

  return (
    <aside className="flex flex-col w-[220px] min-h-screen border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="h-7 w-7 rounded bg-primary flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm tracking-wide">Blackbox</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Connection status */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs text-muted-foreground">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs text-muted-foreground">Reconnecting…</span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
