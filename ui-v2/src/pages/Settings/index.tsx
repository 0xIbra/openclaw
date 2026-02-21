import { RefreshCw, Save, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConnectionStatus } from "@/components/gateway/ConnectionStatus";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlowCard } from "@/components/tron/GlowCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGatewayStore } from "@/stores";

// ---- Types for config schema ----
type SchemaProperty = {
  type?: string;
  description?: string;
  title?: string;
  enum?: string[];
  default?: unknown;
};

type ConfigSchema = {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};

// ---- Config section ----
function ConfigSection({
  config,
  schema,
  onSave,
}: {
  config: Record<string, unknown>;
  schema: ConfigSchema;
  onSave: (key: string, value: unknown) => Promise<void>;
}) {
  const properties = schema.properties ?? {};
  const keys = Object.keys(properties);

  if (keys.length === 0) {
    return <p className="text-sm text-tron-muted-fg italic">No configuration fields available.</p>;
  }

  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const prop = properties[key];
        const currentValue = config[key] ?? prop.default ?? "";
        return (
          <ConfigField key={key} fieldKey={key} prop={prop} value={currentValue} onSave={onSave} />
        );
      })}
    </div>
  );
}

function configValueToString(v: unknown): string {
  if (v == null) {
    return "";
  }
  if (typeof v === "object") {
    return JSON.stringify(v);
  }
  return `${v as string | number | boolean}`;
}

function ConfigField({
  fieldKey,
  prop,
  value: initialValue,
  onSave,
}: {
  fieldKey: string;
  prop: SchemaProperty;
  value: unknown;
  onSave: (key: string, value: unknown) => Promise<void>;
}) {
  const [value, setValue] = useState(configValueToString(initialValue));
  const [saving, setSaving] = useState(false);
  const dirty = value !== configValueToString(initialValue);

  const handleSave = async () => {
    setSaving(true);
    try {
      let parsed: unknown = value;
      if (prop.type === "number" || prop.type === "integer") {
        parsed = Number(value);
      } else if (prop.type === "boolean") {
        parsed = value === "true";
      }
      await onSave(fieldKey, parsed);
      toast.success(`Saved ${fieldKey}`);
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <Label className="text-xs text-tron-muted-fg uppercase tracking-widest">
          {prop.title ?? fieldKey}
        </Label>
        {prop.description && (
          <span className="text-xs text-tron-muted-fg/60">{prop.description}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {prop.enum ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 h-9 rounded-sm bg-tron-surface2 border border-tron-border text-sm text-foreground px-3 focus:outline-none focus:border-tron-cyan font-mono"
          >
            {prop.enum.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <Input
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
            type={prop.type === "number" || prop.type === "integer" ? "number" : "text"}
            className="flex-1 font-mono bg-tron-surface2 border-tron-border focus:border-tron-cyan text-sm"
          />
        )}
        {dirty && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-tron-cyan text-tron-bg hover:bg-tron-cyan/90 h-9 px-3 shrink-0"
          >
            <Save size={13} className="mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---- Main settings page ----
export function SettingsPage() {
  const gatewayUrl = useGatewayStore((s) => s.gatewayUrl);
  const token = useGatewayStore((s) => s.token);
  const status = useGatewayStore((s) => s.status);
  const error = useGatewayStore((s) => s.error);
  const setSettings = useGatewayStore((s) => s.setSettings);
  const connect = useGatewayStore((s) => s.connect);
  const disconnect = useGatewayStore((s) => s.disconnect);
  const client = useGatewayStore((s) => s.client);

  const [url, setUrl] = useState(gatewayUrl);
  const [tok, setTok] = useState(token);

  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [schema, setSchema] = useState<ConfigSchema>({});
  const [configLoading, setConfigLoading] = useState(false);

  const isConnected = status === "connected";

  const loadConfig = async () => {
    if (!client) {
      return;
    }
    setConfigLoading(true);
    try {
      const [configRes, schemaRes] = await Promise.allSettled([
        client.request<{ config: Record<string, unknown> }>("config.get", {}),
        client.request<{ schema: ConfigSchema }>("config.schema", {}),
      ]);
      if (configRes.status === "fulfilled") {
        setConfig(configRes.value.config ?? {});
      }
      if (schemaRes.status === "fulfilled") {
        setSchema(schemaRes.value.schema ?? {});
      }
    } catch (err) {
      console.error("[settings] loadConfig failed:", err);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      void loadConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const handleConnect = () => {
    setSettings(url, tok);
    connect({ url, token: tok });
  };

  const handleSaveConfigField = async (key: string, value: unknown) => {
    if (!client) {
      throw new Error("Not connected");
    }
    await client.request("config.patch", { updates: { [key]: value } });
    setConfig((c) => ({ ...c, [key]: value }));
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" subtitle="Gateway connection and system configuration" />

      {/* Connection */}
      <GlowCard className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-semibold text-foreground uppercase tracking-widest">
            Gateway Connection
          </span>
          <ConnectionStatus showLabel />
        </div>

        {error && (
          <div className="p-3 rounded-sm bg-tron-red/10 border border-tron-red/30 text-tron-red text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs text-tron-muted-fg uppercase tracking-widest">
            Gateway URL
          </Label>
          <Input
            value={url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
            placeholder="ws://localhost:4100"
            className="font-mono bg-tron-surface2 border-tron-border focus:border-tron-cyan"
          />
          <p className="text-xs text-tron-muted-fg">
            Auto-detected: <span className="font-mono text-tron-cyan">{gatewayUrl}</span>
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-tron-muted-fg uppercase tracking-widest">
            Auth Token (optional)
          </Label>
          <Input
            value={tok}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTok(e.target.value)}
            type="password"
            placeholder="leave empty for device-auth"
            className="font-mono bg-tron-surface2 border-tron-border focus:border-tron-cyan"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          {isConnected ? (
            <Button
              variant="outline"
              onClick={disconnect}
              className="border-tron-border text-tron-muted-fg hover:text-tron-red hover:border-tron-red/40"
            >
              <WifiOff size={14} className="mr-2" />
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="bg-tron-cyan text-tron-bg hover:bg-tron-cyan/90 font-semibold"
            >
              <Wifi size={14} className="mr-2" />
              {status === "connecting" ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </GlowCard>

      {/* System Config */}
      <GlowCard className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-semibold text-foreground uppercase tracking-widest">
            System Configuration
          </span>
          {isConnected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={loadConfig}
              disabled={configLoading}
              className="text-tron-muted-fg hover:text-tron-cyan h-7 px-2"
            >
              <RefreshCw size={13} className={configLoading ? "animate-spin" : ""} />
            </Button>
          )}
        </div>

        {!isConnected ? (
          <p className="text-sm text-tron-muted-fg italic">
            Connect to gateway to view and edit system configuration.
          </p>
        ) : configLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-sm bg-tron-surface2" />
            ))}
          </div>
        ) : (
          <ConfigSection config={config} schema={schema} onSave={handleSaveConfigField} />
        )}
      </GlowCard>
    </div>
  );
}
