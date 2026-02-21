import { create } from "zustand";
import {
  GatewayClient,
  type GatewayClientOptions,
  type GatewayEventFrame,
  type GatewayHelloOk,
} from "@/gateway/client";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type GatewayState = {
  client: GatewayClient | null;
  status: ConnectionStatus;
  hello: GatewayHelloOk | null;
  error: string | null;
  gatewayUrl: string;
  token: string;
  // Actions
  setSettings: (url: string, token: string) => void;
  connect: (opts?: { url?: string; token?: string }) => void;
  disconnect: () => void;
};

const STORAGE_URL_KEY = "opengrid.gateway.url";
const STORAGE_TOKEN_KEY = "opengrid.gateway.token";

function defaultGatewayUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

function loadSetting(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

// Event handlers registry — stores subscribe at module level
type EventHandler = (evt: GatewayEventFrame) => void;
const eventHandlers: EventHandler[] = [];

export function registerGatewayEventHandler(handler: EventHandler) {
  eventHandlers.push(handler);
  return () => {
    const idx = eventHandlers.indexOf(handler);
    if (idx >= 0) {
      eventHandlers.splice(idx, 1);
    }
  };
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  client: null,
  status: "disconnected",
  hello: null,
  error: null,
  gatewayUrl: loadSetting(STORAGE_URL_KEY, defaultGatewayUrl()),
  token: loadSetting(STORAGE_TOKEN_KEY, ""),

  setSettings: (url: string, token: string) => {
    try {
      localStorage.setItem(STORAGE_URL_KEY, url);
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } catch {
      // best-effort
    }
    set({ gatewayUrl: url, token });
  },

  connect: (opts) => {
    const state = get();
    const url = opts?.url ?? state.gatewayUrl;
    const token = opts?.token ?? state.token;

    if (!url) {
      set({ status: "error", error: "No gateway URL configured" });
      return;
    }

    // Stop existing client
    state.client?.stop();

    set({ status: "connecting", error: null, hello: null });

    const clientOpts: GatewayClientOptions = {
      url,
      token: token || undefined,
      onHello: (hello) => {
        set({ status: "connected", hello });
      },
      onEvent: (evt) => {
        for (const handler of eventHandlers) {
          try {
            handler(evt);
          } catch (err) {
            console.error("[gateway] store handler error:", err);
          }
        }
      },
      onClose: ({ code, reason }) => {
        const isAuthFailure = code === 4008;
        set({
          status: isAuthFailure ? "error" : "connecting",
          error: isAuthFailure ? `Auth failed: ${reason}` : null,
          hello: null,
        });
      },
    };

    const client = new GatewayClient(clientOpts);
    set({ client });
    client.start();
  },

  disconnect: () => {
    const { client } = get();
    client?.stop();
    set({ client: null, status: "disconnected", hello: null, error: null });
  },
}));
