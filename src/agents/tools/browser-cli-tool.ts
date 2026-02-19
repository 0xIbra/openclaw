/**
 * Browser CLI Tool
 *
 * Agent tool for browser automation using playwright-cli.
 * This is the recommended browser tool - token-efficient and simple.
 */

import { Type } from "@sinclair/typebox";
import { BrowserClient, isPlaywrightCliAvailable } from "../../browser-cli/client.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, imageResultFromFile, jsonResult, readStringParam } from "./common.js";

const log = createSubsystemLogger("browser-cli-tool");

const BROWSER_ACTIONS = [
  "open",
  "close",
  "goto",
  "click",
  "fill",
  "type",
  "press",
  "snapshot",
  "screenshot",
  "eval",
  "hover",
  "check",
  "uncheck",
  "select",
] as const;

const BrowserCliToolSchema = Type.Object({
  action: stringEnum(BROWSER_ACTIONS),
  url: Type.Optional(Type.String({ description: "URL for open/goto actions" })),
  ref: Type.Optional(
    Type.String({ description: "Element reference (e.g., e12) for click/fill actions" }),
  ),
  text: Type.Optional(Type.String({ description: "Text to type or fill" })),
  key: Type.Optional(Type.String({ description: "Key to press (Enter, Tab, etc.)" })),
  expression: Type.Optional(Type.String({ description: "JavaScript expression for eval action" })),
  selector: Type.Optional(Type.String({ description: "CSS selector (for advanced use)" })),
  filename: Type.Optional(Type.String({ description: "Screenshot filename" })),
  headless: Type.Optional(Type.Boolean({ description: "Run in headless mode (default: true)" })),
  session: Type.Optional(Type.String({ description: "Session name for isolation" })),
  waitFor: Type.Optional(Type.String({ description: "Wait for selector or text after action" })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
});

// Session cache for reuse within a tool invocation
const sessionCache = new Map<string, BrowserClient>();

async function getOrCreateClient(
  sessionId: string,
  headless: boolean,
): Promise<{ client: BrowserClient; isNew: boolean }> {
  const cached = sessionCache.get(sessionId);
  if (cached) {
    return { client: cached, isNew: false };
  }

  const client = new BrowserClient({
    agentId: sessionId,
    headless,
  });

  await client.start();
  sessionCache.set(sessionId, client);
  return { client, isNew: true };
}

export function createBrowserCliTool(): AnyAgentTool {
  return {
    label: "Browser (playwright-cli)",
    name: "browser_cli",
    description: `Control a web browser using playwright-cli for automation tasks.

Use this tool for:
- Navigating to websites and interacting with them
- Filling forms and clicking buttons
- Taking screenshots
- Extracting data from web pages
- Testing web applications

WORKFLOW:
1. OPEN: action="open" url="https://example.com"
2. SNAPSHOT: action="snapshot" → returns element refs like [ref=e12]
3. ACT: action="click" ref="e12" or action="fill" ref="e3" text="value"
4. VERIFY: action="screenshot" or action="snapshot"
5. CLOSE: action="close"

IMPORTANT: Element refs (e12, e3, etc.) change after page navigation. Always get a fresh snapshot after navigating to a new page.

EXAMPLES:
- Navigate: {"action": "open", "url": "https://google.com"}
- Get refs: {"action": "snapshot"}
- Click: {"action": "click", "ref": "e12"}
- Type: {"action": "fill", "ref": "e3", "text": "search query"}
- Press key: {"action": "press", "key": "Enter"}
- Screenshot: {"action": "screenshot"}
- JavaScript: {"action": "eval", "expression": "document.title"}
- Close: {"action": "close"}`,
    parameters: BrowserCliToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const sessionId = readStringParam(params, "session") ?? "default";
      const headless = params.headless !== false; // default true

      // Check playwright-cli availability
      const available = await isPlaywrightCliAvailable();
      if (!available) {
        return jsonResult({
          ok: false,
          error: "playwright-cli is not installed. Install with: npm install -g @playwright/cli",
        });
      }

      try {
        // Handle close action separately - doesn't need client creation
        if (action === "close") {
          const cached = sessionCache.get(sessionId);
          if (cached) {
            await cached.stop();
            sessionCache.delete(sessionId);
            return jsonResult({ ok: true, message: `Session ${sessionId} closed` });
          }
          return jsonResult({ ok: true, message: "No active session to close" });
        }

        const { client, isNew } = await getOrCreateClient(sessionId, headless);
        const results: Record<string, unknown> = { session: sessionId, isNewSession: isNew };

        switch (action) {
          case "open": {
            const url = readStringParam(params, "url", { required: true });
            const navResult = await client.navigate(url);
            results.url = navResult.url;
            results.title = navResult.title;
            break;
          }

          case "goto": {
            const url = readStringParam(params, "url", { required: true });
            const navResult = await client.navigate(url);
            results.url = navResult.url;
            results.title = navResult.title;
            break;
          }

          case "click": {
            const ref = readStringParam(params, "ref", { required: true });
            await client.click(ref);
            results.clicked = ref;
            break;
          }

          case "fill": {
            const ref = readStringParam(params, "ref", { required: true });
            const text = readStringParam(params, "text", { required: true });
            await client.type(ref, text);
            results.filled = ref;
            results.text = text;
            break;
          }

          case "type": {
            const text = readStringParam(params, "text", { required: true });
            const typeRef = readStringParam(params, "ref");
            if (typeRef) {
              await client.type(typeRef, text);
            } else {
              // Type into currently focused element using eval
              await client.evaluate(
                `document.activeElement?.value = "${text.replace(/"/g, '\\"')}"`,
              );
            }
            results.typed = text;
            break;
          }

          case "press": {
            const key = readStringParam(params, "key", { required: true });
            await client.press(key);
            results.pressed = key;
            break;
          }

          case "snapshot": {
            const snapshot = await client.snapshot();
            results.url = snapshot.url;
            results.title = snapshot.title;
            results.elements = snapshot.elements;
            results.elementCount = snapshot.elements.length;
            // Format refs for easy reading
            results.refs = snapshot.elements.map((el) => ({
              ref: el.ref,
              role: el.role,
              name: el.name,
            }));
            break;
          }

          case "screenshot": {
            const filename = readStringParam(params, "filename");
            const screenshotPath = await client.screenshot(
              filename ? { path: filename } : undefined,
            );
            results.screenshot = screenshotPath;

            // Return image result if file exists
            if (screenshotPath) {
              try {
                const imageResult = await imageResultFromFile({
                  label: "Screenshot",
                  path: screenshotPath,
                });
                return imageResult;
              } catch {
                // Fall through to json result
              }
            }
            break;
          }

          case "eval": {
            const expression = readStringParam(params, "expression", { required: true });
            const result = await client.evaluate(expression);
            results.expression = expression;
            results.result = result;
            break;
          }

          case "hover": {
            const ref = readStringParam(params, "ref", { required: true });
            await client.hover(ref);
            results.hovered = ref;
            break;
          }

          case "check": {
            const ref = readStringParam(params, "ref", { required: true });
            // Use eval to check checkbox
            await client.evaluate(`document.querySelector('[ref="${ref}"]')?.click()`);
            results.checked = ref;
            break;
          }

          case "uncheck": {
            const ref = readStringParam(params, "ref", { required: true });
            await client.evaluate(`document.querySelector('[ref="${ref}"]')?.click()`);
            results.unchecked = ref;
            break;
          }

          case "select": {
            const ref = readStringParam(params, "ref", { required: true });
            const selectText = readStringParam(params, "text", { required: true });
            await client.selectOption(ref, [selectText]);
            results.selected = ref;
            results.value = selectText;
            break;
          }

          default:
            return jsonResult({
              ok: false,
              error: `Unknown action: ${action}`,
              supportedActions: BROWSER_ACTIONS,
            });
        }

        // Handle waitFor if specified
        const waitFor = readStringParam(params, "waitFor");
        if (waitFor) {
          await client.wait({ selector: waitFor, timeout: (params.timeout as number) ?? 5000 });
          results.waitedFor = waitFor;
        }

        results.ok = true;
        return jsonResult(results);
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        log.error(`Browser CLI tool error: ${errorText}`);

        // Clean up session on error
        const cached = sessionCache.get(sessionId);
        if (cached) {
          await cached.stop().catch(() => {});
          sessionCache.delete(sessionId);
        }

        return jsonResult({
          ok: false,
          error: errorText,
          hint: "Make sure playwright-cli is installed: npm install -g @playwright/cli",
        });
      }
    },
  };
}

// Cleanup function for graceful shutdown
export async function cleanupBrowserCliSessions(): Promise<void> {
  for (const [sessionId, client] of sessionCache.entries()) {
    try {
      await client.stop();
      log.info(`Cleaned up browser-cli session: ${sessionId}`);
    } catch {
      // Ignore cleanup errors
    }
  }
  sessionCache.clear();
}
