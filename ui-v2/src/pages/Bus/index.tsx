import { useEffect, useRef, useState } from "react";
import type { BusMessageRecord } from "@/types";
import { ConnectionGuard } from "@/components/gateway/ConnectionGuard";
import { PageHeader } from "@/components/layout/PageHeader";
import { NeonBadge } from "@/components/tron/NeonBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getBusMessageTypeStyle } from "@/lib/constants";
import { timeAgo, truncate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBusStore, useGatewayStore } from "@/stores";

function MessageRow({
  msg,
  onClick,
  isSelected,
}: {
  msg: BusMessageRecord;
  onClick: () => void;
  isSelected: boolean;
}) {
  const style = getBusMessageTypeStyle(msg.messageType);

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-b border-tron-border/50 cursor-pointer",
        "hover:bg-tron-surface2 transition-colors",
        isSelected && "bg-tron-surface2 border-l-2 border-l-tron-cyan",
      )}
    >
      <div className="flex-shrink-0 pt-0.5">
        <NeonBadge className={style.bgClass} style={{ color: style.color }}>
          {msg.messageType}
        </NeonBadge>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-tron-cyan truncate max-w-[80px]">
            {msg.senderAgentId.split("-")[0]}
          </span>
          <span className="text-tron-muted-fg">→</span>
          <span className="font-mono text-tron-purple truncate max-w-[80px]">
            {msg.receiverAgentId.split("-")[0]}
          </span>
        </div>
        {msg.subject && <p className="text-xs text-foreground mt-0.5 truncate">{msg.subject}</p>}
        <p className="text-xs text-tron-muted-fg mt-0.5 truncate">{truncate(msg.body, 80)}</p>
      </div>
      <span className="text-id flex-shrink-0">{timeAgo(msg.createdAtMs)}</span>
    </div>
  );
}

function MessageDetail({ msg }: { msg: BusMessageRecord }) {
  const style = getBusMessageTypeStyle(msg.messageType);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <NeonBadge className={style.bgClass} style={{ color: style.color }}>
          {msg.messageType}
        </NeonBadge>
        <NeonBadge variant="muted">{msg.state}</NeonBadge>
      </div>
      <div className="text-xs space-y-1">
        <div className="flex gap-2">
          <span className="text-tron-muted-fg w-20">From:</span>
          <span className="font-mono text-tron-cyan">{msg.senderAgentId}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-tron-muted-fg w-20">To:</span>
          <span className="font-mono text-tron-purple">{msg.receiverAgentId}</span>
        </div>
        {msg.taskId && (
          <div className="flex gap-2">
            <span className="text-tron-muted-fg w-20">Task:</span>
            <span className="font-mono text-foreground">{msg.taskId}</span>
          </div>
        )}
        {msg.subject && (
          <div className="flex gap-2">
            <span className="text-tron-muted-fg w-20">Subject:</span>
            <span className="text-foreground">{msg.subject}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-tron-muted-fg w-20">Sent:</span>
          <span className="text-foreground">{new Date(msg.createdAtMs).toLocaleString()}</span>
        </div>
      </div>
      <div>
        <p className="text-xs text-tron-muted-fg uppercase tracking-widest mb-1.5">Body</p>
        <pre className="text-xs text-foreground bg-tron-surface2 p-3 rounded-sm overflow-auto max-h-64 whitespace-pre-wrap break-all">
          {msg.body}
        </pre>
      </div>
      {Object.keys(msg.payload).length > 0 && (
        <div>
          <p className="text-xs text-tron-muted-fg uppercase tracking-widest mb-1.5">Payload</p>
          <pre className="text-xs text-foreground bg-tron-surface2 p-3 rounded-sm overflow-auto max-h-64">
            {JSON.stringify(msg.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function BusPage() {
  const connected = useGatewayStore((s) => s.status === "connected");
  const messages = useBusStore((s) => s.messages);
  const filters = useBusStore((s) => s.filters);
  const setFilter = useBusStore((s) => s.setFilter);
  const clearMessages = useBusStore((s) => s.clearMessages);
  const pullMessages = useBusStore((s) => s.pullMessages);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  // Pull initial messages on mount
  useEffect(() => {
    if (connected) {
      void pullMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    if (atBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const filtered = messages.filter((m) => {
    if (filters.senderAgentId && !m.senderAgentId.includes(filters.senderAgentId)) {
      return false;
    }
    if (filters.receiverAgentId && !m.receiverAgentId.includes(filters.receiverAgentId)) {
      return false;
    }
    if (filters.messageType && m.messageType !== filters.messageType) {
      return false;
    }
    if (filters.taskId && m.taskId !== filters.taskId) {
      return false;
    }
    return true;
  });

  const selectedMsg = selectedId ? filtered.find((m) => m.id === selectedId) : null;

  return (
    <ConnectionGuard>
      <PageHeader
        title="Message Bus"
        subtitle="Real-time inter-agent message stream"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={clearMessages}
            className="border-tron-border text-tron-muted-fg hover:text-foreground text-xs"
          >
            Clear
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input
          value={filters.senderAgentId}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFilter({ senderAgentId: e.target.value })
          }
          placeholder="Filter sender..."
          className="w-44 h-7 text-xs font-mono bg-tron-surface border-tron-border"
        />
        <Input
          value={filters.receiverAgentId}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFilter({ receiverAgentId: e.target.value })
          }
          placeholder="Filter receiver..."
          className="w-44 h-7 text-xs font-mono bg-tron-surface border-tron-border"
        />
        <Input
          value={filters.messageType}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFilter({ messageType: e.target.value })
          }
          placeholder="Message type..."
          className="w-36 h-7 text-xs font-mono bg-tron-surface border-tron-border"
        />
      </div>

      <div className="flex gap-4 h-[calc(100vh-260px)]">
        {/* Feed */}
        <div className="flex-1 border border-tron-border rounded-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-tron-border bg-tron-surface flex items-center justify-between">
            <span className="text-xs text-tron-muted-fg">{filtered.length} messages</span>
            {connected && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-tron-green animate-pulse" />
                <span className="text-xs text-tron-green">Live</span>
              </div>
            )}
          </div>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {filtered.length === 0 && (
              <p className="text-sm text-tron-muted-fg text-center py-16">
                Waiting for messages...
              </p>
            )}
            {filtered.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                onClick={() => setSelectedId(msg.id === selectedId ? null : msg.id)}
                isSelected={msg.id === selectedId}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selectedMsg && (
          <div className="w-96 border border-tron-border rounded-sm overflow-hidden flex flex-col flex-shrink-0">
            <div className="px-4 py-2 border-b border-tron-border bg-tron-surface flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Detail</span>
              <button
                onClick={() => setSelectedId(null)}
                className="text-tron-muted-fg hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>
            <ScrollArea className="flex-1">
              <MessageDetail msg={selectedMsg} />
            </ScrollArea>
          </div>
        )}
      </div>
    </ConnectionGuard>
  );
}
