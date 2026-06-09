import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Bot, AlertTriangle, CheckCircle, ChevronDown, Target, MessageSquare } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ChatMessage as ChatMessageType } from "../../types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreamingCurrent?: boolean;
  streamingContent?: string;
}

export function ChatMessage({ message, isStreamingCurrent, streamingContent }: ChatMessageProps) {
  const content = isStreamingCurrent ? (streamingContent || "") : message.content;

  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%]">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <p className="text-sm text-neutral-200 whitespace-pre-wrap">{message.content}</p>
          </div>
          {/* Context snippets */}
          {message.contextSnippets && message.contextSnippets.length > 0 && (
            <div className="flex flex-col gap-1 mt-1.5">
              {message.contextSnippets.map((snippet) => (
                <div
                  key={snippet.id}
                  className="bg-surface-0 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs"
                >
                  <span className="text-emerald-400 font-medium">{snippet.sourceTitle}</span>
                  <span className="text-neutral-500 ml-1.5">
                    {snippet.text.length > 80 ? snippet.text.slice(0, 80) + "..." : snippet.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // Objective message — user's initial prompt
  if (message.messageType === "objective") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="flex items-center justify-end gap-1.5 mb-1">
            <span className="text-[10px] text-neutral-500 font-medium">Your Objective</span>
            <Target className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            <p className="text-sm text-neutral-200 whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Progress messages — compact inline status updates
  if (message.messageType === "progress") {
    const isStart = message.metadata?.progressType === "start";
    const isComplete = message.metadata?.progressType === "complete";

    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 py-1"
      >
        {isStart && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        {isComplete && <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
        <span className={cn(
          "text-xs",
          isStart ? "text-emerald-400 font-medium" : "text-emerald-400",
        )}>
          {message.content}
        </span>
      </motion.div>
    );
  }

  // Clarifying Q&A — question + answer card
  if (message.messageType === "clarifying_qa") {
    const q = message.metadata?.question ?? "";
    const a = message.metadata?.answer ?? "";

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-neutral-800 overflow-hidden"
      >
        <div className="bg-surface-1 px-3 py-2 border-b border-neutral-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-neutral-500 font-medium">Clarifying Question</span>
          </div>
          <p className="text-xs text-neutral-300">{q}</p>
        </div>
        <div className="bg-emerald-500/5 px-3 py-2">
          <p className="text-xs text-emerald-300">{a}</p>
        </div>
      </motion.div>
    );
  }

  // Activity messages (stream summaries injected from EpicContext)
  if (message.role === "system" && (message.messageType === "activity" || message.messageType === "review_result")) {
    return <ActivityMessage message={message} content={content} />;
  }

  if (message.role === "system") {
    const isImpact = message.messageType === "impact";
    const isApplied = message.messageType === "applied";
    const isReview = message.messageType === "review";

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "rounded-xl px-4 py-3 border text-sm",
          isImpact && "bg-amber-500/5 border-amber-500/20",
          isApplied && "bg-emerald-500/5 border-emerald-500/20",
          isReview && "bg-blue-500/5 border-blue-500/20",
          !isImpact && !isApplied && !isReview && "bg-surface-1 border-neutral-800",
        )}
      >
        <div className="flex items-center gap-2 mb-1.5">
          {isImpact && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
          {isApplied && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
          {isReview && <Bot className="w-3.5 h-3.5 text-blue-400" />}
          <span className={cn(
            "text-xs font-medium",
            isImpact ? "text-amber-400" : isApplied ? "text-emerald-400" : isReview ? "text-blue-400" : "text-neutral-400",
          )}>
            {isImpact ? "Impact Analysis" : isApplied ? "Changes Applied" : isReview ? "Coherency Review" : "System"}
          </span>
        </div>
        <div className="text-neutral-300 text-sm prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {content}
          </ReactMarkdown>
        </div>
      </motion.div>
    );
  }

  // Assistant message
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-start"
    >
      <div className="max-w-[90%]">
        <div className="flex items-center gap-1.5 mb-1">
          <Bot className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-neutral-500 font-medium">Assistant</span>
        </div>
        <div className="bg-surface-1 border border-neutral-800 rounded-xl px-4 py-3">
          <div className="text-sm text-neutral-300 prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {content}
            </ReactMarkdown>
            {isStreamingCurrent && (
              <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-0.5" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Collapsible Activity / Review Result Message ─────────────────────────

function ActivityMessage({ message, content }: { message: ChatMessageType; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isReviewResult = message.messageType === "review_result";
  const label = message.activityLabel ?? (isReviewResult ? "Review Complete" : "Activity");
  const previewLines = 3;
  const lines = content.split("\n");
  const needsCollapse = lines.length > previewLines || content.length > 200;
  const preview = needsCollapse
    ? lines.slice(0, previewLines).join("\n").slice(0, 200) + "…"
    : content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-lg border-l-2 px-3 py-2 text-sm",
        isReviewResult
          ? "border-l-blue-400 bg-blue-500/5"
          : "border-l-emerald-400 bg-emerald-500/5"
      )}
    >
      <button
        onClick={() => needsCollapse && setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-left"
      >
        <span className={cn(
          "text-[11px] font-semibold",
          isReviewResult ? "text-blue-400" : "text-emerald-400"
        )}>
          {label}
        </span>
        {needsCollapse && (
          <ChevronDown className={cn(
            "w-3 h-3 text-neutral-600 transition-transform ml-auto",
            expanded && "rotate-180"
          )} />
        )}
      </button>
      <div className="mt-1 text-neutral-400 text-xs prose-invert max-w-none">
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="full"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {content}
              </ReactMarkdown>
            </motion.div>
          ) : (
            <p className="whitespace-pre-wrap line-clamp-3">{preview}</p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
