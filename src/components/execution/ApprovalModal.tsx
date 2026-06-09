import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Terminal, Play, Wrench, CheckCircle, AlertTriangle } from "lucide-react";
import type { ApprovalRequest } from "../../stores/executionStore";

interface ApprovalModalProps {
  approval: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
  onTrustAll: () => void;
}

const contextLabels: Record<string, { label: string; description: string; icon: typeof Play }> = {
  phase_execution: {
    label: "Phase Build",
    description: "Claude will use Write/Edit tools to modify files in your project",
    icon: Play,
  },
  verification: {
    label: "Verification Check",
    description: "A shell command will be executed in the project directory",
    icon: CheckCircle,
  },
  remediation: {
    label: "Remediation",
    description: "Claude will attempt to fix issues found during verification",
    icon: Wrench,
  },
};

export function ApprovalModal({ approval, onApprove, onDeny, onTrustAll }: ApprovalModalProps) {
  const ctx = contextLabels[approval.context] || contextLabels.verification;
  const CtxIcon = ctx.icon;
  const [confirmingTrustAll, setConfirmingTrustAll] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-1 border border-neutral-700 rounded-2xl p-6 max-w-lg mx-4 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-neutral-100">Approval Required</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <CtxIcon className="w-3 h-3 text-neutral-500" />
              <p className="text-xs text-neutral-500">{ctx.label}</p>
            </div>
          </div>
        </div>

        {/* Command / description display */}
        <div className="bg-surface-0 border border-neutral-800 rounded-xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
              {approval.context === "phase_execution" ? "Action" : "Command"}
            </span>
          </div>
          <code className="text-sm text-emerald-400 font-mono break-all whitespace-pre-wrap">
            {approval.command}
          </code>
        </div>

        <p className="text-xs text-neutral-500 mb-4">{ctx.description}</p>

        {/* Trust-all confirmation warning */}
        {confirmingTrustAll && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              This switches the session to autonomous mode: every remaining phase,
              verification command, and remediation runs without asking again.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          {/* Trust all — requires a second confirming click */}
          <button
            onClick={() => {
              if (confirmingTrustAll) {
                onTrustAll();
              } else {
                setConfirmingTrustAll(true);
              }
            }}
            className={
              confirmingTrustAll
                ? "text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
                : "text-[11px] text-neutral-500 hover:text-emerald-400 transition-colors"
            }
          >
            {confirmingTrustAll ? "Click again to confirm autonomous mode" : "Trust all for this session"}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onDeny}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 border border-neutral-700 hover:border-neutral-600 hover:text-neutral-200 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={onApprove}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              Approve
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
