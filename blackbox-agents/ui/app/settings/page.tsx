"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useWs } from "@/lib/ws";

const CONFIGURED = "***";

type BotSettings = {
  token: string;
  secondaryId: string;
  tokenConfigured: boolean;
};

export default function SettingsPage() {
  const { request, connected } = useWs();

  const [telegram, setTelegram] = useState<BotSettings>({
    token: "",
    secondaryId: "",
    tokenConfigured: false,
  });
  const [discord, setDiscord] = useState<BotSettings>({
    token: "",
    secondaryId: "",
    tokenConfigured: false,
  });
  const [saving, setSaving] = useState<"telegram" | "discord" | null>(null);
  const [detectingChatId, setDetectingChatId] = useState(false);

  useEffect(() => {
    if (!connected) {
      return;
    }
    request<Record<string, string>>("settings.getAll")
      .then((data) => {
        setTelegram({
          token: data["telegram_token"] ? CONFIGURED : "",
          secondaryId: data["telegram_chat_id"] ?? "",
          tokenConfigured: !!data["telegram_token"],
        });
        setDiscord({
          token: data["discord_token"] ? CONFIGURED : "",
          secondaryId: data["discord_channel_id"] ?? "",
          tokenConfigured: !!data["discord_token"],
        });
      })
      .catch(console.error);
  }, [connected, request]);

  const saveTelegram = async () => {
    setSaving("telegram");
    const updates: Record<string, string> = {
      telegram_chat_id: telegram.secondaryId,
    };
    // Only send token if user typed a new one (not the masked placeholder)
    if (telegram.token !== CONFIGURED) {
      updates["telegram_token"] = telegram.token;
    }
    try {
      await request("settings.update", updates);
      if (updates["telegram_token"] !== undefined) {
        setTelegram((prev) => ({
          ...prev,
          tokenConfigured: !!updates["telegram_token"],
          token: updates["telegram_token"] ? CONFIGURED : "",
        }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const clearTelegramToken = async () => {
    try {
      await request("settings.update", { telegram_token: "" });
      setTelegram((prev) => ({ ...prev, token: "", tokenConfigured: false }));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const detectTelegramChatId = async () => {
    setDetectingChatId(true);
    try {
      // Pass the token if the user has typed a new one (not yet saved)
      const params =
        telegram.token && telegram.token !== CONFIGURED ? { token: telegram.token } : {};
      const result = await request<{ chatId: string; name: string }>(
        "settings.telegram.detectChatId",
        params,
      );
      setTelegram((prev) => ({ ...prev, secondaryId: result.chatId }));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDetectingChatId(false);
    }
  };

  const saveDiscord = async () => {
    setSaving("discord");
    const updates: Record<string, string> = {
      discord_channel_id: discord.secondaryId,
    };
    if (discord.token !== CONFIGURED) {
      updates["discord_token"] = discord.token;
    }
    try {
      await request("settings.update", updates);
      if (updates["discord_token"] !== undefined) {
        setDiscord((prev) => ({
          ...prev,
          tokenConfigured: !!updates["discord_token"],
          token: updates["discord_token"] ? CONFIGURED : "",
        }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  const clearDiscordToken = async () => {
    try {
      await request("settings.update", { discord_token: "" });
      setDiscord((prev) => ({ ...prev, token: "", tokenConfigured: false }));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global configuration for Blackbox Agents.
          </p>
        </div>

        {/* Telegram */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Telegram</CardTitle>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                  telegram.tokenConfigured
                    ? "text-green-400 border-green-500/30 bg-green-500/10"
                    : "text-zinc-500 border-zinc-700 bg-zinc-800/50"
                }`}
              >
                {telegram.tokenConfigured ? "Configured" : "Not configured"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bot Token</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={
                    telegram.tokenConfigured ? "configured (hidden)" : "1234567890:ABC..."
                  }
                  value={telegram.token === CONFIGURED ? "" : telegram.token}
                  onChange={(e) => setTelegram((prev) => ({ ...prev, token: e.target.value }))}
                  className="text-xs font-mono"
                />
                {telegram.tokenConfigured && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                    onClick={() => void clearTelegramToken()}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Chat ID</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="-1001234567890"
                  value={telegram.secondaryId}
                  onChange={(e) =>
                    setTelegram((prev) => ({ ...prev, secondaryId: e.target.value }))
                  }
                  className="text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs shrink-0"
                  onClick={() => void detectTelegramChatId()}
                  disabled={detectingChatId || (!telegram.tokenConfigured && !telegram.token)}
                  title="Send any message to your bot first, then click Detect"
                >
                  {detectingChatId ? "Detecting…" : "Detect"}
                </Button>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => void saveTelegram()}
                disabled={saving === "telegram"}
              >
                {saving === "telegram" ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Send <span className="font-mono">@agent-name message</span> in the chat to talk to an
              agent. To find your Chat ID: send any message to the bot, then click{" "}
              <span className="font-mono">Detect</span>.
            </p>
          </CardContent>
        </Card>

        {/* Discord */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Discord</CardTitle>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                  discord.tokenConfigured
                    ? "text-green-400 border-green-500/30 bg-green-500/10"
                    : "text-zinc-500 border-zinc-700 bg-zinc-800/50"
                }`}
              >
                {discord.tokenConfigured ? "Configured" : "Not configured"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bot Token</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={discord.tokenConfigured ? "configured (hidden)" : "MTA1..."}
                  value={discord.token === CONFIGURED ? "" : discord.token}
                  onChange={(e) => setDiscord((prev) => ({ ...prev, token: e.target.value }))}
                  className="text-xs font-mono"
                />
                {discord.tokenConfigured && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                    onClick={() => void clearDiscordToken()}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel ID</Label>
              <Input
                placeholder="1234567890123456789"
                value={discord.secondaryId}
                onChange={(e) => setDiscord((prev) => ({ ...prev, secondaryId: e.target.value }))}
                className="text-xs font-mono"
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => void saveDiscord()}
                disabled={saving === "discord"}
              >
                {saving === "discord" ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Requires <span className="font-mono">MESSAGE_CONTENT</span> privileged intent enabled
              in Discord Dev Portal.
            </p>
          </CardContent>
        </Card>

        {/* Server info */}
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
      </div>
    </div>
  );
}
