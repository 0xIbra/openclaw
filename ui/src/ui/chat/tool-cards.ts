import { html, nothing } from "lit";
import type { ToolCard } from "../types/chat-types.ts";
import { icons } from "../icons.ts";
import { formatToolDetail, resolveToolDisplay } from "../tool-display.ts";
import { extractTextCached } from "./message-extract.ts";
import { isToolResultMessage } from "./message-normalizer.ts";

export function extractToolCards(message: unknown): ToolCard[] {
  const m = message as Record<string, unknown>;
  const content = normalizeContent(m.content);

  // Collect calls and results in document order, then pair them by position
  // so each tool call renders as one card (call args + result output together).
  const calls: Array<{ name: string; args: unknown }> = [];
  const results: Array<{ name: string; text: string | undefined }> = [];

  for (const item of content) {
    const kind = (typeof item.type === "string" ? item.type : "").toLowerCase();
    const isCall =
      ["toolcall", "tool_call", "tooluse", "tool_use"].includes(kind) ||
      (typeof item.name === "string" && item.arguments != null);
    const isResult = kind === "toolresult" || kind === "tool_result";

    if (isCall) {
      calls.push({
        name: (item.name as string) ?? "tool",
        args: coerceArgs(item.arguments ?? item.args),
      });
    } else if (isResult) {
      results.push({
        name: typeof item.name === "string" ? item.name : "tool",
        text: extractToolText(item),
      });
    }
  }

  // Fallback: whole-message tool result (e.g. role=toolresult with text content)
  if (isToolResultMessage(message) && results.length === 0 && calls.length === 0) {
    const name =
      (typeof m.toolName === "string" && m.toolName) ||
      (typeof m.tool_name === "string" && m.tool_name) ||
      "tool";
    results.push({ name, text: extractTextCached(message) ?? undefined });
  }

  // Pair calls with results by position — produce one card per tool call.
  const cards: ToolCard[] = [];
  const len = Math.max(calls.length, results.length);
  for (let i = 0; i < len; i++) {
    const call = calls[i];
    const result = results[i];
    if (call) {
      // Merge result text into the call card when available.
      cards.push({ kind: "call", name: call.name, args: call.args, text: result?.text });
    } else if (result) {
      // Orphan result with no matching call (rare).
      cards.push({ kind: "result", name: result.name, text: result.text });
    }
  }

  return cards;
}

export function renderToolCardSidebar(card: ToolCard, _onOpenSidebar?: (content: string) => void) {
  const display = resolveToolDisplay({ name: card.name, args: card.args });
  const detail = formatToolDetail(display);
  const hasOutput = Boolean(card.text?.trim());
  const hasInput =
    card.args != null &&
    !(
      typeof card.args === "object" &&
      !Array.isArray(card.args) &&
      Object.keys(card.args).length === 0
    );
  const inputJson = hasInput
    ? (() => {
        try {
          return JSON.stringify(card.args, null, 2);
        } catch {
          return String(card.args);
        }
      })()
    : null;

  return html`
    <details class="chat-tool-accordion">
      <summary class="chat-tool-accordion__header">
        <span class="chat-tool-accordion__icon">${icons[display.icon]}</span>
        <span class="chat-tool-accordion__title">${display.label}</span>
        ${detail ? html`<span class="chat-tool-accordion__badge">${detail}</span>` : nothing}
        <span class="chat-tool-accordion__chevron">
          <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </summary>
      <div class="chat-tool-accordion__content">
        ${
          hasInput
            ? html`
          <div class="chat-tool-accordion__section-label">Input</div>
          <div class="chat-tool-accordion__input">${inputJson}</div>
        `
            : nothing
        }
        ${
          hasOutput
            ? html`
          ${
            hasInput
              ? html`
                  <div class="chat-tool-accordion__section-label">Output</div>
                `
              : nothing
          }
          <div class="chat-tool-accordion__output">${card.text}</div>
        `
            : html`
                <div class="chat-tool-accordion__empty">No output</div>
              `
        }
      </div>
    </details>
  `;
}

function normalizeContent(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(Boolean) as Array<Record<string, unknown>>;
}

function coerceArgs(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractToolText(item: Record<string, unknown>): string | undefined {
  if (typeof item.text === "string") {
    return item.text;
  }
  if (typeof item.content === "string") {
    return item.content;
  }
  return undefined;
}
