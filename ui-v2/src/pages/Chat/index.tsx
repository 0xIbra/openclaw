import { RefreshCw, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useGatewayStore } from "@/stores";
import { useChatStore } from "@/stores/chat.store";

export function ChatPage() {
  const messages = useChatStore((s) => s.messages);
  const streamingRunId = useChatStore((s) => s.streamingRunId);
  const sessionKey = useChatStore((s) => s.sessionKey);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortStream = useChatStore((s) => s.abortStream);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const setSessionKey = useChatStore((s) => s.setSessionKey);

  const connected = useGatewayStore((s) => s.status === "connected");
  const [sending, setSending] = useState(false);

  // Load history when connected
  useEffect(() => {
    if (connected && messages.length === 0) {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const handleSend = async (text: string) => {
    if (sending || streamingRunId) {
      return;
    }
    setSending(true);
    try {
      await sendMessage(text);
    } catch (err) {
      toast.error(`Failed to send: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
    }
  };

  const handleAbort = async () => {
    await abortStream();
  };

  const handleNewSession = () => {
    const key = crypto.randomUUID();
    setSessionKey(key);
    toast.success("New chat session started");
  };

  const handleReload = async () => {
    await loadHistory();
    toast.success("History reloaded");
  };

  const isStreaming = streamingRunId !== null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Chat"
        subtitle={
          <span className="font-mono text-xs text-tron-muted-fg">
            session: {sessionKey.slice(0, 8)}…
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReload}
              disabled={!connected}
              className="text-tron-muted-fg hover:text-tron-cyan h-7 px-2"
            >
              <RefreshCw size={13} className="mr-1" />
              Reload
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewSession}
              className="text-tron-muted-fg hover:text-tron-cyan h-7 px-2"
            >
              <Plus size={13} className="mr-1" />
              New Session
            </Button>
          </div>
        }
      />

      {!connected && (
        <div className="mx-4 mb-3 p-3 rounded-sm bg-tron-red/10 border border-tron-red/30 text-tron-red text-sm">
          Not connected to gateway. Go to Settings to configure connection.
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 bg-tron-bg">
        <ChatMessageList messages={messages} />
        <ChatInput
          onSend={handleSend}
          onAbort={handleAbort}
          disabled={!connected || sending}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
