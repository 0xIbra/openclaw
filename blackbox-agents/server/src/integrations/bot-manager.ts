import type { AgentRunner, EmitFn } from "../agent-runner.ts";
import * as db from "../db.ts";
import { DiscordBot } from "./discord.ts";
import { TelegramBot } from "./telegram.ts";

export type BotConfig = {
  telegram?: { token: string; chatId: string };
  discord?: { token: string; channelId: string };
};

type OutputBuffer = {
  text: string;
  timer: ReturnType<typeof setTimeout>;
};

const BATCH_MS = 500;

export class BotManager {
  private telegram: TelegramBot | null = null;
  private discord: DiscordBot | null = null;
  private outputUnsubs: (() => void)[] = [];
  private buffers = new Map<string, OutputBuffer>();

  constructor(
    private runner: AgentRunner,
    private emit: EmitFn,
  ) {}

  async start(config: BotConfig): Promise<void> {
    await this.stop();

    if (config.telegram?.token && config.telegram?.chatId) {
      this.telegram = new TelegramBot(
        config.telegram.token,
        config.telegram.chatId,
        this.runner,
        this.emit,
      );
      await this.telegram.launch().catch((e) => {
        console.error("[telegram] Failed to start:", e);
        this.telegram = null;
      });
    }

    if (config.discord?.token && config.discord?.channelId) {
      this.discord = new DiscordBot(config.discord.token, config.discord.channelId, this.runner);
      await this.discord.launch().catch((e) => {
        console.error("[discord] Failed to start:", e);
        this.discord = null;
      });
    }

    // Subscribe to output of all currently running agents
    for (const agent of db.getAgents()) {
      if (agent.status !== "offline") {
        this.subscribeAgent(agent.id);
      }
    }
  }

  async stop(): Promise<void> {
    // Cancel all timers and clear buffers
    for (const buf of this.buffers.values()) {
      clearTimeout(buf.timer);
    }
    this.buffers.clear();

    for (const unsub of this.outputUnsubs) {
      unsub();
    }
    this.outputUnsubs = [];

    this.telegram?.stop();
    if (this.discord) {
      await this.discord.stop().catch(() => {});
    }
    this.telegram = null;
    this.discord = null;
  }

  /** Subscribe to PTY output for a given agent. Called after agent starts/restarts. */
  subscribeAgent(agentId: string): void {
    if (!this.telegram && !this.discord) {
      return;
    }
    const unsub = this.runner.subscribeToOutput(agentId, (data) =>
      this.handleOutput(agentId, data),
    );
    this.outputUnsubs.push(unsub);
  }

  private handleOutput(agentId: string, data: string): void {
    if (!this.telegram && !this.discord) {
      return;
    }
    const agent = db.getAgents().find((a) => a.id === agentId);
    if (!agent) {
      return;
    }

    let buf = this.buffers.get(agentId);
    if (!buf) {
      buf = { text: "", timer: setTimeout(() => {}, 0) };
      this.buffers.set(agentId, buf);
    }
    clearTimeout(buf.timer);
    buf.text += data;

    const agentName = agent.name;
    const currentBuf = buf;
    currentBuf.timer = setTimeout(async () => {
      const text = currentBuf.text;
      currentBuf.text = "";
      await this.telegram?.sendOutput(agentName, text);
      await this.discord?.sendOutput(agentName, text);
    }, BATCH_MS);
  }
}
