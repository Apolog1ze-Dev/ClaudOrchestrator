import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, ExternalLink, RefreshCw, Loader2, Play } from "lucide-react";
import { ActivityBar } from "./ActivityBar";
import { ExplorerPanel } from "./ExplorerPanel";
import { EditorTabs } from "./EditorTabs";
import { EditorContent } from "./EditorContent";
import { PlanningToolbar } from "./PlanningToolbar";
import { AgentPanel } from "./AgentPanel";
import { RightBar } from "./RightBar";
import { StatusBar } from "./StatusBar";
import { ResizeHandle } from "./ResizeHandle";
import { TextSelectionPopover } from "../chat/TextSelectionPopover";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useResizable } from "../../hooks/useResizable";
import { useAppContext } from "../providers/AppProvider";
import { useOptionalEpicContext } from "../../contexts/EpicContext";
import { ApprovalModal } from "../execution/ApprovalModal";
import { useExecutionStore } from "../../stores/executionStore";
import { useConfigStore } from "../../stores/configStore";

export function WorkspaceLayout() {
  const explorerCollapsed = useWorkspaceStore((s) => s.explorerCollapsed);
  const agentPanelCollapsed = useWorkspaceStore((s) => s.agentPanelCollapsed);
  const explorerWidth = useWorkspaceStore((s) => s.explorerWidth);
  const agentPanelWidth = useWorkspaceStore((s) => s.agentPanelWidth);
  const setExplorerWidth = useWorkspaceStore((s) => s.setExplorerWidth);
  const setAgentPanelWidth = useWorkspaceStore((s) => s.setAgentPanelWidth);
  const toggleExplorer = useWorkspaceStore((s) => s.toggleExplorer);
  const toggleAgentPanel = useWorkspaceStore((s) => s.toggleAgentPanel);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);

  const location = useLocation();

  const { authStatus, authChecking, handleAuthLogin, handleAuthRecheck, authLoginLaunched } = useAppContext();
  const showAuthBanner = authStatus && (!authStatus.logged_in || !authStatus.token_valid);

  const pendingApproval = useExecutionStore((s) => s.pendingApproval);
  const executionRunning = useExecutionStore((s) => s.isRunning);
  const executionEpicId = useExecutionStore((s) => s.currentEpicId);
  const executionEpicTitle = useExecutionStore((s) => s.epicTitle);
  const { approveCommand } = useExecutionStore();
  const targetDir = useConfigStore((s) => s.targetDir);

  const isOnExecutionPage = location.pathname.startsWith("/execute");

  const explorerResize = useResizable({
    direction: "horizontal",
    side: "right",
    min: 200,
    max: 400,
    onResize: setExplorerWidth,
  });

  const agentResize = useResizable({
    direction: "horizontal",
    side: "left",
    min: 300,
    max: 500,
    onResize: setAgentPanelWidth,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "b") {
          e.preventDefault();
          toggleExplorer();
        } else if (e.key === "j") {
          e.preventDefault();
          toggleAgentPanel();
        } else if (e.key === "w") {
          e.preventDefault();
          if (activeTabId) closeTab(activeTabId);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleExplorer, toggleAgentPanel, closeTab, activeTabId]);

  return (
    <div className="flex flex-col h-screen bg-surface-0 text-neutral-100 overflow-hidden">
      <div className="flex flex-1 min-h-0">
        {/* Activity Bar */}
        <ActivityBar />

        {/* Explorer Panel */}
        {!explorerCollapsed && (
          <>
            <div
              className="flex-shrink-0 border-r border-neutral-800 overflow-hidden"
              style={{ width: explorerWidth }}
            >
              <ExplorerPanel />
            </div>
            <ResizeHandle
              side="right"
              onMouseDown={(e) => explorerResize.handleMouseDown(e, explorerWidth)}
            />
          </>
        )}

        {/* Center: Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Auth banner */}
          {authChecking && (
            <div className="px-4 py-1.5 bg-neutral-800/50 border-b border-neutral-800 flex items-center gap-2 text-xs text-neutral-500 flex-shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" />
              Checking authentication...
            </div>
          )}

          {showAuthBanner && !authChecking && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between flex-shrink-0"
            >
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-medium">
                  {!authStatus.installed ? "Claude Code is not installed" :
                   !authStatus.logged_in ? "Not logged in to Claude" :
                   "OAuth token expired"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {authStatus.installed && !authLoginLaunched && (
                  <button
                    onClick={handleAuthLogin}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Login
                  </button>
                )}
                <button
                  onClick={handleAuthRecheck}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-amber-500/20 text-amber-400 hover:bg-amber-500/10 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-check
                </button>
              </div>
            </motion.div>
          )}

          {/* Background execution banner */}
          {executionRunning && !isOnExecutionPage && executionEpicId && (
            <div className="px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <motion.div
                  className="w-2 h-2 rounded-full bg-emerald-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                Build in progress{executionEpicTitle ? `: ${executionEpicTitle}` : ""}
              </div>
              <Link
                to={`/execute/${executionEpicId}`}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/10 transition-colors"
              >
                <Play className="w-3 h-3" />
                Return
              </Link>
            </div>
          )}

          {/* Planning Toolbar */}
          <PlanningToolbar />

          {/* Editor Tabs */}
          <EditorTabs />

          {/* Editor Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <EditorContent />
          </div>
        </div>

        {/* Right Activity Bar — only when agent panel is collapsed */}
        {agentPanelCollapsed && <RightBar />}

        {/* Agent Panel */}
        {!agentPanelCollapsed && (
          <ResizeHandle
            side="left"
            onMouseDown={(e) => agentResize.handleMouseDown(e, agentPanelWidth)}
          />
        )}
        <motion.div
          className="flex-shrink-0 overflow-hidden"
          animate={{ width: agentPanelCollapsed ? 0 : agentPanelWidth }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          {!agentPanelCollapsed && <AgentPanel />}
        </motion.div>
      </div>

      {/* Status Bar — spans full width */}
      <StatusBar />

      {/* Planning mode dialog */}
      <PlanModeDialog />

      {/* Approval modal */}
      {pendingApproval && (
        <ApprovalModal
          approval={pendingApproval}
          onApprove={() => approveCommand(pendingApproval.requestId, true)}
          onDeny={() => approveCommand(pendingApproval.requestId, false)}
          onTrustAll={async () => {
            await approveCommand(pendingApproval.requestId, true);
            const config = useConfigStore.getState().config;
            const setConfig = useConfigStore.getState().setConfig;
            setConfig({
              ...config,
              execution: { ...config.execution, trust_mode: "autonomous" as const },
            });
            try {
              const { saveConfig } = await import("../../lib/tauri");
              await saveConfig(
                { ...config, execution: { ...config.execution, trust_mode: "autonomous" as const } },
                targetDir || "",
              );
            } catch (_) { /* non-critical */ }
          }}
        />
      )}

      {/* Text selection popover for chat context */}
      <TextSelectionPopover />
    </div>
  );
}

