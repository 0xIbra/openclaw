"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Agent, Message, Task, WsFrame } from "./types";

// ─── WS URL ───────────────────────────────────────────────────────────────────

function getWsUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:3001";
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // In dev, server is on :3001; in prod, proxy via same host
  return `${proto}//localhost:3001`;
}

// ─── Context types ────────────────────────────────────────────────────────────

type PendingReq = {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
};

type EventHandler = (payload: unknown) => void;

type WsContextValue = {
  connected: boolean;
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  on: (event: string, handler: EventHandler) => () => void;
};

const WsContext = createContext<WsContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WsProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<Map<string, PendingReq>>(new Map());
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

  const connect = useCallback(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.addEventListener("open", () => setConnected(true));

    ws.addEventListener("close", () => {
      setConnected(false);
      // Reject all pending requests
      for (const { reject } of pendingRef.current.values()) {
        reject(new Error("WebSocket disconnected"));
      }
      pendingRef.current.clear();
      // Reconnect after 2s
      setTimeout(connect, 2000);
    });

    ws.addEventListener("error", () => ws.close());

    ws.addEventListener("message", (evt) => {
      let frame: WsFrame;
      try {
        frame = JSON.parse(evt.data as string) as WsFrame;
      } catch {
        return;
      }

      if (frame.type === "res") {
        const res = frame;
        const pending = pendingRef.current.get(res.id);
        if (pending) {
          pendingRef.current.delete(res.id);
          if (res.ok) {
            pending.resolve(res.payload);
          } else {
            pending.reject(new Error(res.error ?? "Request failed"));
          }
        }
      } else if (frame.type === "event") {
        const handlers = handlersRef.current.get(frame.event);
        if (handlers) {
          for (const h of handlers) {
            h(frame.payload);
          }
        }
      }
    });
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const request = useCallback(<T = unknown>(method: string, params?: unknown): Promise<T> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      const id = crypto.randomUUID();
      pendingRef.current.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      ws.send(JSON.stringify({ type: "req", id, method, params: params ?? {} }));
    });
  }, []);

  const on = useCallback((event: string, handler: EventHandler): (() => void) => {
    let set = handlersRef.current.get(event);
    if (!set) {
      set = new Set();
      handlersRef.current.set(event, set);
    }
    set.add(handler);
    return () => {
      handlersRef.current.get(event)?.delete(handler);
    };
  }, []);

  const value: WsContextValue = { connected, request, on };

  return React.createElement(WsContext.Provider, { value }, children);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWs(): WsContextValue {
  const ctx = useContext(WsContext);
  if (!ctx) {
    throw new Error("useWs must be used inside WsProvider");
  }
  return ctx;
}

// ─── Derived hooks ────────────────────────────────────────────────────────────

export function useAgents(): { agents: Agent[]; loading: boolean; refetch: () => void } {
  const { request, on, connected } = useWs();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!connected) {
      return;
    }
    request<Agent[]>("agents.list")
      .then(setAgents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [request, connected]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const unsub1 = on("agent.status", (payload) => {
      const { agentId, status } = payload as { agentId: string; status: string };
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, status: status as Agent["status"] } : a)),
      );
    });
    const unsub2 = on("agent.deleted", (payload) => {
      const { agentId } = payload as { agentId: string };
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [on]);

  return { agents, loading, refetch };
}

export function useTasks(agentId?: string): {
  tasks: Task[];
  loading: boolean;
  refetch: () => void;
} {
  const { request, on, connected } = useWs();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!connected) {
      return;
    }
    request<Task[]>("tasks.list", agentId ? { agentId } : {})
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [request, agentId, connected]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const unsub = on("task.updated", (payload) => {
      const { task } = payload as { task: Task };
      if (agentId && task.agentId !== agentId) {
        return;
      }
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = task;
          return next;
        }
        return [...prev, task];
      });
    });
    const unsub2 = on("task.deleted", (payload) => {
      const { taskId } = payload as { taskId: string };
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    });
    return () => {
      unsub();
      unsub2();
    };
  }, [on, agentId]);

  return { tasks, loading, refetch };
}

export function useMessages(agentId: string): { messages: Message[]; loading: boolean } {
  const { request, on, connected } = useWs();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected) {
      return;
    }
    request<Message[]>("messages.list", { agentId })
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [request, agentId, connected]);

  useEffect(() => {
    const unsub = on("message.new", (payload) => {
      const { message } = payload as { message: Message };
      if (message.agentId !== agentId) {
        return;
      }
      setMessages((prev) => [...prev, message]);
    });
    return unsub;
  }, [on, agentId]);

  // Clear message history when the agent restarts (fresh session)
  useEffect(() => {
    const unsub = on("agent.status", (payload) => {
      const { agentId: id, status } = payload as { agentId: string; status: string };
      if (id === agentId && status === "idle") {
        setMessages([]);
      }
    });
    return unsub;
  }, [on, agentId]);

  return { messages, loading };
}
