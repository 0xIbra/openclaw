import type { FinalizedMsgContext, MsgContext } from "../templating.js";
import { finalizeInboundContext } from "./inbound-context.js";

export function buildTestCtx(overrides: Partial<MsgContext> = {}): FinalizedMsgContext {
  return finalizeInboundContext({
    Body: "",
    CommandBody: "",
    CommandSource: "text",
    From: "telegram:+1000",
    To: "telegram:+2000",
    ChatType: "direct",
    Provider: "telegram",
    Surface: "telegram",
    CommandAuthorized: false,
    ...overrides,
  });
}
