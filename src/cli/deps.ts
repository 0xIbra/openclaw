import type { sendMessageDiscord } from "../discord/send.js";
import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import type { sendMessageTelegram } from "../telegram/send.js";

export type CliDeps = {
  sendMessageTelegram: typeof sendMessageTelegram;
  sendMessageDiscord: typeof sendMessageDiscord;
};

export function createDefaultDeps(): CliDeps {
  return {
    sendMessageTelegram: async (...args) => {
      const { sendMessageTelegram } = await import("../telegram/send.js");
      return await sendMessageTelegram(...args);
    },
    sendMessageDiscord: async (...args) => {
      const { sendMessageDiscord } = await import("../discord/send.js");
      return await sendMessageDiscord(...args);
    },
  };
}

// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return {
    sendTelegram: deps.sendMessageTelegram,
    sendDiscord: deps.sendMessageDiscord,
  };
}
