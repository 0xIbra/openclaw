"use client";

import { useEffect, useRef, useCallback } from "react";
import { useWs } from "@/lib/ws";

type Props = {
  agentId: string;
  className?: string;
};

export function TerminalPane({ agentId, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const { request, on, connected } = useWs();
  const unsubRef = useRef<(() => void) | null>(null);

  // Re-subscribe to PTY output and sync terminal dimensions.
  // Called on init and whenever the agent starts/restarts.
  const resubscribe = useCallback(async () => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) {
      return;
    }

    try {
      const result = await request<{ buffer: string }>("terminal.subscribe", { id: agentId });
      // Clear and rewrite the buffer so we get a clean view
      term.reset();
      if (result.buffer) {
        term.write(result.buffer);
      }
    } catch {}

    // Sync PTY dimensions with the actual browser terminal size
    fitAddon.fit();
    request("agents.resize", { id: agentId, cols: term.cols, rows: term.rows }).catch(() => {});
  }, [agentId, request]);

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || termRef.current) {
      return;
    }

    const container = containerRef.current;

    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");

    // Bail if unmounted or another terminal was created during import
    if (!container.isConnected || termRef.current) {
      return;
    }

    const term = new Terminal({
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#3b82f6",
        cursorAccent: "#09090b",
        selectionBackground: "#3b82f650",
        black: "#27272a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde68a",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#fafafa",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Raw keystrokes → PTY directly. Use agents.input (no \n appended, not persisted).
    term.onData((data) => {
      request("agents.input", { id: agentId, text: data }).catch(() => {});
    });

    // Keep PTY dimensions in sync with browser terminal
    term.onResize(({ cols, rows }) => {
      request("agents.resize", { id: agentId, cols, rows }).catch(() => {});
    });

    // Stream live output from PTY
    const unsub = on("agent.output", (payload) => {
      const p = payload as { agentId: string; data: string };
      if (p.agentId === agentId) {
        term.write(p.data);
      }
    });
    unsubRef.current = unsub;

    // Initial subscription + dimension sync
    await resubscribe();

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [agentId, request, on, resubscribe]);

  // Mount / reconnect effect
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (connected) {
      void initTerminal()
        .then((fn) => {
          cleanup = fn;
        })
        .catch(console.error);
    }

    return () => {
      cleanup?.();
      unsubRef.current?.();
      unsubRef.current = null;
      void request("terminal.unsubscribe", { id: agentId }).catch(() => {});
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, connected]);

  // Re-subscribe + re-sync dimensions whenever agent starts/restarts
  useEffect(() => {
    if (!connected) {
      return;
    }

    const unsub = on("agent.status", (payload) => {
      const p = payload as { agentId: string; status: string };
      if (p.agentId !== agentId || p.status === "offline") {
        return;
      }
      void resubscribe().catch(() => {});
    });

    return unsub;
  }, [agentId, connected, on, resubscribe]);

  return <div ref={containerRef} className={className} style={{ background: "#09090b" }} />;
}
