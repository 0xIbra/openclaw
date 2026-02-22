import { Client, GatewayIntentBits } from "discord.js";
import stripAnsi from "strip-ansi";
import type { AgentRunner } from "../agent-runner.ts";
import * as db from "../db.ts";

const MAX_MSG_LENGTH = 1800;

export class DiscordBot {
  private client: Client;

  constructor(
    private token: string,
    private channelId: string,
    private runner: AgentRunner,
  ) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // privileged — enable in Discord Dev Portal
      ],
    });

    this.client.on("messageCreate", (msg) => {
      if (msg.author.bot || msg.channelId !== this.channelId) {
        return;
      }
      const text = msg.content.trim();
      // Expect "@agent-name message" format
      const match = text.match(/^@(\S+)\s+([\s\S]+)$/);
      if (!match) {
        return;
      }
      const [, agentName, content] = match;
      const agent = db.getAgents().find((a) => a.name === agentName);
      if (agent) {
        this.runner.sendMessage(agent.id, content);
      } else {
        void msg.reply(`Unknown agent: ${agentName}`);
      }
    });

    this.client.on("ready", () => {
      console.log(`[discord] Bot ready as ${this.client.user?.tag}`);
    });
  }

  async launch(): Promise<void> {
    await this.client.login(this.token);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
    console.log("[discord] Bot stopped");
  }

  async sendOutput(agentName: string, raw: string): Promise<void> {
    const clean = stripAnsi(raw).trim();
    if (!clean) {
      return;
    }
    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (!channel || !("send" in channel)) {
        return;
      }
      const prefix = `[${agentName}] `;
      const body = clean.slice(0, MAX_MSG_LENGTH - prefix.length);
      await (channel as { send: (msg: string) => Promise<unknown> }).send(prefix + body);
    } catch (e) {
      console.error("[discord] send error:", e);
    }
  }
}
