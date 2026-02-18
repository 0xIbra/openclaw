import { describe, expect, it, vi } from "vitest";
import type { TemplateContext } from "../templating.js";
import type { TypingController } from "./typing.js";
import { clearInlineDirectives } from "./get-reply-directives-utils.js";
import { buildTestCtx } from "./test-ctx.js";

const handleCommandsMock = vi.fn();

vi.mock("./commands.js", () => ({
  handleCommands: (...args: unknown[]) => handleCommandsMock(...args),
  buildStatusReply: vi.fn(),
  buildCommandContext: vi.fn(),
}));

// Import after mocks.
const { handleInlineActions } = await import("./get-reply-inline-actions.js");

describe("handleInlineActions", () => {
  it("continues when config is empty and channel has no skipWhenConfigEmpty rule", async () => {
    handleCommandsMock.mockReset();

    const typing: TypingController = {
      onReplyStart: async () => {},
      startTypingLoop: async () => {},
      startTypingOnText: async () => {},
      refreshTypingTtl: () => {},
      isActive: () => false,
      markRunComplete: () => {},
      markDispatchIdle: () => {},
      cleanup: vi.fn(),
    };

    const ctx = buildTestCtx({
      From: "telegram:999",
      To: "telegram:123",
      Body: "hi",
    });

    const result = await handleInlineActions({
      ctx,
      sessionCtx: ctx as unknown as TemplateContext,
      cfg: {},
      agentId: "main",
      sessionKey: "s:main",
      workspaceDir: "/tmp",
      isGroup: false,
      typing,
      allowTextCommands: false,
      inlineStatusRequested: false,
      command: {
        surface: "telegram",
        channel: "telegram",
        channelId: "telegram",
        ownerList: [],
        senderIsOwner: false,
        isAuthorizedSender: false,
        senderId: undefined,
        abortKey: "telegram:999",
        rawBodyNormalized: "hi",
        commandBodyNormalized: "hi",
        from: "telegram:999",
        to: "telegram:123",
      },
      directives: clearInlineDirectives("hi"),
      cleanedBody: "hi",
      elevatedEnabled: false,
      elevatedAllowed: false,
      elevatedFailures: [],
      defaultActivation: () => ({ enabled: true, message: "" }),
      resolvedThinkLevel: undefined,
      resolvedVerboseLevel: undefined,
      resolvedReasoningLevel: "off",
      resolvedElevatedLevel: "off",
      resolveDefaultThinkingLevel: () => "off",
      provider: "openai",
      model: "gpt-4o-mini",
      contextTokens: 0,
      abortedLastRun: false,
      sessionScope: "per-sender",
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: "continue",
      }),
    );
    expect(handleCommandsMock).toHaveBeenCalledTimes(1);
  });
});
