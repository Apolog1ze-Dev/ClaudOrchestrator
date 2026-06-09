import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useConfigStore } from "../../stores/configStore";
import { useEpicStore } from "../../stores/epicStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChatStore } from "../../stores/chatStore";
import { useExecutionStore } from "../../stores/executionStore";
import {
  checkAuthStatus,
  launchAuthLogin,
  getAvailableModels,
  detectSubscriptionPlan,
  listEpics,
} from "../../lib/tauri";
import type { ClaudeModel } from "../../types/config";
import type { AuthStatus } from "../../lib/tauri";

const FALLBACK_MODELS: ClaudeModel[] = [
  { id: "opus", display_name: "Claude Opus 4.6", family: "opus", version: "4.6", context_window: "200k", max_output_tokens: 128000, supported_efforts: ["low", "medium", "high", "max"], adaptive_thinking: true, quota_cost_multiplier: 5.0 },
  { id: "opus[1m]", display_name: "Claude Opus 4.6 (1M)", family: "opus", version: "4.6", context_window: "1m", max_output_tokens: 128000, supported_efforts: ["low", "medium", "high", "max"], adaptive_thinking: true, quota_cost_multiplier: 5.0 },
  { id: "sonnet", display_name: "Claude Sonnet 4.6", family: "sonnet", version: "4.6", context_window: "200k", max_output_tokens: 64000, supported_efforts: ["low", "medium", "high"], adaptive_thinking: true, quota_cost_multiplier: 1.0 },
  { id: "sonnet[1m]", display_name: "Claude Sonnet 4.6 (1M)", family: "sonnet", version: "4.6", context_window: "1m", max_output_tokens: 64000, supported_efforts: ["low", "medium", "high"], adaptive_thinking: true, quota_cost_multiplier: 1.0 },
  { id: "haiku", display_name: "Claude Haiku 4.5", family: "haiku", version: "4.5", context_window: "200k", max_output_tokens: 64000, supported_efforts: ["low", "medium", "high"], adaptive_thinking: false, quota_cost_multiplier: 0.27 },
  { id: "claude-opus-4-5-20251101", display_name: "Claude Opus 4.5", family: "opus", version: "4.5", context_window: "200k", max_output_tokens: 128000, supported_efforts: ["low", "medium", "high", "max"], adaptive_thinking: true, quota_cost_multiplier: 5.0 },
  { id: "claude-sonnet-4-5-20250929", display_name: "Claude Sonnet 4.5", family: "sonnet", version: "4.5", context_window: "200k", max_output_tokens: 64000, supported_efforts: ["low", "medium", "high"], adaptive_thinking: true, quota_cost_multiplier: 1.0 },
  { id: "opusplan", display_name: "Opus Plan (Opus + Sonnet hybrid)", family: "opus", version: "4.6", context_window: "200k", max_output_tokens: 128000, supported_efforts: ["low", "medium", "high", "max"], adaptive_thinking: true, quota_cost_multiplier: 3.0 },
];

interface AppContextValue {
  authStatus: AuthStatus | null;
  authChecking: boolean;
  authLoginLaunched: boolean;
  handleAuthLogin: () => Promise<void>;
  handleAuthRecheck: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const setClaudeInstalled = useConfigStore((s) => s.setClaudeInstalled);
  const setClaudeVersion = useConfigStore((s) => s.setClaudeVersion);
  const setAvailableModels = useConfigStore((s) => s.setAvailableModels);
  const setPlanInfo = useConfigStore((s) => s.setPlanInfo);
  const setPlanDetecting = useConfigStore((s) => s.setPlanDetecting);
  const applyPlanPreset = useConfigStore((s) => s.applyPlanPreset);
  const targetDir = useConfigStore((s) => s.targetDir);
  const setEpics = useEpicStore((s) => s.setEpics);

  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authLoginLaunched, setAuthLoginLaunched] = useState(false);

  const runAuthCheck = async () => {
    setAuthChecking(true);
    try {
      const status = await checkAuthStatus();
      setAuthStatus(status);
      setClaudeInstalled(status.installed);
      if (status.version) setClaudeVersion(status.version);
    } catch {
      setClaudeInstalled(false);
    } finally {
      setAuthChecking(false);
    }
  };

  useEffect(() => {
    setAvailableModels(FALLBACK_MODELS);
    runAuthCheck();

    // Load general config from app data dir
    useConfigStore.getState().loadGeneralConfig();

    getAvailableModels()
      .then(setAvailableModels)
      .catch(() => setAvailableModels(FALLBACK_MODELS));

    setPlanDetecting(true);
    detectSubscriptionPlan()
      .then((info) => {
        setPlanInfo(info);
        // Only apply plan preset if no persisted workspace config has been loaded
        if (!useConfigStore.getState().isCustomConfig) {
          applyPlanPreset(info.plan);
        }
      })
      .catch(() => {})
      .finally(() => setPlanDetecting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track previous targetDir to detect actual workspace switches
  const prevTargetDirRef = useRef<string | null>(null);

  // Auto-load persisted config + epics when targetDir changes (covers both app restart and workspace switch)
  useEffect(() => {
    if (targetDir) {
      const isSwitch = prevTargetDirRef.current !== null && prevTargetDirRef.current !== targetDir;
      prevTargetDirRef.current = targetDir;

      // Reset all workspace state on switch (not on initial load)
      if (isSwitch) {
        useWorkspaceStore.getState().resetWorkspace();
        useChatStore.getState().resetChat();
        if (!useExecutionStore.getState().isRunning) {
          useExecutionStore.getState().reset();
        }
      }

      useConfigStore.getState().loadPersistedConfig(targetDir);
      useConfigStore.getState().addRecentProject(targetDir);
      listEpics(targetDir).then(setEpics).catch(console.error);
    } else {
      prevTargetDirRef.current = null;
    }
  }, [targetDir, setEpics]);

  const handleAuthLogin = async () => {
    setAuthLoginLaunched(true);
    try {
      await launchAuthLogin();
    } catch (e) {
      console.error("Failed to launch auth login:", e);
    }
  };

  const handleAuthRecheck = async () => {
    setAuthLoginLaunched(false);
    await runAuthCheck();
  };

  return (
    <AppContext.Provider
      value={{
        authStatus,
        authChecking,
        authLoginLaunched,
        handleAuthLogin,
        handleAuthRecheck,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
