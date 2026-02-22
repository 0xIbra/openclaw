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

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || termRef.current) {
      return;
    }

    // Dynamically import xterm (browser-only)
    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");

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
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle user input → send to agent
    term.onData((data) => {
      void request("agents.write", { id: agentId, text: data });
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
      void request("agents.resize", { id: agentId, cols, rows });
    });

    // Subscribe to terminal output events
    const unsub = on("agent.output", (payload) => {
      const p = payload as { agentId: string; data: string };
      if (p.agentId === agentId) {
        term.write(p.data);
      }
    });
    unsubRef.current = unsub;

    // Load existing buffer from server
    try {
      const result = await request<{ buffer: string }>("terminal.subscribe", { id: agentId });
      if (result.buffer) {
        term.write(result.buffer);
      }
    } catch {}

    // Fit on window resize
    const observer = new ResizeObserver(() => fitAddon.fit());
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [agentId, request, on]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (connected) {
      void initTerminal().then((fn) => {
        cleanup = fn;
      });
    }

    return () => {
      cleanup?.();
      unsubRef.current?.();
      unsubRef.current = null;
      // Unsubscribe from server
      void request("terminal.unsubscribe", { id: agentId }).catch(() => {});
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, connected]);

  return <div ref={containerRef} className={className} style={{ background: "#09090b" }} />;
}
