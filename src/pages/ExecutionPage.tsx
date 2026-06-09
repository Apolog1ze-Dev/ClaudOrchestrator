import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  Circle,
  Loader2,
  ShieldCheck,
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  Play,
  Square,
  Pause,
} from "lucide-react";
import { useConfigStore } from "../stores/configStore";
import { useExecutionStore } from "../stores/executionStore";
import type { PhaseInfo } from "../stores/executionStore";
import { cn } from "../lib/utils";
import { QuotaCost } from "../components/ui/QuotaCost";
import { StreamPanel } from "../components/execution/StreamPanel";
import { ApprovalModal } from "../components/execution/ApprovalModal";
import { ReviewGateModal } from "../components/execution/ReviewGateModal";

export function ExecutionPage() {
  const { epicId } = useParams<{ epicId: string }>();
  const navigate = useNavigate();
  const targetDir = useConfigStore((s) => s.targetDir);

  // Read all state from the Zustand store (survives navigation)
  const isRunning = useExecutionStore((s) => s.isRunning);
  const isStopping = useExecutionStore((s) => s.isStopping);
  const isDone = useExecutionStore((s) => s.isDone);
  const epicTitle = useExecutionStore((s) => s.epicTitle);
  const phases = useExecutionStore((s) => s.phases);
  const tickets = useExecutionStore((s) => s.tickets);
  const currentPhaseId = useExecutionStore((s) => s.currentPhaseId);
  const streamEvents = useExecutionStore((s) => s.streamEvents);
  const totalCost = useExecutionStore((s) => s.totalCostUsd);
  const error = useExecutionStore((s) => s.error);
  const pendingApproval = useExecutionStore((s) => s.pendingApproval);
  const pendingReviewGate = useExecutionStore((s) => s.pendingReviewGate);

  const { initFromEpic, start, stop, cancel, approveCommand, respondToReviewGate } = useExecutionStore();

  // Initialize from disk state on mount (does NOT auto-start)
  useEffect(() => {
    if (!epicId || !targetDir) return;
    // Only init if we don't already have this epic loaded
    const currentEpicId = useExecutionStore.getState().currentEpicId;
    if (currentEpicId !== epicId) {
      initFromEpic(epicId, targetDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicId, targetDir]);

  const currentPhase = phases.find((p) => p.id === currentPhaseId);
  const passedCount = phases.filter((p) => p.status === "passed").length;
  const failedCount = phases.filter((p) => p.status === "failed").length;
  const pendingCount = phases.filter((p) => p.status === "pending").length;
  const canStart = !isRunning && pendingCount > 0 && epicId && targetDir;
  const isResume = passedCount > 0 && pendingCount > 0;

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(epicId ? `/epic/${epicId}` : "/")}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-neutral-100">{epicTitle || "Build"}</h2>
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <span>{passedCount}/{phases.length} phases</span>
              {failedCount > 0 && (
                <span className="text-red-400">{failedCount} failed</span>
              )}
              {pendingCount > 0 && !isRunning && (
                <span className="text-amber-400">{pendingCount} pending</span>
              )}
              <QuotaCost costUsd={totalCost} />
            </div>
          </div>

          {/* Status badges */}
          {isRunning && !isStopping && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              Running
            </motion.div>
          )}
          {isStopping && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" />
              Stopping after current phase...
            </div>
          )}
          {isDone && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">
              Complete
            </span>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          {canStart && (
            <button
              onClick={() => start(epicId!, targetDir!)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Play className="w-4 h-4" />
              {isResume ? "Resume" : "Start"}
            </button>
          )}
          {isRunning && !isStopping && (
            <>
              <button
                onClick={stop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
                title="Stop after current phase completes"
              >
                <Pause className="w-4 h-4" />
                Stop
              </button>
              <button
                onClick={cancel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                title="Kill execution immediately"
              >
                <Square className="w-4 h-4" />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Approval modal */}
      {pendingApproval && (
        <ApprovalModal
          approval={pendingApproval}
          onApprove={() => approveCommand(pendingApproval.requestId, true)}
          onDeny={() => approveCommand(pendingApproval.requestId, false)}
          onTrustAll={async () => {
            // Approve this command and switch to autonomous mode for the rest of the session
            await approveCommand(pendingApproval.requestId, true);
            const config = useConfigStore.getState().config;
            const setConfig = useConfigStore.getState().setConfig;
            setConfig({
              ...config,
              execution: { ...config.execution, trust_mode: "autonomous" as const },
            });
            try {
              const { saveConfig } = await import("../lib/tauri");
              await saveConfig(
                { ...config, execution: { ...config.execution, trust_mode: "autonomous" as const } },
                targetDir || "",
              );
            } catch (_) { /* non-critical */ }
          }}
        />
      )}

      {/* Review Gate Modal */}
      {pendingReviewGate && (
        <ReviewGateModal
          phaseTitle={pendingReviewGate.phaseTitle}
          score={pendingReviewGate.score}
          status={pendingReviewGate.status}
          checks={pendingReviewGate.checks}
          suggestedFixes={pendingReviewGate.suggestedFixes}
          onDecision={(d) => respondToReviewGate(pendingReviewGate.requestId, d)}
        />
      )}

      {/* Main: split view */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Phase list */}
        <div className="w-72 flex-shrink-0 bg-surface-1 border border-neutral-800 rounded-xl overflow-y-auto">
          <div className="px-3 py-2 border-b border-neutral-800 text-xs text-neutral-500 font-medium">
            Phases
          </div>
          <div className="p-2 space-y-0.5">
            {tickets.map((ticket) => {
              const ticketPhases = phases.filter((p) => p.ticketId === ticket.id);
              if (ticketPhases.length === 0) return null;
              return (
                <div key={ticket.id}>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-neutral-400">
                    {ticket.status === "done" && <CheckCircle className="w-3 h-3 text-emerald-400" />}
                    {ticket.status === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                    {ticket.status === "executing" && <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />}
                    {ticket.status === "pending" && <Circle className="w-3 h-3 text-neutral-600" />}
                    <span className="truncate">{ticket.title}</span>
                  </div>
                  {ticketPhases.map((phase) => (
                    <PhaseRow key={phase.id} phase={phase} isActive={phase.id === currentPhaseId} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Stream + Verification */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          {/* Current phase header */}
          {currentPhase && (
            <div className="flex items-center gap-3 px-4 py-2 bg-surface-1 border border-neutral-800 rounded-lg text-sm">
              <span className="text-neutral-500">Phase {currentPhase.order}:</span>
              <span className="font-medium text-neutral-200">{currentPhase.title}</span>
              <span className="text-neutral-600">({currentPhase.ticketTitle})</span>
            </div>
          )}

          {/* Not started prompt */}
          {!isRunning && !isDone && pendingCount > 0 && streamEvents.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Play className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-neutral-300 mb-2">
                  {isResume ? "Ready to Resume" : "Ready to Build"}
                </h3>
                <p className="text-sm text-neutral-500 mb-4">
                  {isResume
                    ? `${passedCount} phases completed, ${pendingCount} remaining`
                    : `${phases.length} phases across ${tickets.length} tickets`
                  }
                </p>
                <button
                  onClick={() => epicId && targetDir && start(epicId, targetDir)}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors mx-auto"
                >
                  <Play className="w-4 h-4" />
                  {isResume ? "Resume Build" : "Start Build"}
                </button>
              </div>
            </div>
          )}

          {/* Stream output */}
          {(streamEvents.length > 0 || isRunning) && (
            <StreamPanel
              events={streamEvents}
              maxHeight={400}
              title={currentPhase ? `Phase: ${currentPhase.title}` : "Build Output"}
              className="flex-1"
            />
          )}

          {/* Verification results */}
          {currentPhase?.verificationChecks && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface-1 border border-neutral-800 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span className="text-neutral-200">Verification</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-lg font-bold font-mono",
                    (currentPhase.score ?? 0) >= 70 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {currentPhase.score}/100
                  </span>
                  {(currentPhase.score ?? 0) >= 70 ? (
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  )}
                </div>
              </div>
              {currentPhase.verificationSummary && (
                <p className="text-xs text-neutral-400 mb-3">{currentPhase.verificationSummary}</p>
              )}
              <div className="space-y-1">
                {currentPhase.verificationChecks.map((check, i) => {
                  const isPassed = check.includes("PASS");
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {isPassed ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={isPassed ? "text-neutral-400" : "text-red-300"}>
                        {check}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Phase Row ──────────────────────────────────────────────────────────────

function PhaseRow({ phase, isActive }: { phase: PhaseInfo; isActive: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 ml-3 rounded text-xs transition-colors",
        isActive
          ? "bg-emerald-500/10 text-emerald-300"
          : "text-neutral-500 hover:text-neutral-300"
      )}
    >
      {phase.status === "passed" && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
      {phase.status === "failed" && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
      {phase.status === "executing" && <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin flex-shrink-0" />}
      {phase.status === "verifying" && <ShieldCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
      {phase.status === "remediating" && <RotateCcw className="w-3.5 h-3.5 text-orange-400 animate-spin flex-shrink-0" />}
      {phase.status === "pending" && <Circle className="w-3.5 h-3.5 text-neutral-700 flex-shrink-0" />}
      <span className="truncate">{phase.title}</span>
      {phase.score != null && (
        <span className={cn(
          "ml-auto text-[10px] font-mono",
          phase.score >= 70 ? "text-emerald-400" : "text-red-400"
        )}>
          {phase.score}
        </span>
      )}
    </div>
  );
}
