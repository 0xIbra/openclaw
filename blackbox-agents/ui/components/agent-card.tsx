"use client";

import { Bot, Play, Square, RotateCcw, Zap } from "lucide-react";
import Link from "next/link";
import type { Agent } from "@/lib/types";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useWs } from "@/lib/ws";

type Props = {
  agent: Agent;
  onUpdate?: () => void;
};

export function AgentCard({ agent, onUpdate }: Props) {
  const { request } = useWs();

  const start = async () => {
    await request("agents.start", { id: agent.id });
    onUpdate?.();
  };

  const stop = async () => {
    await request("agents.stop", { id: agent.id });
    onUpdate?.();
  };

  const restart = async () => {
    await request("agents.restart", { id: agent.id });
    onUpdate?.();
  };

  const interrupt = async () => {
    await request("agents.interrupt", { id: agent.id });
  };

  return (
    <Card className="group hover:border-zinc-700 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center">
              <Bot className="h-4 w-4 text-zinc-400" />
            </div>
            <div>
              <Link
                href={`/agents/${agent.id}`}
                className="font-medium text-sm hover:text-primary transition-colors"
              >
                {agent.name}
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5">{agent.type}</p>
            </div>
          </div>
          <StatusDot status={agent.status} showLabel />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground font-mono truncate mb-4">
          {agent.workspaceDir.replace(process.env.HOME ?? "", "~")}
        </p>

        <div className="flex items-center gap-1.5">
          {agent.status === "offline" ? (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={start}>
              <Play className="h-3 w-3" /> Start
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={stop}>
                <Square className="h-3 w-3" /> Stop
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={restart}>
                <RotateCcw className="h-3 w-3" /> Restart
              </Button>
              {agent.status === "working" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1.5 text-amber-400 hover:text-amber-300"
                  onClick={interrupt}
                >
                  <Zap className="h-3 w-3" /> Interrupt
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
