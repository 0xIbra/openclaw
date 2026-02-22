"use client";

import { Bot, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { AgentAuth } from "@/lib/types";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgents, useWs } from "@/lib/ws";

type AuthType = "claude-subscription" | "claude-openrouter" | "kimi-api";

export default function AgentsPage() {
  const { agents, loading, refetch } = useAgents();
  const { request } = useWs();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState<"claude-code" | "kimi-cli">("claude-code");
  const [authType, setAuthType] = useState<AuthType>("claude-subscription");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setAgentType("claude-code");
    setAuthType("claude-subscription");
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setWorkspaceDir("");
    setError("");
  };

  const buildAuth = (): AgentAuth => {
    if (authType === "claude-subscription") {
      return { type: "claude-subscription" };
    }
    if (authType === "claude-openrouter") {
      return {
        type: "claude-openrouter",
        apiKey,
        baseUrl: baseUrl || undefined,
        model: model || undefined,
      };
    }
    return { type: "kimi-api", apiKey };
  };

  const create = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (authType !== "claude-subscription" && !apiKey) {
      setError("API key is required");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await request("agents.create", {
        name: name.trim(),
        type: agentType,
        auth: buildAuth(),
        workspaceDir: workspaceDir.trim() || undefined,
        autoStart: true,
      });
      setOpen(false);
      reset();
      refetch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  };

  const deleteAgent = async (id: string) => {
    if (!confirm("Delete this agent and all its data?")) {
      return;
    }
    await request("agents.delete", { id });
    refetch();
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your Claude Code and Kimi-CLI instances.
            </p>
          </div>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) {
                reset();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Agent</DialogTitle>
                <DialogDescription>
                  Configure a new Claude Code or Kimi-CLI instance.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Name</Label>
                    <Input
                      placeholder="gilfoyle"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Type</Label>
                    <Select
                      value={agentType}
                      onValueChange={(v) => setAgentType(v as "claude-code" | "kimi-cli")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-code">Claude Code</SelectItem>
                        <SelectItem value="kimi-cli">Kimi CLI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label>Authentication</Label>
                  <Select value={authType} onValueChange={(v) => setAuthType(v as AuthType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-subscription">
                        Claude Subscription (default)
                      </SelectItem>
                      <SelectItem value="claude-openrouter">Claude via OpenRouter</SelectItem>
                      <SelectItem value="kimi-api">Kimi API Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {authType !== "claude-subscription" && (
                  <div className="grid gap-1.5">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                )}

                {authType === "claude-openrouter" && (
                  <>
                    <div className="grid gap-1.5">
                      <Label>
                        Base URL <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        placeholder="https://openrouter.ai/api/v1"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>
                        Model <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        placeholder="anthropic/claude-sonnet-4-6"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="grid gap-1.5">
                  <Label>
                    Workspace Directory <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    placeholder="~/.blackbox/agents/name"
                    value={workspaceDir}
                    onChange={(e) => setWorkspaceDir(e.target.value)}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={() => void create()} disabled={creating}>
                  {creating ? "Creating…" : "Create & Start"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Agent table */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : agents.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Bot className="h-10 w-10 text-zinc-600 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No agents yet. Create one above.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">
                      Workspace
                    </th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-border last:border-0 hover:bg-accent/20"
                    >
                      <td className="p-3">
                        <Link
                          href={`/agents/${agent.id}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {agent.name}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{agent.type}</td>
                      <td className="p-3">
                        <StatusDot status={agent.status} showLabel />
                      </td>
                      <td className="p-3 text-muted-foreground text-xs font-mono truncate max-w-[180px]">
                        {agent.workspaceDir}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-zinc-600 hover:text-destructive"
                          onClick={() => void deleteAgent(agent.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
