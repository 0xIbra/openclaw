import type { OpenClawApp } from "./app.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadConfig, saveConfig } from "./controllers/config.ts";

export async function handleChannelConfigSave(host: OpenClawApp) {
  await saveConfig(host);
  await loadConfig(host);
  await loadChannels(host, true);
}

export async function handleChannelConfigReload(host: OpenClawApp) {
  await loadConfig(host);
  await loadChannels(host, true);
}
