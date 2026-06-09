import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Terminal,
  Wrench,
  CheckCircle,
  XCircle,
  Info,
  ChevronRight,
  Layers,
  ListTodo,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  StopCircle,
  Lock,
} from "lucide-react";
import { cn, toQuotaUnits, formatQuotaUnits, quotaImpactColor } from "../../lib/utils";
import { useConfigStore } from "../../stores/configStore";
import type { FrontendStreamEvent } from "../../types/execution";

interface StreamPanelProps {
  events: FrontendStreamEvent[];
  className?: string;
  maxHeight?: number;
  title?: string;
  modelName?: string;
}

export function StreamPanel({
  events,
  className,
  maxHeight = 400,
  title = "AI Output",
  modelName,
}: StreamPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const planMultiplier = useConfigStore((s) => s.planInfo)?.usage_multiplier ?? 1;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Accumulate text events into blocks for cleaner rendering
  const renderedBlocks: React.ReactNode[] = [];
  let textBuffer = "";

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

  events.forEach((event, i) => {
    switch (event.kind) {
      case "text":
        textBuffer += event.content;
        break;

      // ─── Phase lifecycle ────────────────────────────────────────────
      case "phase_started":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`phase-start-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 mb-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden"
          >
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-emerald-300">{event.phase_title}</span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {event.phase_order}/{event.total_phases}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ListTodo className="w-3 h-3 text-neutral-600" />
                  <span className="text-[11px] text-neutral-500">{event.ticket_title}</span>
                </div>
              </div>
              <motion.div
                className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
          </motion.div>
        );
        break;

      case "phase_completed":
        flushText(`text-${i}`);
        {
          const passed = event.status === "passed";
          renderedBlocks.push(
            <motion.div
              key={`phase-complete-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                "mb-3 px-4 py-2.5 rounded-lg border flex items-center justify-between",
                passed
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-red-500/20 bg-red-500/5"
              )}
            >
              <div className="flex items-center gap-2">
                {passed ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
                <span className={cn("text-sm font-medium", passed ? "text-emerald-400" : "text-red-400")}>
                  Phase {passed ? "Passed" : "Failed"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {event.score > 0 && (
                  <span className={cn(
                    "font-mono font-bold",
                    event.score >= 70 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {event.score}/100
                  </span>
                )}
                {event.cost_usd > 0 && (
                  <span className={cn("flex items-center gap-1 font-mono", quotaImpactColor(toQuotaUnits(event.cost_usd, planMultiplier)))}>
                    {formatQuotaUnits(toQuotaUnits(event.cost_usd, planMultiplier))}
                  </span>
                )}
              </div>
            </motion.div>
          );
        }
        break;

      // ─── Ticket lifecycle ───────────────────────────────────────────
      case "ticket_started":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`ticket-start-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 mb-3 pb-2 border-b border-neutral-700"
          >
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold text-blue-300">{event.ticket_title}</span>
              <span className="text-[10px] text-neutral-500 font-mono">
                Ticket {event.ticket_order}/{event.total_tickets}
              </span>
            </div>
          </motion.div>
        );
        break;

      case "ticket_completed":
        flushText(`text-${i}`);
        {
          const done = event.status === "done";
          renderedBlocks.push(
            <div
              key={`ticket-complete-${i}`}
              className={cn(
                "mb-2 px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5",
                done
                  ? "text-emerald-400 bg-emerald-500/5"
                  : "text-red-400 bg-red-500/5"
              )}
            >
              {done ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              Ticket {done ? "Complete" : "Failed"}
            </div>
          );
        }
        break;

      // ─── Verification ───────────────────────────────────────────────
      case "verification_result":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`verify-${i}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="my-3 rounded-lg border border-neutral-700 bg-surface-0 overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-neutral-200">Verification</span>
              </div>
              <div className="flex items-center gap-2">
                {event.passed ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400">PASS</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/15 text-red-400">FAIL</span>
                )}
                <span className={cn(
                  "text-lg font-mono font-bold",
                  event.score >= 70 ? "text-emerald-400" : "text-red-400"
                )}>
                  {event.score}
                </span>
              </div>
            </div>
            <div className="px-4 py-2.5">
              <p className="text-xs text-neutral-400 mb-2">{event.summary}</p>
              {event.checks.length > 0 && (
                <div className="space-y-1">
                  {event.checks.map((check, ci) => (
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

      // ─── Remediation ────────────────────────────────────────────────
      case "remediation_started":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`remed-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="my-2 px-3 py-2 rounded-lg border border-orange-500/20 bg-orange-500/5 flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300">
              Remediation attempt {event.attempt}/{event.max_attempts}
            </span>
          </motion.div>
        );
        break;

      // ─── Execution stopped ──────────────────────────────────────────
      case "execution_stopped":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`stopped-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="my-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center gap-2"
          >
            <StopCircle className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-sm font-medium text-amber-300">Build Stopped</span>
              <p className="text-xs text-neutral-500 mt-0.5">{event.reason}</p>
            </div>
          </motion.div>
        );
        break;

      // ─── Approval request ───────────────────────────────────────────
      case "approval_request":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`approval-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="my-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center gap-2"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-amber-300">Approval Required</span>
              <code className="block text-[11px] text-neutral-400 font-mono mt-0.5 truncate">{event.command}</code>
            </div>
          </motion.div>
        );
        break;

      // ─── Original event types ───────────────────────────────────────
      case "tool_use":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`tool-${i}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 py-1.5 px-2 my-1 rounded bg-blue-500/5 border border-blue-500/10"
          >
            <Wrench className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="text-xs font-medium text-blue-400">{event.tool}</span>
            {event.input != null && typeof event.input === "object" ? (
              <span className="text-[11px] text-neutral-500 truncate ml-1">
                {summarizeToolInput(event.tool, event.input as Record<string, unknown>)}
              </span>
            ) : null}
          </motion.div>
        );
        break;

      case "tool_result":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <div key={`result-${i}`} className="text-[11px] text-neutral-600 pl-6 py-0.5 max-h-16 overflow-hidden">
            <ChevronRight className="w-3 h-3 inline mr-1" />
            {event.output.slice(0, 300)}
            {event.output.length > 300 && "..."}
          </div>
        );
        break;

      case "status":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`status-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-1.5 text-xs text-amber-400/80"
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            {event.message}
          </motion.div>
        );
        break;

      case "cost":
        // Cost events shown inline with small badge
        flushText(`text-${i}`);
        renderedBlocks.push(
          <div key={`cost-${i}`} className={cn("flex items-center gap-1 py-0.5 text-[10px]", quotaImpactColor(toQuotaUnits(event.usd, planMultiplier)))}>
            {formatQuotaUnits(toQuotaUnits(event.usd, planMultiplier))}
          </div>
        );
        break;

      case "complete":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`complete-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-3 mt-3 text-sm text-emerald-400 border-t border-neutral-800"
          >
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Complete</span>
            {event.total_cost_usd > 0 && (
              <span className={cn("text-xs ml-1", quotaImpactColor(toQuotaUnits(event.total_cost_usd, planMultiplier)))}>{formatQuotaUnits(toQuotaUnits(event.total_cost_usd, planMultiplier))}</span>
            )}
          </motion.div>
        );
        break;

      case "error":
        flushText(`text-${i}`);
        renderedBlocks.push(
          <motion.div
            key={`error-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-2 py-2.5 mt-1 rounded-lg px-3 bg-red-500/5 border border-red-500/10"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-red-400">{event.message}</span>
          </motion.div>
        );
        break;
    }
  });

  flushText(`text-final`);

  const lastEvent = events[events.length - 1];
  const isStreaming = lastEvent && lastEvent.kind === "text";

  return (
    <div className={cn("bg-surface-1 border border-neutral-800 rounded-xl overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-surface-0/50">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Terminal className="w-3.5 h-3.5" />
          {title}
          {modelName && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-mono">
              {modelName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-neutral-600">
          {isStreaming && (
            <motion.div
              className="flex items-center gap-1.5"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              streaming
            </motion.div>
          )}
          <span>{events.length} events</span>
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="px-4 py-3 overflow-y-auto stream-output"
        style={{ maxHeight }}
      >
        {renderedBlocks.length === 0 ? (
          <div className="text-neutral-600 text-xs text-center py-4">
            Waiting for output...
          </div>
        ) : (
          renderedBlocks
        )}

        {isStreaming && (
          <motion.span
            className="inline-block w-2 h-4 bg-emerald-400 ml-0.5"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
      </div>
    </div>
  );
}

function summarizeToolInput(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case "Read":
      return String(input.file_path ?? "");
    case "Write":
      return String(input.file_path ?? "");
    case "Edit":
      return String(input.file_path ?? "");
    case "Glob":
      return String(input.pattern ?? "");
    case "Grep":
      return `${input.pattern ?? ""} ${input.path ? `in ${input.path}` : ""}`;
    case "Bash":
      return String(input.command ?? "").slice(0, 80);
    default:
      return JSON.stringify(input).slice(0, 60);
  }
}
