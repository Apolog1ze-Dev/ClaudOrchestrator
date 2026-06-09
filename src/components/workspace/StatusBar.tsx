import { useEffect, useState } from "react";
import { BarChart3, FolderOpen, Wallet } from "lucide-react";
import { useOptionalEpicContext } from "../../contexts/EpicContext";
import { useConfigStore } from "../../stores/configStore";
import { useExecutionStore } from "../../stores/executionStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useEpicStore } from "../../stores/epicStore";
import { useChatStore } from "../../stores/chatStore";
import { cn } from "../../lib/utils";
import { QuotaCost } from "../ui/QuotaCost";
import { getUsageSummary } from "../../lib/tauri";
import { PLAN_AGENT_ALLOWANCE_USD, type UsageSummary } from "../../types/config";
import { open } from "@tauri-apps/plugin-dialog";

const STEP_LABELS: Record<string, string> = {
  draft: "Draft",
  scouting: "Scouting",
  clarifying: "Clarifying",
  generating_specs: "Generating Specs",
  specs_review: "Specs Review",
  generating_tickets: "Decomposing Tickets",
  tickets_review: "Tickets Review",
  generating_phases: "Planning Phases",
  phases_review: "Phases Review",
  ready: "Ready",
};

export function StatusBar() {
  const epicCtx = useOptionalEpicContext();
  const targetDir = useConfigStore((s) => s.targetDir);
  const setTargetDir = useConfigStore((s) => s.setTargetDir);
  const addRecentProject = useConfigStore((s) => s.addRecentProject);
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
  const resetEpics = useEpicStore((s) => s.resetEpics);
  const resetChat = useChatStore((s) => s.resetChat);
  const executionRunning = useExecutionStore((s) => s.isRunning);
  const executionCost = useExecutionStore((s) => s.totalCostUsd);

  const planInfo = useConfigStore((s) => s.planInfo);
  const config = useConfigStore((s) => s.config);

  const step = epicCtx?.step ?? null;
  const data = epicCtx?.data ?? null;
  const isProcessing = epicCtx?.isProcessing ?? false;

  // ─── Monthly agent-budget tracking (ledger-based estimate) ───
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => {
    if (!targetDir) {
      setUsage(null);
      return;
    }
    let stale = false;
    const refresh = () => {
      getUsageSummary(targetDir)
        .then((s) => { if (!stale) setUsage(s); })
        .catch(() => { /* ledger may not exist yet */ });
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => { stale = true; clearInterval(interval); };
    // executionCost in deps: refetch the ledger as live runs add cost
  }, [targetDir, executionCost]);

  const allowance =
    config.budget?.monthly_allowance_usd ??
    PLAN_AGENT_ALLOWANCE_USD[planInfo?.plan ?? "unknown"];
  const warnPct = config.budget?.warn_threshold_pct ?? 80;
  const monthSpend = usage?.month_usd ?? 0;
  const spendRatio = allowance ? (monthSpend / allowance) * 100 : null;
  const budgetColor =
    spendRatio === null
      ? "text-neutral-500"
      : spendRatio >= 100
        ? "text-red-400"
        : spendRatio >= warnPct
          ? "text-amber-400"
          : "text-neutral-500";

  const totalPhases = data
    ? Object.values(data.phases_by_ticket).flat().length
    : 0;
  const completedPhases = data
    ? Object.values(data.phases_by_ticket).flat().filter((p) => p.status === "passed").length
    : 0;
  const cost = data?.epic.total_cost_usd ?? executionCost ?? 0;
  const activeModel =
    epicCtx?.activeModel ??
    (executionRunning ? "executing" : "");

  const handleSelectDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Directory",
      });
      if (selected) {
        // Reset all workspace state before switching
        resetWorkspace();
        resetEpics();
        resetChat();
        setTargetDir(selected);
        addRecentProject(selected);
        // Config auto-loaded by AppProvider's useEffect when targetDir changes
      }
    } catch {
      // Dialog cancelled
    }
  };

  // Extract just the last folder name for display
  const dirDisplayName = targetDir
    ? targetDir.split(/[/\\]/).filter(Boolean).pop() ?? targetDir
    : null;

  return (
    <div className="h-6 flex-shrink-0 bg-surface-1 border-t border-neutral-800 flex items-center px-3 gap-3 text-[11px] text-neutral-500">
      {/* Project directory */}
      <button
        onClick={handleSelectDir}
        className="flex items-center gap-1 hover:text-neutral-300 transition-colors"
        title={targetDir ?? "Select project directory"}
      >
        <FolderOpen className="w-3 h-3" />
        <span className="max-w-[160px] truncate">
          {dirDisplayName ?? "No project"}
        </span>
      </button>
      <div className="w-px h-3 bg-neutral-800" />

      {/* Planning step */}
      {step && (
        <>
          <div className="flex items-center gap-1.5">
            {isProcessing && (
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
            <span className={cn(isProcessing && "text-emerald-400")}>
              {STEP_LABELS[step] ?? step}
            </span>
          </div>
          <div className="w-px h-3 bg-neutral-800" />
        </>
      )}

      {/* Execution status */}
      {executionRunning && (
        <>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Executing
          </div>
          <div className="w-px h-3 bg-neutral-800" />
        </>
      )}

      {/* Active model */}
      {activeModel && (
        <>
          <span>{activeModel}</span>
          <div className="w-px h-3 bg-neutral-800" />
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Monthly agent budget (estimate from local ledger) */}
      {usage && (
        <>
          <span
            className={cn("flex items-center gap-1", budgetColor)}
            title={`Agent budget this month (local estimate; headless usage is metered separately from interactive Claude Code from June 15, 2026)\nToday: $${usage.today_usd.toFixed(2)} · Month: $${usage.month_usd.toFixed(2)}${allowance ? ` of ~$${allowance}` : ""}`}
          >
            <Wallet className="w-3 h-3" />
            ${monthSpend.toFixed(2)}
            {allowance ? ` / $${allowance}` : ""}
          </span>
          <div className="w-px h-3 bg-neutral-800" />
        </>
      )}

      {/* Cost */}
      <QuotaCost costUsd={cost} />

      {/* Phase progress */}
      {totalPhases > 0 && (
        <span className="flex items-center gap-1">
          <BarChart3 className="w-3 h-3" />
          {completedPhases}/{totalPhases}
        </span>
      )}

    </div>
  );
}
