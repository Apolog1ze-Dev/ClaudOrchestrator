import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  Send,
  Trash2,
  Loader2,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chatStore";
import { chatAsk, chatRefineCheck, chatRefineApply } from "../../lib/tauri";
import { ChatMessage } from "./ChatMessage";
import { ImpactNotification } from "./ImpactNotification";
import type { ChatMessage as ChatMessageType, ChatHistoryEntry } from "../../types/chat";
import type { FrontendStreamEvent } from "../../types/execution";

interface ChatSidebarProps {
  epicId: string;
  targetDir: string;
  onPlanUpdated: () => void;
}

export function ChatSidebar({ epicId, targetDir, onPlanUpdated }: ChatSidebarProps) {
  const store = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [store.messages, store.streamingContent]);

  // Build conversation history for the backend
  const getHistory = useCallback((): ChatHistoryEntry[] => {
    return store.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }, [store.messages]);

  // Stream event handler for accumulating text
  const handleStreamEvent = useCallback((event: FrontendStreamEvent) => {
    if (event.kind === "text") {
      store.appendStreamingContent(event.content);
    }
  }, [store]);

  // Send a message
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || store.isStreaming) return;

    const msgId = `msg_${Date.now()}`;
    const userMessage: ChatMessageType = {
      id: msgId,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      contextSnippets: store.contextSnippets.length > 0 ? [...store.contextSnippets] : undefined,
    };

    store.addMessage(userMessage);
    store.clearContextSnippets();
    setInputValue("");

    // Start streaming
    store.setStreaming(true);
    store.updateStreamingContent("");

    try {
      if (store.mode === "ask") {
        // Ask mode — stream text answer
        const result = await chatAsk(
          epicId, targetDir, text,
          userMessage.contextSnippets || [],
          getHistory(),
          handleStreamEvent,
        );

        const assistantMsg: ChatMessageType = {
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: result || store.streamingContent,
          timestamp: new Date().toISOString(),
        };
        store.addMessage(assistantMsg);
      } else {
        // Refine mode — first run impact check
        store.setAnalyzingImpact(true);

        const impact = await chatRefineCheck(
          epicId, targetDir, text,
          userMessage.contextSnippets || [],
          getHistory(),
          handleStreamEvent,
        );

        // Show analysis as system message
        const analysisMsg: ChatMessageType = {
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: store.streamingContent || "Impact analysis complete.",
          timestamp: new Date().toISOString(),
        };
        store.addMessage(analysisMsg);
        store.setAnalyzingImpact(false);

        // Store pending impact for user confirmation
        store.setPendingImpact(impact);
      }
    } catch (e) {
      const errorMsg: ChatMessageType = {
        id: `msg_${Date.now()}`,
        role: "system",
        content: `Error: ${String(e)}`,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(errorMsg);
      store.setAnalyzingImpact(false);
    } finally {
      store.setStreaming(false);
      store.updateStreamingContent("");
    }
  };

  // Handle confirm impact
  const handleConfirmImpact = async () => {
    if (!store.pendingImpact) return;

    const impact = store.pendingImpact;
    store.setPendingImpact(null);
    store.setApplyingChanges(true);
    store.setStreaming(true);
    store.updateStreamingContent("");

    // Find the last user message to know what was requested
    const lastUserMsg = [...store.messages].reverse().find((m) => m.role === "user");
    const message = lastUserMsg?.content || "";

    try {
      const summary = await chatRefineApply(
        epicId, targetDir, message,
        lastUserMsg?.contextSnippets || [],
        impact,
        getHistory(),
        handleStreamEvent,
      );

      const appliedMsg: ChatMessageType = {
        id: `msg_${Date.now()}`,
        role: "system",
        content: summary || store.streamingContent || "Changes applied successfully.",
        timestamp: new Date().toISOString(),
        messageType: "applied",
      };
      store.addMessage(appliedMsg);

      // Refresh the epic page
      onPlanUpdated();
    } catch (e) {
      const errorMsg: ChatMessageType = {
        id: `msg_${Date.now()}`,
        role: "system",
        content: `Error applying changes: ${String(e)}`,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(errorMsg);
    } finally {
      store.setApplyingChanges(false);
      store.setStreaming(false);
      store.updateStreamingContent("");
    }
  };

  const handleCancelImpact = () => {
    store.setPendingImpact(null);
    const cancelMsg: ChatMessageType = {
      id: `msg_${Date.now()}`,
      role: "system",
      content: "Changes cancelled. The plan was not modified.",
      timestamp: new Date().toISOString(),
    };
    store.addMessage(cancelMsg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!store.isOpen) return null;

  return (
    <motion.div
      initial={{ x: 400 }}
      animate={{ x: 0 }}
      exit={{ x: 400 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed right-0 top-0 h-screen w-[400px] bg-surface-0 border-l border-neutral-800 z-20 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center bg-surface-1 rounded-lg p-0.5">
            <button
              onClick={() => store.setMode("ask")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                store.mode === "ask"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              <MessageSquare className="w-3 h-3" />
              Ask
            </button>
            <button
              onClick={() => store.setMode("refine")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                store.mode === "refine"
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              <Wrench className="w-3 h-3" />
              Refine
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={store.clearChat}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-surface-1 transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => store.setOpen(false)}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-surface-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mode hint */}
      <div className="px-4 py-2 border-b border-neutral-800/50 flex-shrink-0">
        <p className="text-[10px] text-neutral-600">
          {store.mode === "ask"
            ? "Ask questions about the plan. Select text in documents to add context."
            : "Describe changes to make. Impact will be analyzed before applying."}
        </p>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {store.messages.length === 0 && (
          <div className="text-center text-neutral-600 text-sm mt-12">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 text-neutral-700" />
            <p>Start a conversation about your plan</p>
            <p className="text-xs mt-1">Select text in documents to add context</p>
          </div>
        )}

        {store.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {store.isStreaming && store.streamingContent && (
          <ChatMessage
            message={{
              id: "streaming",
              role: "assistant",
              content: "",
              timestamp: new Date().toISOString(),
            }}
            isStreamingCurrent
            streamingContent={store.streamingContent}
          />
        )}

        {/* Pending impact notification */}
        {store.pendingImpact && (
          <ImpactNotification
            impact={store.pendingImpact}
            onConfirm={handleConfirmImpact}
            onCancel={handleCancelImpact}
            isApplying={store.isApplyingChanges}
          />
        )}

        {/* Loading indicators */}
        {store.isStreaming && !store.streamingContent && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            {store.isAnalyzingImpact ? "Analyzing impact..." :
             store.isApplyingChanges ? "Applying changes..." :
             store.isReviewingCoherency ? "Reviewing coherency..." :
             "Thinking..."}
          </div>
        )}
      </div>

      {/* Context snippets */}
      {store.contextSnippets.length > 0 && (
        <div className="px-4 py-2 border-t border-neutral-800/50 flex-shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {store.contextSnippets.map((snippet) => (
              <div
                key={snippet.id}
                className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-0.5 text-[10px]"
              >
                <span className="text-emerald-400 font-medium">{snippet.sourceTitle}</span>
                <span className="text-neutral-500 max-w-[120px] truncate">{snippet.text}</span>
                <button
                  onClick={() => store.removeContextSnippet(snippet.id)}
                  className="text-neutral-600 hover:text-neutral-300 ml-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-neutral-800 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={store.mode === "ask" ? "Ask about the plan..." : "Describe the change..."}
            className="flex-1 bg-surface-1 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-emerald-500/30 min-h-[40px] max-h-[120px]"
            rows={1}
            disabled={store.isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || store.isStreaming}
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-xl transition-colors flex-shrink-0",
              inputValue.trim() && !store.isStreaming
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-neutral-800 text-neutral-600 cursor-not-allowed",
            )}
          >
            {store.isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
