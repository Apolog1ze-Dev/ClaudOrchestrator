import { motion } from "framer-motion";
import { ShieldCheck, CheckCircle, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface ReviewGateModalProps {
  phaseTitle: string;
  score: number;
  status: string;
  checks: string[];
  suggestedFixes: string[];
  onDecision: (decision: "accept" | "retry" | "skip" | "reject") => void;
}

export function ReviewGateModal({
  phaseTitle,
  score,
  status,
  checks,
  suggestedFixes,
  onDecision,
}: ReviewGateModalProps) {
  const passed = status === "passed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-1 border border-neutral-700 rounded-2xl p-6 max-w-lg mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            passed ? "bg-emerald-500/10" : "bg-red-500/10"
          )}>
            <ShieldCheck className={cn("w-5 h-5", passed ? "text-emerald-400" : "text-red-400")} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-neutral-100">Phase Review</h3>
            <p className="text-sm text-neutral-400">{phaseTitle}</p>
          </div>
          <span className={cn(
            "text-2xl font-mono font-bold",
            score >= 70 ? "text-emerald-400" : "text-red-400"
          )}>
            {score}
          </span>
        </div>

        {/* Checks */}
        {checks.length > 0 && (
          <div className="bg-surface-0 border border-neutral-800 rounded-xl p-4 mb-4">
            <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Verification Checks</h4>
            <div className="space-y-1.5">
              {checks.map((check, i) => {
                const isPassed = check.includes("PASS");
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {isPassed
                      ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                    }
                    <span className={isPassed ? "text-neutral-500" : "text-red-300"}>{check}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Suggested Fixes */}
        {suggestedFixes.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 mb-4">
            <h4 className="text-xs font-medium text-amber-400 mb-2">Suggested Fixes</h4>
            {suggestedFixes.map((fix, i) => (
              <p key={i} className="text-xs text-neutral-400 mb-1">• {fix}</p>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onDecision("accept")}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => onDecision("retry")}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => onDecision("skip")}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-neutral-700 text-neutral-400 hover:bg-neutral-800 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={() => onDecision("reject")}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Stop Build
          </button>
        </div>
      </motion.div>
    </div>
  );
}
