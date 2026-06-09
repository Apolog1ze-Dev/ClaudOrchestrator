import { Loader2 } from "lucide-react";
import { useOptionalEpicContext } from "../../contexts/EpicContext";
import { useExecutionStore } from "../../stores/executionStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { motion } from "framer-motion";

export function PlanningToolbar() {
  const epicCtx = useOptionalEpicContext();
  const executionRunning = useExecutionStore((s) => s.isRunning);
  const executionStop = useExecutionStore((s) => s.stop);
  const executionCancel = useExecutionStore((s) => s.cancel);
  const agentPanelCollapsed = useWorkspaceStore((s) => s.agentPanelCollapsed);

  if (!epicCtx?.data) return null;

  // Hide toolbar when agent panel is open — it shows status there instead
  if (!agentPanelCollapsed) return null;

  const { step, isProcessing } = epicCtx;

  // Processing: show spinner + step label + cancel
  if (isProcessing && step !== "ready") {
    return (
      <div className="h-9 flex-shrink-0 bg-surface-1 border-b border-neutral-800 flex items-center px-4 gap-2">
        <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
        <span className="text-xs text-neutral-400">
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
        <div className="flex-1" />
        <button
          onClick={epicCtx.handleCancel}
          className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Execution running
  if (executionRunning) {
    return (
      <div className="h-9 flex-shrink-0 bg-surface-1 border-b border-neutral-800 flex items-center px-4 gap-2">
        <motion.div
          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className="text-xs text-emerald-400">Building</span>
        <div className="flex-1" />
        <button
          onClick={executionStop}
          className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
        >
          Stop
        </button>
        <button
          onClick={executionCancel}
          className="text-[11px] text-red-400 hover:text-red-300 transition-colors ml-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  return null;
}
