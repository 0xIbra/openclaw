import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ChatMessage as ChatMessageType, ChatContentBlock } from "@/stores/chat.store";
import { cn } from "@/lib/utils";
import { ToolUseBlock } from "./ToolUseBlock";

type Props = {
  message: ChatMessageType;
};

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  // Start open so thinking is visible immediately; user can collapse after streaming ends
  const [open, setOpen] = useState(true);
  const expanded = isStreaming || open;

  return (
    <div className="my-1">
      <button
        onClick={() => {
          if (!isStreaming) {
            setOpen((v) => !v);
          }
        }}
        className="flex items-center gap-1 text-xs text-tron-muted-fg hover:text-tron-cyan transition-colors"
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="italic">{isStreaming ? "Thinking..." : "Thinking"}</span>
        {isStreaming && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-tron-purple/70 animate-pulse ml-1" />
        )}
      </button>
      {expanded && (
        <div className="mt-1 px-3 py-2 rounded-sm bg-tron-surface2 border border-tron-border text-xs text-tron-muted-fg italic whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

function renderBlock(block: ChatContentBlock, idx: number, isStreaming?: boolean) {
  if (block.type === "text") {
    return (
      <p key={idx} className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
        {block.text}
      </p>
    );
  }
  if (block.type === "thinking") {
    return <ThinkingBlock key={idx} thinking={block.thinking} isStreaming={isStreaming} />;
  }
  if (block.type === "tool_use") {
    return <ToolUseBlock key={idx} name={block.name} input={block.input} />;
  }
  if (block.type === "tool_result") {
    return (
      <div
        key={idx}
        className="my-1 rounded-sm border border-tron-border bg-tron-surface2 px-3 py-2 text-xs font-mono text-tron-muted-fg"
      >
        <span className="text-tron-cyan">tool_result</span>: {block.content}
      </div>
    );
  }
  return null;
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-[3px] h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-tron-purple/70 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";
  const isStreaming = message.state === "streaming";
  const isError = message.state === "error";
  const isAborted = message.state === "aborted";
  const isEmpty = message.content.length === 0;

  return (
    <div className={cn("flex gap-3 px-4 py-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "w-7 h-7 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
          isUser
            ? "bg-tron-cyan/20 text-tron-cyan border border-tron-cyan/30"
            : "bg-tron-purple/20 text-tron-purple border border-tron-purple/30",
        )}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[78%] rounded-sm px-4 py-2.5 space-y-1",
          isUser
            ? "bg-tron-cyan/10 border border-tron-cyan/20"
            : "bg-tron-surface2 border border-tron-border",
          isError && "border-tron-red/40 bg-tron-red/5",
          isAborted && "border-tron-muted/40 opacity-60",
        )}
      >
        {/* Typing indicator — shown while streaming with no content yet */}
        {isStreaming && isEmpty ? (
          <TypingDots />
        ) : (
          message.content.map((block, i) => renderBlock(block, i, isStreaming))
        )}

        {/* Streaming cursor after content */}
        {isStreaming && !isEmpty && (
          <span className="inline-block w-0.5 h-3.5 bg-tron-cyan/70 align-middle animate-pulse ml-0.5" />
        )}

        {isError && (
          <span className="text-xs text-tron-red">Error occurred during generation.</span>
        )}
        {isAborted && <span className="text-xs text-tron-muted-fg italic">Aborted.</span>}
      </div>
    </div>
  );
}
