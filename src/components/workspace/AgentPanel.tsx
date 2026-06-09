import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Send,
  Trash2,
  Loader2,
  MessageSquare,
  Bot,
  ChevronDown,
  Plus,
  Clock,
} from "lucide-react";
import { cn, formatRelativeTime } from "../../lib/utils";
import { useChatStore } from "../../stores/chatStore";
import { chatAsk, chatRefineCheck, chatRefineApply } from "../../lib/tauri";
import { ChatMessage } from "../chat/ChatMessage";
import { ImpactNotification } from "../chat/ImpactNotification";
import { PhaseActions } from "../chat/PhaseActions";
import { QuotaCost } from "../ui/QuotaCost";
import type { ChatMessage as ChatMessageType, ChatHistoryEntry } from "../../types/chat";
import type { FrontendStreamEvent } from "../../types/execution";
import { useOptionalEpicContext } from "../../contexts/EpicContext";
import { useWorkspaceStore } from "../../stores/workspaceStore";

export function AgentPanel() {
  const store = useChatStore();
  const epicCtx = useOptionalEpicContext();
  const agentPanelCollapsed = useWorkspaceStore((s) => s.agentPanelCollapsed);
  const setAgentPanelCollapsed = useWorkspaceStore((s) => s.setAgentPanelCollapsed);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  const epicId = epicCtx?.data?.epic.id ?? "";
  const targetDir = epicCtx?.data?.epic.target_dir ?? "";

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSessionDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSessionDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSessionDropdown]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [store.messages, store.streamingContent]);

  const getHistory = useCallback((): ChatHistoryEntry[] => {
    return store.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  }, [store.messages]);

  const handleStreamEvent = useCallback((event: FrontendStreamEvent) => {
    if (event.kind === "text") {
      store.appendStreamingContent(event.content);
    }
  }, [store]);

  // Derive review scope from current planning step
  const getReviewScope = (): "specs" | "tickets" | "phases" => {
    const step = epicCtx?.step;
    if (step === "specs_review") return "specs";
    if (step === "tickets_review") return "tickets";
    return "phases";
  };

  const handleSend = async () => {
    const text = inputValue.trim();

    // Review mode: allow empty submit for auto-review
    if (store.mode === "review") {
      if (store.isStreaming || !epicCtx) return;
      const scope = getReviewScope();
      if (text) {
        const userMessage: ChatMessageType = {
          id: `msg_${Date.now()}`,
          role: "user",
          content: text,
          timestamp: new Date().toISOString(),
        };
        store.addMessage(userMessage);
        setInputValue("");
      }
      epicCtx.handleReviewPlan(scope, text || null);
      return;
    }

    if (!text || store.isStreaming || !epicId) return;

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

    store.setStreaming(true);
    store.updateStreamingContent("");

    try {
      if (store.mode === "ask") {
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
        store.setAnalyzingImpact(true);
        const impact = await chatRefineCheck(
          epicId, targetDir, text,
          userMessage.contextSnippets || [],
          getHistory(),
          handleStreamEvent,
        );
        const analysisMsg: ChatMessageType = {
          id: `msg_${Date.now()}`,
          role: "assistant",
          content: store.streamingContent || "Impact analysis complete.",
          timestamp: new Date().toISOString(),
        };
        store.addMessage(analysisMsg);
        store.setAnalyzingImpact(false);
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

  const handleConfirmImpact = async () => {
    if (!store.pendingImpact) return;
    const impact = store.pendingImpact;
    store.setPendingImpact(null);
    store.setApplyingChanges(true);
    store.setStreaming(true);
    store.updateStreamingContent("");

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
      epicCtx?.reload();
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

  if (agentPanelCollapsed) return null;

  return (
    <div className="h-full flex flex-col bg-surface-0 border-l border-neutral-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 flex-shrink-0">
        {/* Session selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowSessionDropdown((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-neutral-200 transition-colors max-w-[180px]"
          >
            <span className="truncate">
              {store.sessions.find((s) => s.id === store.currentSessionId)?.title ?? "Agent Chat"}
            </span>
            <ChevronDown className={cn("w-3 h-3 flex-shrink-0 transition-transform", showSessionDropdown && "rotate-180")} />
          </button>

          <AnimatePresence>
            {showSessionDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 top-full mt-1 w-64 bg-surface-1 border border-neutral-800 rounded-lg shadow-xl z-50 overflow-hidden"
              >
                {/* New chat button */}
                <button
                  onClick={() => {
                    if (targetDir && epicId) {
                      store.createNewSession(targetDir, epicId);
                    }
                    setShowSessionDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors border-b border-neutral-800/50"
                >
                  <Plus className="w-3 h-3" />
                  New Chat
                </button>

                {/* Session list */}
                <div className="max-h-[240px] overflow-y-auto">
                  {store.sessions.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-neutral-600 text-center">
                      No chat history
                    </div>
                  ) : (
                    store.sessions.map((session) => (
                      <div
                        key={session.id}
                        className={cn(
                          "group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-surface-0/50 transition-colors",
                          store.currentSessionId === session.id && "border-l-2 border-l-emerald-500 bg-surface-0/30"
                        )}
                        onClick={() => {
                          if (targetDir && epicId) {
                            store.switchSession(targetDir, epicId, session.id);
                          }
                          setShowSessionDropdown(false);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-200 truncate">
                            {session.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-neutral-600 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {formatRelativeTime(session.updatedAt)}
                            </span>
                            <span className="text-[10px] text-neutral-600">
                              {session.messageCount} msgs
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (targetDir && epicId) {
                              store.deleteSession(targetDir, epicId, session.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-600 hover:text-red-400 transition-all"
                          title="Delete chat"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-0.5">
          <QuotaCost costUsd={epicCtx?.data?.epic.total_cost_usd ?? 0} iconSize="w-2.5 h-2.5" className="text-[10px]" />
          <button
            onClick={() => {
              if (targetDir && epicId) {
                store.createNewSession(targetDir, epicId);
              }
            }}
            className="p-1.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-surface-1 transition-colors"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setAgentPanelCollapsed(true)}
            className="p-1.5 rounded text-neutral-500 hover:text-neutral-300 hover:bg-surface-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {store.messages.length === 0 && (
          <div className="text-center text-neutral-600 text-xs mt-8">
            <MessageSquare className="w-6 h-6 mx-auto mb-2 text-neutral-700" />
            <p>Start a conversation about your plan</p>
          </div>
        )}

        {store.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

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

        {store.pendingImpact && (
          <ImpactNotification
            impact={store.pendingImpact}
            onConfirm={handleConfirmImpact}
            onCancel={handleCancelImpact}
            isApplying={store.isApplyingChanges}
          />
        )}

        {store.isStreaming && !store.streamingContent && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            {store.isAnalyzingImpact ? "Analyzing impact..." :
             store.isApplyingChanges ? "Applying changes..." :
             "Thinking..."}
          </div>
        )}

        <AnimatePresence>
          {store.isAgentWorking && !store.isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex items-center gap-2 py-2"
            >
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
              <span className="text-xs text-neutral-500">
                {epicCtx?.agentStatusLabel ?? "Working..."}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Phase actions */}
      <PhaseActions />

      {/* Context snippets */}
      {store.contextSnippets.length > 0 && (
        <div className="px-3 py-1.5 border-t border-neutral-800/50 flex-shrink-0">
          <div className="flex flex-wrap gap-1">
            {store.contextSnippets.map((snippet) => (
              <div
                key={snippet.id}
                className="flex items-center gap-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 text-[10px]"
              >
                <span className="text-emerald-400 font-medium">{snippet.sourceTitle}</span>
                <button
                  onClick={() => store.removeContextSnippet(snippet.id)}
                  className="text-neutral-600 hover:text-neutral-300 ml-0.5"
                >
                  <X className="w-2 h-2" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-neutral-800 flex-shrink-0">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              store.mode === "ask" ? "Ask about the plan..." :
              store.mode === "refine" ? "Describe the change..." :
              "Focus area (or empty for full review)..."
            }
            className="flex-1 bg-surface-1 border border-neutral-800 rounded-lg px-3 py-2.5 text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-emerald-500/30 min-h-[36px] max-h-[100px]"
            rows={1}
            disabled={store.isStreaming || !epicId}
          />
          <button
            onClick={handleSend}
            disabled={
              store.mode === "review"
                ? store.isStreaming || !epicId
                : !inputValue.trim() || store.isStreaming || !epicId
            }
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg transition-colors flex-shrink-0",
              (store.mode === "review" ? !store.isStreaming && epicId : inputValue.trim() && !store.isStreaming && epicId)
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

        {/* Ask/Refine/Review mode toggle — below input */}
        <div className="flex items-center gap-1 mt-2">
          <div className="flex items-center bg-surface-1 rounded-lg p-0.5">
            <button
              onClick={() => store.setMode("ask")}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                store.mode === "ask"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              Ask
            </button>
            <button
              onClick={() => store.setMode("refine")}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                store.mode === "refine"
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              Refine
            </button>
            <button
              onClick={() => store.setMode("review")}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                store.mode === "review"
                  ? "bg-blue-500/15 text-blue-400"
                  : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              Review
            </button>
          </div>
          <span className="text-[10px] text-neutral-600 ml-1.5">
            {store.mode === "ask" ? "Ask questions about the plan" :
             store.mode === "refine" ? "Describe changes to make" :
             "Empty for auto-review, or add focus"}
          </span>
        </div>
      </div>
    </div>
  );
}
