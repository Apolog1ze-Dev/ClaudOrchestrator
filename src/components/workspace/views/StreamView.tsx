import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { useOptionalEpicContext } from "../../../contexts/EpicContext";
import { useExecutionStore } from "../../../stores/executionStore";
import { ClarifyingChat } from "../../epic/ClarifyingChat";
import { cn, toQuotaUnits, formatQuotaUnits, quotaImpactColor } from "../../../lib/utils";
import { useConfigStore } from "../../../stores/configStore";
import type { FrontendStreamEvent } from "../../../types/execution";

// ─── Collapsible Thinking Trace Block ────────────────────────────────────────

function ThinkingBlock({ content, isActive }: { content: string; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const previewLength = 120;
  const preview = content.length > previewLength
    ? content.slice(0, previewLength).trimEnd() + "…"
    : content;

  return (
    <div className="my-2 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 pl-1 py-1.5 text-left"
      >
        {isActive ? (
          <motion.span
            className="text-emerald-400 text-xs font-mono tracking-widest"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            •••
          </motion.span>
        ) : (
          <span className="text-neutral-600 text-xs font-mono tracking-widest">•••</span>
        )}
        <span className={cn(
          "text-[11px] font-medium",
          isActive ? "text-emerald-400" : "text-neutral-600"
        )}>
          {isActive ? "Thinking" : "Thought"}
        </span>
        {!expanded && (
          <span className="text-[11px] text-neutral-700 truncate flex-1 ml-1 font-mono">
            {preview}
          </span>
        )}
        <ChevronDown className={cn(
          "w-3 h-3 text-neutral-600 flex-shrink-0 transition-transform",
          expanded && "rotate-180"
        )} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 pt-0.5 max-h-[300px] overflow-y-auto">
              <p className="text-[12px] text-neutral-500 leading-relaxed whitespace-pre-wrap font-mono">
                {content}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Stream View ─────────────────────────────────────────────────────────────

export function StreamView() {
  const epicCtx = useOptionalEpicContext();
  const executionStreamEvents = useExecutionStore((s) => s.streamEvents);
  const isExecutionRunning = useExecutionStore((s) => s.isRunning);
  const executionPhases = useExecutionStore((s) => s.phases);
  const totalCost = useExecutionStore((s) => s.totalCostUsd);
  const planMultiplier = useConfigStore((s) => s.planInfo)?.usage_multiplier ?? 1;
  const scrollRef = useRef<HTMLDivElement>(null);

  const events = epicCtx?.streamEvents ?? executionStreamEvents;
  const modelName = epicCtx?.activeModel ?? "";
  const step = epicCtx?.step;
  const data = epicCtx?.data;
  const isProcessing = epicCtx?.isProcessing ?? false;

  const title =
    step === "scouting" ? "Scanning Codebase" :
    step === "generating_specs" ? "Generating Specs" :
    step === "generating_tickets" ? "Decomposing Tickets" :
    step === "generating_phases" ? "Planning Phases" :
    step === "clarifying" ? "Agent Output" :
    isExecutionRunning ? "Build Output" :
    "Agent Output";

  // Execution phase progress
  const completedPhases = executionPhases.filter((p) => p.status === "passed" || p.status === "failed").length;
  const totalPhaseCount = executionPhases.length;
  const currentPhase = executionPhases.find((p) => p.status === "executing" || p.status === "verifying" || p.status === "remediating");
  const progress = totalPhaseCount > 0 ? (completedPhases / totalPhaseCount) * 100 : 0;

  // Should clarifying questions render inline?
  const showClarifying = step === "clarifying" && !isProcessing && data?.epic.clarifying_questions && data.epic.clarifying_questions.length > 0;

  // Auto-scroll on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, showClarifying]);

  // Build rendered blocks from events
  const renderedBlocks: React.ReactNode[] = [];
  let textBuffer = "";
  let thinkingBuffer = "";

  const flushText = (key: string) => {
    if (textBuffer) {
      renderedBlocks.push(
        <div key={key} className="text-neutral-300 whitespace-pre-wrap leading-relaxed text-sm">
          {textBuffer}
        </div>
      );
      textBuffer = "";
    }
  };

  const flushThinking = (key: string, isLast: boolean) => {
    if (thinkingBuffer) {
      const content = thinkingBuffer;
      thinkingBuffer = "";
      renderedBlocks.push(
        <ThinkingBlock key={key} content={content} isActive={isLast} />
      );
    }
  };

  events.forEach((event: FrontendStreamEvent, i: number) => {
    switch (event.kind) {
      case "text":
        flushThinking(`thinking-${i}`, false);
        textBuffer += event.content;
        break;

      case "thinking":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        thinkingBuffer += event.content;
        break;

      // ─── Phase started: left-border accent, no icon container ───
      case "phase_started":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div
            key={`phase-start-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 mb-2 pl-3 border-l-2 border-emerald-400"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-emerald-300">{event.phase_title}</span>
              <span className="text-[10px] text-neutral-500 font-mono">{event.phase_order}/{event.total_phases}</span>
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
            <span className="text-[11px] text-neutral-500">{event.ticket_title}</span>
          </motion.div>
        );
        break;

      // ─── Phase completed: keep CheckCircle/XCircle (essential), no DollarSign ───
      case "phase_completed":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        {
          const passed = event.status === "passed";
          renderedBlocks.push(
            <motion.div
              key={`phase-complete-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                "mb-3 px-3 py-2 rounded-lg border flex items-center justify-between",
                passed ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
              )}
            >
              <div className="flex items-center gap-2">
                {passed ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className={cn("text-sm font-medium", passed ? "text-emerald-400" : "text-red-400")}>
                  Phase {passed ? "Passed" : "Failed"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {event.score > 0 && (
                  <span className={cn("font-mono font-bold", event.score >= 70 ? "text-emerald-400" : "text-red-400")}>
                    {event.score}/100
                  </span>
                )}
                {event.cost_usd > 0 && (
                  <span className={cn("font-mono", quotaImpactColor(toQuotaUnits(event.cost_usd, planMultiplier)))}>{formatQuotaUnits(toQuotaUnits(event.cost_usd, planMultiplier))}</span>
                )}
              </div>
            </motion.div>
          );
        }
        break;

      // ─── Ticket started: bold text, no icon ───
      case "ticket_started":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div key={`ticket-start-${i}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="mt-5 mb-3 pb-2 border-b border-neutral-700"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-blue-300">{event.ticket_title}</span>
              <span className="text-[10px] text-neutral-500 font-mono">Ticket {event.ticket_order}/{event.total_tickets}</span>
            </div>
          </motion.div>
        );
        break;

      // ─── Ticket completed: keep CheckCircle/XCircle (essential) ───
      case "ticket_completed":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        {
          const done = event.status === "done";
          renderedBlocks.push(
            <div key={`ticket-complete-${i}`}
              className={cn("mb-2 px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5",
                done ? "text-emerald-400 bg-emerald-500/5" : "text-red-400 bg-red-500/5"
              )}
            >
              {done ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              Ticket {done ? "Complete" : "Failed"}
            </div>
          );
        }
        break;

      // ─── Verification: no ShieldCheck header icon, keep check/x on items ───
      case "verification_result":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div key={`verify-${i}`} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
            className="my-3 rounded-lg border border-neutral-700 bg-surface-0 overflow-hidden"
          >
            <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-200">Verification</span>
              <div className="flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold",
                  event.passed ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                )}>{event.passed ? "PASS" : "FAIL"}</span>
                <span className={cn("text-lg font-mono font-bold", event.score >= 70 ? "text-emerald-400" : "text-red-400")}>
                  {event.score}
                </span>
              </div>
            </div>
            <div className="px-4 py-2.5">
              <p className="text-xs text-neutral-400 mb-2">{event.summary}</p>
              {event.checks.length > 0 && (
                <div className="space-y-1">
                  {event.checks.map((check: string, ci: number) => (
                    <div key={ci} className="flex items-start gap-1.5 text-[11px] text-neutral-500">
                      <span className="mt-0.5">
                        {check.toLowerCase().includes("fail") || check.toLowerCase().includes("error")
                          ? <XCircle className="w-3 h-3 text-red-400" />
                          : <CheckCircle className="w-3 h-3 text-emerald-400" />
                        }
                      </span>
                      <span>{check}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
        break;

      // ─── Remediation: italic text, no icon ───
      case "remediation_started":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div key={`remed-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="my-2 px-3 py-1.5 rounded-lg border border-orange-500/20 bg-orange-500/5"
          >
            <span className="text-sm text-orange-300 italic">Remediation attempt {event.attempt}/{event.max_attempts}</span>
          </motion.div>
        );
        break;

      // ─── Execution stopped: bold text, no icon ───
      case "execution_stopped":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div key={`stopped-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="my-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5"
          >
            <span className="text-sm font-medium text-amber-300">Build Stopped</span>
            <p className="text-xs text-neutral-500 mt-0.5">{event.reason}</p>
          </motion.div>
        );
        break;

      // ─── Approval: bold text, no icon ───
      case "approval_request":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div key={`approval-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="my-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5"
          >
            <span className="text-xs font-semibold text-amber-300">Approval Required</span>
            <code className="block text-[11px] text-neutral-400 font-mono mt-0.5 truncate">{event.command}</code>
          </motion.div>
        );
        break;

      // ─── Tool use: monospace text on subtle bg, no icon ───
      case "tool_use":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <div key={`tool-${i}`}
            className="flex items-center gap-2 py-1 px-2 my-1"
          >
            <span className="text-xs font-mono font-medium text-blue-400">{event.tool}</span>
            {event.input != null && typeof event.input === "object" ? (
              <span className="text-[11px] text-neutral-600 truncate">
                {summarizeToolInput(event.tool, event.input as Record<string, unknown>)}
              </span>
            ) : null}
          </div>
        );
        break;

      // ─── Tool result: just indented text, no icon ───
      case "tool_result":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <div key={`result-${i}`} className="text-[11px] text-neutral-600 pl-4 py-0.5 max-h-16 overflow-hidden font-mono">
            {event.output.slice(0, 300)}{event.output.length > 300 && "…"}
          </div>
        );
        break;

      // ─── Status: italic amber text, no icon ───
      case "status":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <div key={`status-${i}`} className="py-1 text-xs text-amber-400/70 italic">
            {event.message}
          </div>
        );
        break;

      // ─── Spec saved: emerald accent for milestone ───
      case "spec_saved":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div
            key={`spec-saved-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-1.5 text-xs"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-medium">{event.title} saved</span>
          </motion.div>
        );
        break;

      case "cost":
        break; // Tracked in header, not inline

      // ─── Complete: keep CheckCircle (milestone) ───
      case "complete":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <motion.div key={`complete-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-3 mt-3 text-sm text-emerald-400 border-t border-neutral-800"
          >
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">Complete</span>
            {event.total_cost_usd > 0 && (
              <span className={cn("text-xs font-mono ml-1", quotaImpactColor(toQuotaUnits(event.total_cost_usd, planMultiplier)))}>{formatQuotaUnits(toQuotaUnits(event.total_cost_usd, planMultiplier))}</span>
            )}
          </motion.div>
        );
        break;

      // ─── Error: red border + text, no icon ───
      case "error":
        flushText(`text-${i}`);
        flushThinking(`thinking-${i}`, false);
        renderedBlocks.push(
          <div key={`error-${i}`}
            className="py-2 mt-1 rounded-lg px-3 bg-red-500/5 border border-red-500/10"
          >
            <span className="text-sm text-red-400">{event.message}</span>
          </div>
        );
        break;
    }
  });

  flushText("text-final");
  flushThinking("thinking-final", true);

  const lastEvent = events[events.length - 1];
  const isStreaming = lastEvent && lastEvent.kind === "text";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header bar — no icon, just text */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-surface-1 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          {title}
          {modelName && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-mono">
              {modelName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-neutral-600">
          {isStreaming && (
            <motion.div className="flex items-center gap-1.5"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              streaming
            </motion.div>
          )}
          {events.length > 0 && <span>{events.length} events</span>}
        </div>
      </div>

      {/* Execution progress bar — text only, no icons */}
      {isExecutionRunning && totalPhaseCount > 0 && (
        <div className="px-4 py-2 border-b border-neutral-800 bg-surface-0 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-neutral-400">
              {completedPhases}/{totalPhaseCount} phases
              {currentPhase && (
                <span className="text-emerald-400 ml-2">• {currentPhase.title}</span>
              )}
            </span>
            <span className={cn("text-[11px] font-mono", quotaImpactColor(toQuotaUnits(totalCost, planMultiplier)))}>{formatQuotaUnits(toQuotaUnits(totalCost, planMultiplier))}</span>
          </div>
          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
              animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {/* Single scrollable output area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {renderedBlocks.length > 0 && renderedBlocks}

        {/* Streaming cursor */}
        {isStreaming && (
          <motion.span className="inline-block w-2 h-4 bg-emerald-400 ml-0.5"
            animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}

        {/* Clarifying questions inline */}
        {showClarifying && (
          <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-emerald-500/10">
              <span className="text-sm font-medium text-emerald-300">Clarifying Questions</span>
              <span className="text-[10px] text-neutral-600 ml-2">Answer to proceed</span>
            </div>
            <div className="p-4">
              <ClarifyingChat
                questions={data!.epic.clarifying_questions}
                onSubmitAnswers={epicCtx!.handleSubmitAnswers}
                onRequestMore={epicCtx!.handleRequestMoreQuestions}
                onDone={epicCtx!.handleGenerateSpecs}
                isGenerating={isProcessing}
                aiSatisfied={data!.epic.clarify_complete === true}
              />
            </div>
          </div>
        )}

        {/* Empty state */}
        {events.length === 0 && !showClarifying && (
          <div className="flex items-center justify-center py-16 text-neutral-600 text-sm">
            {step === "draft" ? "Scouting will start automatically..." : "Waiting for output..."}
          </div>
        )}
      </div>
    </div>
  );
}

function summarizeToolInput(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case "Read": return String(input.file_path ?? "");
    case "Write": return String(input.file_path ?? "");
    case "Edit": return String(input.file_path ?? "");
    case "Glob": return String(input.pattern ?? "");
    case "Grep": return `${input.pattern ?? ""} ${input.path ? `in ${input.path}` : ""}`;
    case "Bash": return String(input.command ?? "").slice(0, 80);
    default: return JSON.stringify(input).slice(0, 60);
  }
}
