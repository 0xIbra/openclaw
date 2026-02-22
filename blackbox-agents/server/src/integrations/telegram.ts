import stripAnsi from "strip-ansi";
import { Telegraf } from "telegraf";
import type { AgentRunner, EmitFn } from "../agent-runner.ts";
import type { AgentType } from "../types.ts";
import * as db from "../db.ts";

const MAX_MSG_LENGTH = 3800;

const STATUS_EMOJI: Record<string, string> = {
  idle: "🟢",
  working: "🔵",
  paused: "🟡",
  offline: "⚫",
};

function statusLine(name: string, type: string, status: string): string {
  return `${STATUS_EMOJI[status] ?? "⚫"} ${name} (${type}) — ${status}`;
}

function args(text: string): string[] {
  return text.trim().split(/\s+/).slice(1).filter(Boolean);
}

const HELP = `Agent management commands:
/agents           — list all agents
/start <name>     — start agent
/stop <name>      — stop agent
/restart <name>   — restart agent
/create <name>    — create new claude-code agent
/delete <name>    — delete agent

Send messages:
@agent-name <text> — talk to an agent`;

export class TelegramBot {
  private bot: Telegraf;

  constructor(
    token: string,
    private chatId: string,
    private runner: AgentRunner,
    private emit: EmitFn,
  ) {
    this.bot = new Telegraf(token);
    this.registerCommands();
    this.registerMessageHandler();
  }

  private guard(chatId: number | string): boolean {
    return String(chatId) === this.chatId;
  }

  private registerCommands(): void {
    // /start with no args → help; /start <name> → start agent
    this.bot.command("start", async (ctx) => {
      if (!this.guard(ctx.chat.id)) {
        return;
      }
      const a = args(ctx.message.text);
      if (a.length === 0) {
        return ctx.reply(HELP);
      }
      return this.cmdStartAgent(ctx, a[0]);
    });

    this.bot.command("agents", async (ctx) => {
      if (!this.guard(ctx.chat.id)) {
        return;
      }
      const agents = db.getAgents();
      if (agents.length === 0) {
        return ctx.reply("No agents yet.");
      }
      return ctx.reply(agents.map((a) => statusLine(a.name, a.type, a.status)).join("\n"));
    });

    this.bot.command("stop", async (ctx) => {
      if (!this.guard(ctx.chat.id)) {
        return;
      }
      const [name] = args(ctx.message.text);
      if (!name) {
        return ctx.reply("Usage: /stop <name>");
      }
      const agent = db.getAgents().find((a) => a.name === name);
      if (!agent) {
        return ctx.reply(`Unknown agent: ${name}`);
      }
      try {
        await this.runner.stop(agent.id);
        return ctx.reply(`⚫ ${name} stopped.`);
      } catch (e) {
        return ctx.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    this.bot.command("restart", async (ctx) => {
      if (!this.guard(ctx.chat.id)) {
        return;
      }
      const [name] = args(ctx.message.text);
      if (!name) {
        return ctx.reply("Usage: /restart <name>");
      }
      const agent = db.getAgents().find((a) => a.name === name);
      if (!agent) {
        return ctx.reply(`Unknown agent: ${name}`);
      }
      try {
        await this.runner.restart(agent.id);
        return ctx.reply(`🟢 ${name} restarted.`);
      } catch (e) {
        return ctx.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    this.bot.command("create", async (ctx) => {
      if (!this.guard(ctx.chat.id)) {
        return;
      }
      const [name, rawType] = args(ctx.message.text);
      if (!name) {
        return ctx.reply("Usage: /create <name> [claude-code|kimi-cli]");
      }
      const type: AgentType = rawType === "kimi-cli" ? "kimi-cli" : "claude-code";
      try {
        const agent = db.createAgent({
          name,
          type,
          auth: { type: "claude-subscription" },
        });
        return ctx.reply(
          `✅ Agent "${agent.name}" created (${type}).\nUse /start ${name} to launch it.`,
        );
      } catch (e) {
        return ctx.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    this.bot.command("delete", async (ctx) => {
      if (!this.guard(ctx.chat.id)) {
        return;
      }
      const [name] = args(ctx.message.text);
      if (!name) {
        return ctx.reply("Usage: /delete <name>");
      }
      const agent = db.getAgents().find((a) => a.name === name);
      if (!agent) {
        return ctx.reply(`Unknown agent: ${name}`);
      }
      try {
        if (this.runner.isRunning(agent.id)) {
          await this.runner.stop(agent.id);
        }
        db.deleteAgent(agent.id);
        this.emit("agent.deleted", { agentId: agent.id });
        return ctx.reply(`🗑 Agent "${name}" deleted.`);
      } catch (e) {
        return ctx.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  private async cmdStartAgent(
    ctx: { reply: (msg: string) => Promise<unknown> },
    name: string,
  ): Promise<unknown> {
    const agent = db.getAgents().find((a) => a.name === name);
    if (!agent) {
      return ctx.reply(`Unknown agent: ${name}`);
    }
    try {
      await this.runner.start(agent.id);
      return ctx.reply(`🟢 ${name} started.`);
    } catch (e) {
      return ctx.reply(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private registerMessageHandler(): void {
    // "@agent-name text" → send to agent PTY
    this.bot.on("text", (ctx) => {
      if (!this.guard(ctx.chat.id)) {
        return;
      }
      const text = ctx.message.text.trim();
      if (text.startsWith("/")) {
        return;
      } // already handled by commands
      const match = text.match(/^@(\S+)\s+([\s\S]+)$/);
      if (!match) {
        return;
      }
      const [, agentName, content] = match;
      const agent = db.getAgents().find((a) => a.name === agentName);
      if (agent) {
        this.runner.sendMessage(agent.id, content);
      } else {
        void ctx.reply(`Unknown agent: ${agentName}`);
      }
    });
  }

  async launch(): Promise<void> {
    await this.bot.telegram.setMyCommands([
      { command: "agents", description: "List all agents and their status" },
      { command: "start", description: "Start an agent: /start <name>" },
      { command: "stop", description: "Stop an agent: /stop <name>" },
      { command: "restart", description: "Restart an agent: /restart <name>" },
      { command: "create", description: "Create an agent: /create <name> [type]" },
      { command: "delete", description: "Delete an agent: /delete <name>" },
    ]);
    await this.bot.launch();
    console.log("[telegram] Bot started");
  }

  stop(): void {
    this.bot.stop();
    console.log("[telegram] Bot stopped");
  }

  async sendOutput(agentName: string, raw: string): Promise<void> {
    const clean = stripAnsi(raw).trim();
    if (!clean) {
      return;
    }
    const prefix = `[${agentName}] `;
    const body = clean.slice(0, MAX_MSG_LENGTH - prefix.length);
    try {
      await this.bot.telegram.sendMessage(this.chatId, prefix + body);
    } catch (e) {
      console.error("[telegram] sendMessage error:", e);
    }
  }
}
