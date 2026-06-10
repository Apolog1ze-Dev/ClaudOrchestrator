import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, ClipboardCopy, FolderOutput, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  buildHandoffPhasePrompt,
  detectHandoffTargets,
  generateHandoffBundle,
  launchHandoffTarget,
  syncHandoffStatus,
  verifyPhase,
} from "../../lib/tauri";
import type { BundleSummary, ExternalPhaseStatus, TargetAvailability } from "../../lib/tauri";

interface HandoffDialogProps {
  epicId: string;
  targetDir: string;
  /** First not-yet-passed phase, for the copy-as-prompt shortcut */
  nextPhase: { ticketId: string; phaseId: string; title: string } | null;
  onClose: () => void;
}

export function HandoffDialog({ epicId, targetDir, nextPhase, onClose }: HandoffDialogProps) {
  const [targets, setTargets] = useState<TargetAvailability[]>([]);
  const [bundle, setBundle] = useState<BundleSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<ExternalPhaseStatus[] | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    detectHandoffTargets().then(setTargets).catch(() => setTargets([]));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      setBundle(await generateHandoffBundle(epicId, targetDir));
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleLaunch = async (target: string) => {
    setError(null);
    try {
      if (!bundle) await handleGenerate();
      await launchHandoffTarget(target, targetDir);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCopyPrompt = async () => {
    if (!nextPhase) return;
    setError(null);
    try {
      const prompt = await buildHandoffPhasePrompt(epicId, nextPhase.ticketId, nextPhase.phaseId, targetDir);
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      setSyncReport(await syncHandoffStatus(epicId, targetDir));
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleVerify = async (item: ExternalPhaseStatus) => {
    setVerifyingId(item.phase_id);
    setError(null);
    try {
      await verifyPhase(epicId, item.ticket_id, item.phase_id, targetDir, () => {});
      await handleSync(); // refresh internal statuses
    } catch (e) {
      setError(String(e));
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-1 border border-neutral-700 rounded-2xl p-6 w-[520px] max-w-[92vw] max-h-[85vh] overflow-y-auto shadow-2xl"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-neutral-100">Hand off this plan</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Export the plan into the project and execute it with any tool. Work done
          externally can be synced back and verified here.
        </p>

        {/* Bundle */}
        <div className="bg-surface-0 border border-neutral-800 rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOutput className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-sm text-neutral-200">Plan bundle</p>
                <p className="text-[11px] text-neutral-500">
                  {bundle
                    ? `${bundle.files_written} files · ${bundle.tickets} tickets · ${bundle.phases} phases → docs/plan/`
                    : "Writes docs/plan/, AGENTS.md section, and a Claude Code command into the project"}
                </p>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : bundle ? <Check className="w-3 h-3" /> : null}
              {bundle ? "Regenerate" : "Generate"}
            </button>
          </div>
        </div>

        {/* Targets */}
        <p className="text-[11px] uppercase tracking-wider text-neutral-600 font-medium mb-1.5">Open in</p>
        <div className="space-y-1 mb-3">
          {targets.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between px-3 py-2 bg-surface-0 border border-neutral-800 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    t.available ? "bg-emerald-400" : "bg-neutral-700"
                  )}
                />
                <span className={cn("text-xs", t.available ? "text-neutral-200" : "text-neutral-600")}>
                  {t.label}
                </span>
                {t.id === "claude" && t.available && (
                  <span className="text-[10px] text-neutral-600">/claudorch-execute-phase next</span>
                )}
              </div>
              <button
                onClick={() => handleLaunch(t.id)}
                disabled={!t.available}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                  t.available
                    ? "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
                    : "border-neutral-800 text-neutral-700 cursor-not-allowed"
                )}
              >
                Launch <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          ))}
          {targets.length === 0 && (
            <p className="text-xs text-neutral-600 px-1">Detecting installed tools…</p>
          )}
        </div>

        {/* Copy as prompt */}
        {nextPhase && (
          <button
            onClick={handleCopyPrompt}
            className="w-full flex items-center justify-between px-3 py-2 mb-3 bg-surface-0 border border-neutral-800 rounded-lg hover:border-neutral-700 transition-colors group"
          >
            <span className="flex items-center gap-2 text-xs text-neutral-300">
              <ClipboardCopy className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300" />
              Copy next phase as prompt
              <span className="text-neutral-600">({nextPhase.title})</span>
            </span>
            {copied && <span className="text-[11px] text-emerald-400">Copied ✓</span>}
          </button>
        )}

        {/* Sync */}
        <div className="border-t border-neutral-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm text-neutral-200">External progress</p>
              <p className="text-[11px] text-neutral-500">
                Reads status.json and Plan-Phase commit trailers
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-700 text-neutral-300 hover:border-neutral-500 transition-colors disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync
            </button>
          </div>

          {syncReport !== null && syncReport.length === 0 && (
            <p className="text-xs text-neutral-600 px-1">No externally completed phases found yet.</p>
          )}
          {syncReport?.map((item) => (
            <div
              key={item.phase_id}
              className="flex items-center justify-between px-3 py-2 mb-1 bg-surface-0 border border-neutral-800 rounded-lg"
            >
              <div className="min-w-0">
                <p className="text-xs text-neutral-200 truncate">{item.title}</p>
                <p className="text-[10px] text-neutral-500">
                  done externally ({item.source.replace("_", " ")}) · local: {item.internal_status}
                </p>
              </div>
              {item.internal_status === "passed" ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 flex-shrink-0">
                  <Check className="w-3 h-3" /> verified
                </span>
              ) : (
                <button
                  onClick={() => handleVerify(item)}
                  disabled={verifyingId !== null}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {verifyingId === item.phase_id && <Loader2 className="w-3 h-3 animate-spin" />}
                  Verify now
                </button>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </motion.div>
    </div>
  );
}
