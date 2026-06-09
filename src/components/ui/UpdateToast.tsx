import { motion, AnimatePresence } from "framer-motion";
import { Download, X, RefreshCw, Loader2 } from "lucide-react";

interface UpdateToastProps {
  visible: boolean;
  version: string | null;
  installing: boolean;
  isExecuting: boolean;
  onRestart: () => void;
  onDismiss: () => void;
}

export function UpdateToast({
  visible,
  version,
  installing,
  isExecuting,
  onRestart,
  onDismiss,
}: UpdateToastProps) {
  const restartDisabled = installing || isExecuting;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-4 right-4 z-40 w-80 bg-surface-1 border border-neutral-700 rounded-xl p-4 shadow-2xl"
        >
          {/* Close button */}
          <button
            onClick={onDismiss}
            className="absolute top-2 right-2 p-1 rounded-lg text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon + text */}
          <div className="flex items-start gap-3 pr-6">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Download className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-neutral-100">
                Update Ready
              </h4>
              <p className="text-xs text-neutral-400 mt-0.5">
                Version {version} is ready to install.
              </p>
            </div>
          </div>

          {/* Execution warning */}
          {isExecuting && (
            <p className="text-[11px] text-amber-400 mt-2">
              Finish current execution before restarting.
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onRestart}
              disabled={restartDisabled}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {installing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {installing ? "Restarting..." : "Restart Now"}
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 border border-neutral-700 hover:border-neutral-600 hover:text-neutral-200 transition-colors"
            >
              Later
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
