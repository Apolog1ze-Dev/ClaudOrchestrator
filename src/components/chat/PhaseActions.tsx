import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useOptionalEpicContext } from "../../contexts/EpicContext";
import { useExecutionStore } from "../../stores/executionStore";
import { useConfigStore } from "../../stores/configStore";
import { HandoffDialog } from "../epic/HandoffDialog";

export function PhaseActions() {
  const epicCtx = useOptionalEpicContext();
  const navigate = useNavigate();
  const executionRunning = useExecutionStore((s) => s.isRunning);
  const executionStart = useExecutionStore((s) => s.start);
  const executionStop = useExecutionStore((s) => s.stop);
  const executionCancel = useExecutionStore((s) => s.cancel);
  const targetDir = useConfigStore((s) => s.targetDir);
  const [showHandoff, setShowHandoff] = useState(false);

  if (!epicCtx?.data) return null;

  const { step, isProcessing, data } = epicCtx;

  // Processing: compact inline indicator
  if (isProcessing && step !== "ready") {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-800">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          <span>
            {step === "scouting" ? "Scanning codebase…" :
             step === "generating_specs" ? "Generating specs…" :
             step === "generating_tickets" ? "Decomposing tickets…" :
             step === "generating_phases" ? "Planning phases…" :
             step === "clarifying" ? "Generating questions…" :
             step === "specs_review" ? "Reviewing specs…" :
             step === "tickets_review" ? "Reviewing tickets…" :
             step === "phases_review" ? "Reviewing coherency…" :
             "Processing…"}
          </span>
        </div>
        <button
          onClick={epicCtx.handleCancel}
          className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Specs review
  if (step === "specs_review") {
    return (
      <div className="px-3 py-2 border-t border-neutral-800">
        <button
          onClick={epicCtx.handleApproveSpecs}
          disabled={isProcessing}
          className="w-full py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
        >
          Approve & Decompose Tickets
        </button>
      </div>
    );
  }

  // Tickets review
  if (step === "tickets_review") {
    return (
      <div className="px-3 py-2 border-t border-neutral-800">
        <button
          onClick={epicCtx.handleApproveTickets}
          disabled={isProcessing}
          className="w-full py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
        >
          Approve & Plan Phases
        </button>
      </div>
    );
  }

  // Phases review
  if (step === "phases_review") {
    return (
      <div className="px-3 py-2 border-t border-neutral-800">
        <button
          onClick={epicCtx.handleApprovePhases}
          disabled={isProcessing}
          className="w-full py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
        >
          Finalize — Ready to Build
        </button>
      </div>
    );
  }

  // Ready state
  if (step === "ready" && !executionRunning) {
    // First not-yet-passed phase, for the copy-as-prompt shortcut
    const nextPhase = (() => {
      for (const ticket of data.tickets) {
        for (const phase of data.phases_by_ticket[ticket.id] ?? []) {
          if (phase.status !== "passed") {
            return { ticketId: ticket.id, phaseId: phase.id, title: phase.title };
          }
        }
      }
      return null;
    })();

    return (
      <div className="px-3 py-2 border-t border-neutral-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // Kick off supervised execution, then show the stream view.
              // (Navigation alone never started the run — the execution page
              // is headless in the workspace layout.)
              if (targetDir) {
                void executionStart(data.epic.id, targetDir);
              }
              navigate(`/execute/${data.epic.id}`);
            }}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Build
          </button>
          <button
            onClick={() => setShowHandoff(true)}
            title="Export the plan and execute it with another tool"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            Hand off
          </button>
        </div>
        {showHandoff && targetDir && (
          <HandoffDialog
            epicId={data.epic.id}
            targetDir={targetDir}
            nextPhase={nextPhase}
            onClose={() => setShowHandoff(false)}
          />
        )}
      </div>
    );
  }

  // Execution running
  if (executionRunning) {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-800">
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          Building
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={executionStop}
            className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            Stop
          </button>
          <button
            onClick={executionCancel}
            className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}