function PlanModeDialog() {
  const epicCtx = useOptionalEpicContext();

  if (!epicCtx?.showPlanModeDialog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-1 border border-neutral-700 rounded-2xl p-8 max-w-lg mx-4 shadow-2xl"
      >
        <h3 className="text-xl font-bold text-neutral-100 mb-2">How should we plan?</h3>
        <p className="text-sm text-neutral-400 mb-6">Choose how detailed the phase planning should be for this epic.</p>
        <div className="space-y-3">
          <button
            onClick={() => epicCtx.startPlanning("detailed")}
            className="w-full text-left px-5 py-4 rounded-xl border border-neutral-700 hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-200 group-hover:text-emerald-300">Detailed</p>
                <p className="text-xs text-neutral-500 mt-0.5">Full per-ticket phase breakdown. Best for complex projects.</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => epicCtx.startPlanning("quick")}
            className="w-full text-left px-5 py-4 rounded-xl border border-neutral-700 hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-200 group-hover:text-emerald-300">Quick</p>
                <p className="text-xs text-neutral-500 mt-0.5">Consolidated plan covering all tickets. Faster, fewer tokens.</p>
              </div>
            </div>
          </button>
        </div>
        <button
          onClick={() => epicCtx.setShowPlanModeDialog(false)}
          className="mt-4 w-full text-center text-xs text-neutral-500 hover:text-neutral-300 transition-colors py-2"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
