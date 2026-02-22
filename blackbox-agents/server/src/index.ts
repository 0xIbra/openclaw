import { resetAgentStatuses } from "./agent-runner.ts";
import * as db from "./db.ts";
import { BotManager, type BotConfig } from "./integrations/bot-manager.ts";
import { createWsServer } from "./ws-server.ts";

const PORT = parseInt(process.env.BLACKBOX_PORT ?? "3001", 10);

// On startup, mark all agents as offline (process was restarted)
resetAgentStatuses();

const botManagerRef: { current: BotManager | null } = { current: null };

// Start WebSocket + HTTP server
const { runner, emit } = createWsServer(PORT, {
  onSettingsChange: () => void reloadBots().catch(console.error),
  botManagerRef,
});

// Create BotManager and wire it up
const botManager = new BotManager(runner, emit);
botManagerRef.current = botManager;

function readBotConfig(): BotConfig {
  const tToken = db.getSetting("telegram_token");
  const tChat = db.getSetting("telegram_chat_id");
  const dToken = db.getSetting("discord_token");
  const dChannel = db.getSetting("discord_channel_id");
  return {
    telegram: tToken && tChat ? { token: tToken, chatId: tChat } : undefined,
    discord: dToken && dChannel ? { token: dToken, channelId: dChannel } : undefined,
  };
}

async function reloadBots(): Promise<void> {
  await botManager.start(readBotConfig());
}

// Auto-start bots if already configured
const initialConfig = readBotConfig();
if (initialConfig.telegram ?? initialConfig.discord) {
  void reloadBots().catch(console.error);
}
