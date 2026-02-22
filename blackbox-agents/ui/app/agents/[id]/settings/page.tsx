"use client";

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { use, useState, useEffect } from "react";
import type { AgentAuth } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAgents, useWs } from "@/lib/ws";

type AuthType = "claude-subscription" | "claude-openrouter" | "kimi-api";

export default function AgentSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { agents, refetch } = useAgents();
  const { request } = useWs();
  const agent = agents.find((a) => a.id === id);

  const [authType, setAuthType] = useState<AuthType>("claude-subscription");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!agent) {
      return;
    }
    setWorkspaceDir(agent.workspaceDir);
    const auth = agent.auth;
    setAuthType(auth.type);
    if (auth.type === "claude-openrouter") {
      setApiKey(auth.apiKey);
      setBaseUrl(auth.baseUrl ?? "");
      setModel(auth.model ?? "");
    } else if (auth.type === "kimi-api") {
      setApiKey(auth.apiKey);
    }
  }, [agent]);

  if (!agent) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Agent not found.</p>
      </div>
    );
  }

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

  const save = async () => {
    if (authType !== "claude-subscription" && !apiKey) {
      setError("API key is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await request("agents.update", {
        id,
        auth: buildAuth(),
        workspaceDir: workspaceDir || undefined,
      });
      refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/agents/${id}`}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">{agent.name} · Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{agent.type}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Authentication</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Auth Method</Label>
              <Select value={authType} onValueChange={(v) => setAuthType(v as AuthType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-subscription">Claude Subscription</SelectItem>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Workspace</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Directory</Label>
              <Input
                placeholder="~/.blackbox/agents/name"
                value={workspaceDir}
                onChange={(e) => setWorkspaceDir(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The working directory where this agent operates. Each agent should have its own
                directory.
              </p>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving} className="gap-1.5">
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>

        <Separator />

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete Agent</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete this agent, its tasks and message history.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!confirm("Delete this agent? This cannot be undone.")) {
                    return;
                  }
                  await request("agents.delete", { id });
                  window.location.href = "/agents";
                }}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
