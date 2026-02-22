import http from "node:http";
import { v4 as uuidv4 } from "uuid";
import { WebSocketServer, WebSocket } from "ws";
import type { BotManager } from "./integrations/bot-manager.ts";
import type { WsEvtFrame, WsFrame, WsReqFrame } from "./types.ts";
import { AgentRunner } from "./agent-runner.ts";
import * as db from "./db.ts";
import { PtyManager } from "./pty.ts";
import { TaskDispatcher } from "./task-dispatcher.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type WsClient = {
  id: string;
  ws: WebSocket;
  /** agentIds this client has subscribed to for terminal output */
  termSubs: Set<string>;
  /** cleanup fns for pty subscriptions */
  unsubscribers: Map<string, () => void>;
};

// ─── Create server ────────────────────────────────────────────────────────────

export type WsServerOptions = {
  onSettingsChange?: () => void;
  botManagerRef?: { current: BotManager | null };
};

export function createWsServer(
  port: number,
  options?: WsServerOptions,
): {
  httpServer: http.Server;
  runner: AgentRunner;
  emit: (event: string, payload: unknown) => void;
} {
  const pty = new PtyManager();
  const clients = new Map<string, WsClient>();

  const emit: (event: string, payload: unknown) => void = (event, payload) => {
    broadcast(clients, { type: "event", event, payload });
  };

  const runner = new AgentRunner(pty, emit);
  const dispatcher = new TaskDispatcher(runner, emit);

  const httpServer = http.createServer((_req, res) => {
    // Health check
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "blackbox-server" }));
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    const clientId = uuidv4();
    const client: WsClient = {
      id: clientId,
      ws,
      termSubs: new Set(),
      unsubscribers: new Map(),
    };
    clients.set(clientId, client);

    ws.on("message", (raw) => {
      let frame: WsReqFrame;
      try {
        const text = Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : typeof raw === "string"
            ? raw
            : "";
        frame = JSON.parse(text) as WsReqFrame;
      } catch {
        return;
      }
      if (frame.type !== "req") {
        return;
      }

      void handleRequest(frame, client, runner, dispatcher, pty, emit, options).catch(
        (err: unknown) => {
          send(ws, {
            type: "res",
            id: frame.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      );
    });

    ws.on("close", () => {
      // Clean up all terminal subscriptions
      for (const unsub of client.unsubscribers.values()) {
        unsub();
      }
      clients.delete(clientId);
    });
  });

  httpServer.listen(port, () => {
    console.log(`[blackbox] Server listening on ws://localhost:${port}`);
  });

  return { httpServer, runner, emit };
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handleRequest(
  frame: WsReqFrame,
  client: WsClient,
  runner: AgentRunner,
  dispatcher: TaskDispatcher,
  pty: PtyManager,
  emit: (event: string, payload: unknown) => void,
  options?: WsServerOptions,
): Promise<void> {
  const { method, params, id } = frame;
  const p = (params ?? {}) as Record<string, unknown>;

  const respond = (payload: unknown) => send(client.ws, { type: "res", id, ok: true, payload });

  const err = (msg: string) => send(client.ws, { type: "res", id, ok: false, error: msg });

  try {
    switch (method) {
      // ── Agents ─────────────────────────────────────────────────────────────

      case "agents.list":
        return respond(db.getAgents());

      case "agents.create": {
        const agent = db.createAgent({
          name: p["name"] as string,
          type: p["type"] as "claude-code" | "kimi-cli",
          workspaceDir: typeof p["workspaceDir"] === "string" ? p["workspaceDir"] : undefined,
          auth: p["auth"] as import("./types.ts").AgentAuth,
        });
        if (p["autoStart"] === true) {
          await runner.start(agent.id);
          return respond(db.getAgent(agent.id));
        }
        return respond(agent);
      }

      case "agents.update": {
        const agentId = p["id"] as string;
        const updated = db.updateAgent(agentId, {
          name: typeof p["name"] === "string" ? p["name"] : undefined,
          type:
            typeof p["type"] === "string" ? (p["type"] as "claude-code" | "kimi-cli") : undefined,
          workspaceDir: typeof p["workspaceDir"] === "string" ? p["workspaceDir"] : undefined,
          auth: p["auth"] !== undefined ? (p["auth"] as import("./types.ts").AgentAuth) : undefined,
        });
        emit("agent.status", { agentId, status: updated.status });
        return respond(updated);
      }

      case "agents.delete": {
        const agentId = p["id"] as string;
        if (runner.isRunning(agentId)) {
          await runner.stop(agentId);
        }
        db.deleteAgent(agentId);
        emit("agent.deleted", { agentId });
        return respond({ ok: true });
      }

      case "agents.start": {
        const startId = p["id"] as string;
        await runner.start(startId);
        options?.botManagerRef?.current?.subscribeAgent(startId);
        return respond(db.getAgent(startId));
      }

      case "agents.stop":
        await runner.stop(p["id"] as string);
        return respond(db.getAgent(p["id"] as string));

      case "agents.restart": {
        const restartId = p["id"] as string;
        await runner.restart(restartId);
        options?.botManagerRef?.current?.subscribeAgent(restartId);
        return respond(db.getAgent(restartId));
      }

      // Persist a user message to history — does NOT write to PTY.
      // The client sends the actual PTY input via agents.input separately.
      case "agents.write": {
        const msg = db.createMessage({
          agentId: p["id"] as string,
          direction: "user",
          content: p["text"] as string,
        });
        emit("message.new", { message: msg });
        return respond({ ok: true });
      }

      // Raw PTY input from terminal — no newline appended, not persisted to messages
      case "agents.input":
        pty.write(p["id"] as string, p["text"] as string);
        return respond({ ok: true });

      // Type text then press Enter. Content and \r are written as two separate PTY writes
      // with an event-loop yield between them, so Claude Code's readline sees them as
      // distinct chunks (content chunk → Enter chunk) instead of one pasted blob.
      case "agents.type": {
        const agentId = p["id"] as string;
        const text = p["text"] as string;
        pty.write(agentId, text);
        setTimeout(() => pty.write(agentId, "\r"), 0);
        return respond({ ok: true });
      }

      case "agents.interrupt":
        runner.interrupt(p["id"] as string);
        return respond({ ok: true });

      case "agents.resize":
        runner.resize(p["id"] as string, p["cols"] as number, p["rows"] as number);
        return respond({ ok: true });

      case "agents.getBuffer":
        return respond({ buffer: runner.getBuffer(p["id"] as string) });

      // ── Terminal subscription ───────────────────────────────────────────────

      case "terminal.subscribe": {
        const agentId = p["id"] as string;

        // Always clean up any stale subscription (e.g. no-op from before agent started)
        client.unsubscribers.get(agentId)?.();
        client.unsubscribers.delete(agentId);
        client.termSubs.delete(agentId);

        const buffer = runner.getBuffer(agentId);

        // Subscribe to future output (no-op if agent not yet running)
        const unsub = runner.subscribeToOutput(agentId, (data) => {
          send(client.ws, {
            type: "event",
            event: "agent.output",
            payload: { agentId, data },
          });
        });

        client.termSubs.add(agentId);
        client.unsubscribers.set(agentId, unsub);

        return respond({ buffer });
      }

      case "terminal.unsubscribe": {
        const agentId = p["id"] as string;
        client.unsubscribers.get(agentId)?.();
        client.unsubscribers.delete(agentId);
        client.termSubs.delete(agentId);
        return respond({ ok: true });
      }

      // ── Tasks ──────────────────────────────────────────────────────────────

      case "tasks.list":
        return respond(db.getTasks(typeof p["agentId"] === "string" ? p["agentId"] : undefined));

      case "tasks.create": {
        const task = db.createTask({
          agentId: p["agentId"] as string,
          title: p["title"] as string,
          description: p["description"] as string,
        });
        emit("task.updated", { task });
        return respond(task);
      }

      case "tasks.dispatch":
        dispatcher.dispatch(p["id"] as string);
        return respond(db.getTask(p["id"] as string));

      case "tasks.complete":
        dispatcher.complete(p["id"] as string);
        return respond(db.getTask(p["id"] as string));

      case "tasks.fail":
        dispatcher.fail(p["id"] as string);
        return respond(db.getTask(p["id"] as string));

      case "tasks.cancel":
        dispatcher.cancel(p["id"] as string);
        return respond(db.getTask(p["id"] as string));

      case "tasks.delete":
        db.deleteTask(p["id"] as string);
        emit("task.deleted", { taskId: p["id"] });
        return respond({ ok: true });

      // ── Messages ────────────────────────────────────────────────────────────

      case "messages.list":
        return respond(
          db.getMessages(p["agentId"] as string, typeof p["limit"] === "number" ? p["limit"] : 200),
        );

      // ── Settings ────────────────────────────────────────────────────────────

      case "settings.getAll": {
        const keys = ["telegram_token", "telegram_chat_id", "discord_token", "discord_channel_id"];
        const result: Record<string, string> = {};
        for (const k of keys) {
          const v = db.getSetting(k);
          if (v) {
            result[k] = k.endsWith("_token") ? "***" : v;
          }
        }
        return respond(result);
      }

      case "settings.update": {
        const updates = p as Record<string, string>;
        for (const [k, v] of Object.entries(updates)) {
          if (typeof v === "string") {
            db.setSetting(k, v);
          }
        }
        options?.onSettingsChange?.();
        return respond({ ok: true });
      }

      // Detect chat/channel IDs automatically from bot tokens
      case "settings.telegram.detectChatId": {
        // Use the provided token, or fall back to the stored one
        const token =
          typeof p["token"] === "string" && p["token"]
            ? p["token"]
            : db.getSetting("telegram_token");
        if (!token) {
          throw new Error("No Telegram token configured");
        }
        const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=10`);
        const json = (await res.json()) as {
          ok: boolean;
          result: Array<{
            message?: {
              chat: { id: number; title?: string; username?: string; first_name?: string };
            };
          }>;
          description?: string;
        };
        if (!json.ok) {
          throw new Error(json.description ?? "Telegram API error");
        }
        // Pick the chat ID from the most recent message
        const update = json.result.find((u) => u.message?.chat?.id !== undefined);
        if (!update?.message) {
          throw new Error("No messages found. Send any message to your bot first, then try again.");
        }
        const chat = update.message.chat;
        return respond({
          chatId: String(chat.id),
          name: chat.title ?? chat.username ?? chat.first_name ?? String(chat.id),
        });
      }

      default:
        err(`Unknown method: ${method}`);
    }
  } catch (e: unknown) {
    err(e instanceof Error ? e.message : String(e));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws: WebSocket, frame: WsFrame): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}

function broadcast(clients: Map<string, WsClient>, frame: WsEvtFrame): void {
  const msg = JSON.stringify(frame);
  for (const { ws } of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}
