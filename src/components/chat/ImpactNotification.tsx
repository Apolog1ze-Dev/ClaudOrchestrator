import { motion } from "framer-motion";
import { AlertTriangle, Loader2, CheckCircle, X } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ImpactAnalysis } from "../../types/chat";

interface ImpactNotificationProps {
  impact: ImpactAnalysis;
  onConfirm: () => void;
  onCancel: () => void;
  isApplying: boolean;
}

const severityColors: Record<string, string> = {
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const riskColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

export function ImpactNotification({ impact, onConfirm, onCancel, isApplying }: ImpactNotificationProps) {
  // Group impacts by document_type
  const grouped: Record<string, typeof impact.impacts> = {};
  for (const item of impact.impacts) {
    if (!grouped[item.document_type]) grouped[item.document_type] = [];
    grouped[item.document_type].push(item);
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-surface-0 border border-amber-500/20 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-neutral-200">Impact Analysis</span>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-medium border",
            riskColors[impact.risk_level] || riskColors.medium,
          )}>
            {impact.risk_level} risk
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b border-neutral-800/50">
        <p className="text-sm text-neutral-400">{impact.summary}</p>
      </div>

      {/* Affected documents grouped */}
      <div className="px-4 py-3 space-y-3 max-h-60 overflow-y-auto">
        {Object.entries(grouped).map(([docType, items]) => (
          <div key={docType}>
            <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
              {docType.replace(/_/g, " ")}
            </h4>
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2 rounded-lg border text-xs",
                    severityColors[item.severity] || severityColors.medium,
                  )}
                >
                  <div className="flex-1">
                    <div className="font-medium">{item.document_title}</div>
                    <div className="text-neutral-500 mt-0.5">{item.section}</div>
                    <div className="text-neutral-400 mt-0.5">{item.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-800">
        <button
          onClick={onCancel}
          disabled={isApplying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 border border-neutral-700 hover:border-neutral-600 transition-colors"
        >
          <X className="w-3 h-3" />
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isApplying}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          {isApplying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckCircle className="w-3 h-3" />
          )}
          {isApplying ? "Applying..." : "Confirm & Apply"}
        </button>
      </div>
    </motion.div>
  );
}
