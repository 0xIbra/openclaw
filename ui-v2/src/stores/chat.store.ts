import { create } from "zustand";
import { registerGatewayEventHandler } from "./gateway.store";

export type ChatContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  runId?: string;
  role: ChatMessageRole;
  content: ChatContentBlock[];
  state: "complete" | "streaming" | "error" | "aborted";
  createdAtMs: number;
};

type ChatState = {
  sessionKey: string;
  messages: ChatMessage[];
  streamingRunId: string | null;
  // Actions
  setSessionKey: (key: string) => void;
  sendMessage: (text: string) => Promise<void>;
  abortStream: () => Promise<void>;
  loadHistory: () => Promise<void>;
};

const SESSION_KEY_STORAGE = "opengrid.chat.sessionKey";

function getOrCreateSessionKey(): string {
  try {
    const stored = localStorage.getItem(SESSION_KEY_STORAGE);
    if (stored) {
      return stored;
    }
    const key = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY_STORAGE, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export const useChatStore = create<ChatState>((set, get) => {
  registerGatewayEventHandler((evt) => {
    if (evt.event !== "chat") {
      return;
    }

    const payload = evt.payload as {
      runId?: string;
      sessionKey?: string;
      state?: "delta" | "final" | "aborted" | "error" | "thinking_delta";
      message?: { role?: string; content?: ChatContentBlock[] };
      thinking?: string;
      errorMessage?: string;
    };

    const { runId, state, message } = payload;
    if (!runId || !state) {
      return;
    }

    const storeState = get();
    const currentSession = storeState.sessionKey;

    // Accept the event if:
    //   (a) sessionKey matches our current session, OR
    //   (b) runId matches our active streaming run (handles canonical key normalization)
    const sessionMatches = !payload.sessionKey || payload.sessionKey === currentSession;
    const runIdMatches = storeState.streamingRunId === runId;
    if (!sessionMatches && !runIdMatches) {
      return;
    }

    if (state === "thinking_delta") {
      const thinkingText = payload.thinking;
      if (!thinkingText) {
        return;
      }

      set((s) => {
        const existingIdx = s.messages.findIndex((m) => m.runId === runId);
        if (existingIdx === -1) {
          return s;
        }

        const msg = s.messages[existingIdx];
        const thinkingIdx = msg.content.findIndex((b) => b.type === "thinking");
        const newContent = [...msg.content];

        if (thinkingIdx === -1) {
          newContent.unshift({ type: "thinking", thinking: thinkingText });
        } else {
          newContent[thinkingIdx] = { type: "thinking", thinking: thinkingText };
        }

        const updated = [...s.messages];
        updated[existingIdx] = { ...msg, content: newContent };
        return { messages: updated };
      });
      return;
    }

    if (state === "delta" || state === "final") {
      // Each delta/final contains the FULL accumulated text so far — replace, don't append.
      // Preserve any thinking blocks accumulated from thinking_delta events.
      const incomingContent: ChatContentBlock[] = message?.content ?? [];

      set((s) => {
        const existingIdx = s.messages.findIndex((m) => m.runId === runId);

        if (existingIdx === -1) {
          // First event for this run — create the message
          if (incomingContent.length === 0 && state === "final") {
            // Silent/empty final with no prior placeholder — nothing to show
            return { streamingRunId: s.streamingRunId === runId ? null : s.streamingRunId };
          }
          const newMsg: ChatMessage = {
            id: crypto.randomUUID(),
            runId,
            role: "assistant",
            content: incomingContent,
            state: state === "final" ? "complete" : "streaming",
            createdAtMs: Date.now(),
          };
          return {
            messages: [...s.messages, newMsg],
            streamingRunId: state === "final" ? null : runId,
          };
        }

        // Preserve thinking blocks from thinking_delta events,
        // then apply the new text content from the chat delta.
        const existingThinking = s.messages[existingIdx].content.filter(
          (b) => b.type === "thinking",
        );
        const incomingText = incomingContent.filter((b) => b.type !== "thinking");
        const mergedContent =
          incomingContent.length > 0
            ? [...existingThinking, ...incomingText]
            : s.messages[existingIdx].content;

        const updated = [...s.messages];
        updated[existingIdx] = {
          ...updated[existingIdx],
          content: mergedContent,
          state: state === "final" ? "complete" : "streaming",
        };
        return {
          messages: updated,
          streamingRunId: state === "final" ? null : s.streamingRunId,
        };
      });

      // After final, reload history to get the full transcript (including thinking blocks)
      if (state === "final") {
        setTimeout(() => {
          void useChatStore.getState().loadHistory();
        }, 800);
      }
    } else if (state === "aborted" || state === "error") {
      set((s) => {
        const existingIdx = s.messages.findIndex((m) => m.runId === runId);
        if (existingIdx === -1) {
          return { streamingRunId: s.streamingRunId === runId ? null : s.streamingRunId };
        }
        const updated = [...s.messages];
        updated[existingIdx] = {
          ...updated[existingIdx],
          state: state === "aborted" ? "aborted" : "error",
        };
        return { messages: updated, streamingRunId: null };
      });
    }
  });

  return {
    sessionKey: getOrCreateSessionKey(),
    messages: [],
    streamingRunId: null,

    setSessionKey: (key: string) => {
      try {
        localStorage.setItem(SESSION_KEY_STORAGE, key);
      } catch {
        // best-effort
      }
      set({ sessionKey: key, messages: [], streamingRunId: null });
    },

    sendMessage: async (text: string) => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        throw new Error("Not connected");
      }

      const { sessionKey } = get();
      // The idempotency key becomes the runId that events will reference
      const idempotencyKey = crypto.randomUUID();

      // Add user message + assistant placeholder immediately for responsive UX
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: [{ type: "text", text }],
        state: "complete",
        createdAtMs: Date.now(),
      };
      const placeholder: ChatMessage = {
        id: crypto.randomUUID(),
        runId: idempotencyKey,
        role: "assistant",
        content: [],
        state: "streaming",
        createdAtMs: Date.now() + 1,
      };
      // Pre-register the streaming run so events arriving before the RPC response are accepted
      set((s) => ({
        messages: [...s.messages, userMsg, placeholder],
        streamingRunId: idempotencyKey,
      }));

      try {
        await client.request<{ runId: string; status: string }>("chat.send", {
          sessionKey,
          message: text,
          idempotencyKey,
          attachments: [],
        });
        // runId = idempotencyKey (confirmed from backend source)
        // streamingRunId already set above
      } catch (err) {
        // Clear streaming state on error
        set((s) => ({
          streamingRunId: s.streamingRunId === idempotencyKey ? null : s.streamingRunId,
        }));
        throw err;
      }
    },

    abortStream: async () => {
      const { streamingRunId, sessionKey } = get();
      if (!streamingRunId) {
        return;
      }
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      try {
        await client.request("chat.abort", { sessionKey, runId: streamingRunId });
      } catch {
        // best-effort
      }
    },

    loadHistory: async () => {
      const { useGatewayStore } = await import("./gateway.store");
      const client = useGatewayStore.getState().client;
      if (!client) {
        return;
      }
      const { sessionKey } = get();
      try {
        const result = await client.request<{
          messages: Array<{
            role: ChatMessageRole;
            content?: ChatContentBlock[] | string;
            timestamp?: number;
          }>;
        }>("chat.history", { sessionKey, limit: 200 });

        const msgs: ChatMessage[] = (result.messages ?? [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m, i) => {
            // content can be an array of blocks or a plain string
            let content: ChatContentBlock[];
            if (typeof m.content === "string") {
              content = m.content.trim() ? [{ type: "text", text: m.content }] : [];
            } else if (Array.isArray(m.content)) {
              content = m.content;
            } else {
              content = [];
            }
            return {
              id: `history-${i}`,
              role: m.role,
              content,
              state: "complete" as const,
              createdAtMs: m.timestamp ?? Date.now(),
            };
          });
        set({ messages: msgs });
      } catch (err) {
        console.error("[chat] loadHistory failed:", err);
      }
    },
  };
});
