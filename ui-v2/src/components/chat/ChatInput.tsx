import { Send, Square } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  onSend: (text: string) => void;
  onAbort: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
};

export function ChatInput({ onSend, onAbort, disabled, isStreaming }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-tron-border bg-tron-surface px-4 py-3">
      <div
        className={cn(
          "flex items-end gap-2 rounded-sm border bg-tron-surface2 px-3 py-2 transition-colors",
          isStreaming
            ? "border-tron-cyan/30"
            : "border-tron-border focus-within:border-tron-cyan/40",
        )}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? "Generating response..."
              : "Message Opengrid... (Enter to send, Shift+Enter for newline)"
          }
          disabled={disabled || isStreaming}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-tron-muted-fg",
            "outline-none border-none focus:outline-none min-h-[24px] max-h-[200px]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        />
        {isStreaming ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onAbort}
            className="h-7 w-7 p-0 text-tron-red hover:text-tron-red hover:bg-tron-red/10 shrink-0"
          >
            <Square size={14} fill="currentColor" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="h-7 w-7 p-0 text-tron-cyan hover:text-tron-cyan hover:bg-tron-cyan/10 shrink-0 disabled:opacity-30"
          >
            <Send size={14} />
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-[10px] text-tron-muted-fg text-center">
        Opengrid AI may make mistakes. Verify important outputs.
      </p>
    </div>
  );
}
