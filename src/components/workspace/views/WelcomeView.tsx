import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Play,
  BarChart3,
  FileText,
  ListTodo,
  Layers,
  AlertTriangle,
  RotateCcw,
  FolderOpen,
  Plus,
  Settings,
  Clock,
} from "lucide-react";
import { useOptionalEpicContext } from "../../../contexts/EpicContext";
import { useExecutionStore } from "../../../stores/executionStore";
import { useConfigStore } from "../../../stores/configStore";
import { useEpicStore } from "../../../stores/epicStore";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { useChatStore } from "../../../stores/chatStore";
import { PlanningProgress } from "../../epic/PlanningProgress";
import { cn, STATUS_COLORS, statusLabel, formatRelativeTime } from "../../../lib/utils";
import { QuotaCost } from "../../ui/QuotaCost";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { listEpics } from "../../../lib/tauri";

export function WelcomeView() {
  const epicCtx = useOptionalEpicContext();
  const navigate = useNavigate();
  const executionRunning = useExecutionStore((s) => s.isRunning);
  const targetDir = useConfigStore((s) => s.targetDir);
  const setTargetDir = useConfigStore((s) => s.setTargetDir);
  const claudeInstalled = useConfigStore((s) => s.claudeInstalled);
  const epics = useEpicStore((s) => s.epics);
  const setEpics = useEpicStore((s) => s.setEpics);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
  const resetEpics = useEpicStore((s) => s.resetEpics);
  const resetChat = useChatStore((s) => s.resetChat);

  // Load epics when targetDir changes
  useEffect(() => {
    if (targetDir) {
      listEpics(targetDir).then(setEpics).catch(console.error);
    }
  }, [targetDir, setEpics]);

  const handleSelectDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Directory",
      });
      if (selected) {
        resetWorkspace();
        resetEpics();
        resetChat();
        setTargetDir(selected);
        // Config auto-loaded by AppProvider's useEffect when targetDir changes
      }
    } catch {
      // Dialog cancelled
    }
  };

  // No epic loaded — show workspace landing
  if (!epicCtx?.data) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8">
          {/* Branding */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-neutral-200 mb-2">ClaudOrchestrator</h2>
            <p className="text-sm text-neutral-500">
              Spec-driven development powered by Claude Code
            </p>
          </div>

          {/* Project directory selector */}
          <div className="bg-surface-1 border border-neutral-800 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-200">
                    {targetDir ? "Project Directory" : "No project selected"}
                  </p>
                  {targetDir ? (
                    <p className="text-xs text-neutral-500 font-mono truncate max-w-[400px]">{targetDir}</p>
                  ) : (
                    <p className="text-xs text-neutral-500">Select a project directory to get started</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleSelectDir}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                {targetDir ? "Change" : "Select Project"}
              </button>
            </div>
          </div>

          {/* Status warnings */}
          {!claudeInstalled && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
            >
              Claude Code is not installed or not in PATH. Please install it to use ClaudOrchestrator.
            </motion.div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            <button
              onClick={() => openTab({ id: "new-epic:main", type: "new-epic", title: "New Epic", icon: "Plus" })}
              className="flex items-center gap-3 p-4 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl hover:border-emerald-500/40 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Plus className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-200">New Epic</p>
                <p className="text-xs text-neutral-500">Start planning a feature</p>
              </div>
            </button>
            <button
              onClick={() => openTab({ id: "settings:main", type: "settings", title: "Settings", icon: "Settings" })}
              className="flex items-center gap-3 p-4 bg-surface-1 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
                <Settings className="w-5 h-5 text-neutral-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-200">Settings</p>
                <p className="text-xs text-neutral-500">Models, verification, execution</p>
              </div>
            </button>
          </div>

          {/* Epics list */}
          {targetDir && epics.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-300 mb-3">Active Epics</h3>
              <div className="space-y-2">
                {epics.map((epic) => {
                  const progress =
                    epic.total_estimated_phases > 0
                      ? (epic.completed_phases / epic.total_estimated_phases) * 100
                      : 0;
                  return (
                    <button
                      key={epic.id}
                      onClick={() => navigate(`/epic/${epic.id}`)}
                      className="w-full flex items-center gap-3 p-3 bg-surface-1 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors text-left group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-neutral-200 group-hover:text-emerald-300 transition-colors truncate">
                            {epic.title || "Untitled Epic"}
                          </p>
                          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0", STATUS_COLORS[epic.status])}>
                            {statusLabel(epic.status)}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 truncate">{epic.objective}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-neutral-600">
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            {epic.completed_phases}/{epic.total_estimated_phases} phases
                          </span>
                          <QuotaCost costUsd={epic.total_cost_usd} />
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(epic.updated_at)}
                          </span>
                        </div>
                      </div>
                      {/* Mini progress bar */}
                      <div className="w-16 flex-shrink-0">
                        <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {targetDir && epics.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              <p className="text-sm">No epics yet in this project</p>
              <p className="text-xs text-neutral-600 mt-1">Create your first epic to start orchestrating development</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const { data, step, isProcessing } = epicCtx;
  const { epic, specs, tickets, phases_by_ticket } = data;
  const totalPhases = Object.values(phases_by_ticket).flat().length;
  const completedPhases = Object.values(phases_by_ticket).flat().filter((p) => p.status === "passed").length;
  const progress = totalPhases > 0 ? (completedPhases / totalPhases) * 100 : 0;
  const isReady = step === "ready";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-8">
        {/* Epic header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-neutral-100">
              {epic.title || epic.objective.slice(0, 80)}
            </h1>
            <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[epic.status])}>
              {statusLabel(epic.status)}
            </span>
          </div>
          {epic.title && (
            <p className="text-sm text-neutral-400">{epic.objective}</p>
          )}
        </div>

        {/* Planning progress */}
        {!isReady && (
          <div className="mb-8">
            <PlanningProgress currentStep={step} isActive={isProcessing} />
          </div>
        )}

        {/* Stuck/interrupted state */}
        {!isProcessing && (step === "scouting" || step === "generating_specs" || step === "generating_tickets" || step === "generating_phases") && (
          <div className="bg-surface-1 border border-amber-500/20 rounded-xl p-6 text-center mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-neutral-200 mb-2">
              {step === "scouting" ? "Scouting was interrupted" :
               step === "generating_specs" ? "Spec generation was interrupted" :
               step === "generating_tickets" ? "Ticket decomposition was interrupted" :
               "Phase planning was interrupted"}
            </h3>
            <p className="text-sm text-neutral-400 mb-4">
              The process was interrupted. You can resume from where it stopped.
            </p>
            <button
              onClick={() => {
                if (step === "scouting") epicCtx.handleStartScouting();
                else if (step === "generating_specs") epicCtx.handleGenerateSpecs();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors mx-auto"
            >
              <RotateCcw className="w-4 h-4" />
              Resume
            </button>
          </div>
        )}

        {/* Ready: Progress + Execute */}
        {isReady && (
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5">
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                {completedPhases}/{totalPhases} phases
              </span>
              <QuotaCost costUsd={epic.total_cost_usd} />
            </div>
            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden mb-4">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
            {!executionRunning && (
              <button
                onClick={() => navigate(`/execute/${epic.id}`)}
                className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors mx-auto"
              >
                <Play className="w-4 h-4" />
                Build
              </button>
            )}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface-1 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-neutral-400">Specs</span>
            </div>
            <p className="text-2xl font-bold text-neutral-200">{specs.length}</p>
          </div>
          <div className="bg-surface-1 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ListTodo className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-neutral-400">Tickets</span>
            </div>
            <p className="text-2xl font-bold text-neutral-200">{tickets.length}</p>
          </div>
          <div className="bg-surface-1 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-neutral-400">Phases</span>
            </div>
            <p className="text-2xl font-bold text-neutral-200">{totalPhases}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
