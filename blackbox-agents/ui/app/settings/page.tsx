"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global configuration for Blackbox Agents.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Server</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Backend URL</span>
              <span className="font-mono text-xs">ws://localhost:3001</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Data Directory</span>
              <span className="font-mono text-xs">~/.blackbox</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">About</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>Blackbox Agents — PTY-based supervision layer for Claude Code and Kimi-CLI.</p>
            <p>Spawn, manage, and communicate with AI coding agents remotely.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
