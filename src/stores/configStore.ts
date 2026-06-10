import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppConfig,
  ClaudeModel,
  EffortLevel,
  ModelRole,
  ModelConfig,
  PlanInfo,
  SubscriptionPlan,
} from "../types/config";
import { DEFAULT_CONFIG } from "../types/config";

// ─── Plan Presets ────────────────────────────────────────────────────────────
// Optimal model assignments per plan, tuned for quota efficiency

const PLAN_PRESETS: Record<SubscriptionPlan, ModelConfig> = {
  pro: {
    orchestrator: { model_id: "sonnet", effort: "high", max_turns: 30 },
    scout: { model_id: "haiku", effort: "low", max_turns: 20 },
    executor: { model_id: "sonnet", effort: "medium", max_turns: 50 },
    verifier: { model_id: "sonnet", effort: "high", max_turns: 20 },
  },
  max_5x: {
    orchestrator: { model_id: "sonnet", effort: "high", max_turns: 40 },
    scout: { model_id: "haiku", effort: "medium", max_turns: 20 },
    executor: { model_id: "sonnet", effort: "high", max_turns: 60 },
    verifier: { model_id: "opus", effort: "high", max_turns: 25 },
  },
  max_20x: {
    orchestrator: { model_id: "opus", effort: "high", max_turns: 40 },
    scout: { model_id: "sonnet", effort: "medium", max_turns: 25 },
    executor: { model_id: "sonnet", effort: "high", max_turns: 60 },
    verifier: { model_id: "opus", effort: "max", max_turns: 30 },
  },
  team: {
    orchestrator: { model_id: "sonnet", effort: "high", max_turns: 30 },
    scout: { model_id: "haiku", effort: "low", max_turns: 20 },
    executor: { model_id: "sonnet", effort: "medium", max_turns: 50 },
    verifier: { model_id: "sonnet", effort: "high", max_turns: 20 },
  },
  team_premium: {
    orchestrator: { model_id: "opus", effort: "high", max_turns: 40 },
    scout: { model_id: "sonnet", effort: "medium", max_turns: 25 },
    executor: { model_id: "sonnet", effort: "high", max_turns: 60 },
    verifier: { model_id: "opus", effort: "max", max_turns: 30 },
  },
  enterprise: {
    orchestrator: { model_id: "opus", effort: "high", max_turns: 50 },
    scout: { model_id: "sonnet", effort: "high", max_turns: 30 },
    executor: { model_id: "opus", effort: "high", max_turns: 80 },
    verifier: { model_id: "opus", effort: "max", max_turns: 30 },
  },
  unknown: {
    orchestrator: { model_id: "sonnet", effort: "high", max_turns: 30 },
    scout: { model_id: "haiku", effort: "medium", max_turns: 20 },
    executor: { model_id: "sonnet", effort: "high", max_turns: 50 },
    verifier: { model_id: "sonnet", effort: "high", max_turns: 20 },
  },
};

function modelsEqual(a: ModelConfig, b: ModelConfig): boolean {
  const roles: ModelRole[] = ["orchestrator", "scout", "executor", "verifier"];
  return roles.every(
    (r) => a[r].model_id === b[r].model_id && a[r].effort === b[r].effort
  );
}

// ─── Recent Projects ────────────────────────────────────────────────────────

export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: string;
}

const MAX_RECENT_PROJECTS = 10;

// ─── Store ───────────────────────────────────────────────────────────────────

export type SettingsScope = "general" | "workspace";

interface ConfigStore {
  config: AppConfig;
  generalConfig: AppConfig;
  settingsScope: SettingsScope;
  targetDir: string | null;
  recentProjects: RecentProject[];
  claudeInstalled: boolean;
  claudeVersion: string | null;
  availableModels: ClaudeModel[];
  planInfo: PlanInfo | null;
  planDetecting: boolean;
  /** Whether the model config matches the plan preset or was customized */
  isCustomConfig: boolean;

  setConfig: (config: AppConfig) => void;
  setGeneralConfig: (config: AppConfig) => void;
  /** Mark the config as user-customized so plan-preset detection never overwrites it */
  markConfigCustom: () => void;
  setSettingsScope: (scope: SettingsScope) => void;
  setTargetDir: (dir: string | null) => void;
  addRecentProject: (path: string) => void;
  removeRecentProject: (path: string) => void;
  setClaudeInstalled: (installed: boolean) => void;
  setClaudeVersion: (version: string | null) => void;
  setAvailableModels: (models: ClaudeModel[]) => void;
  setPlanInfo: (info: PlanInfo) => void;
  setPlanDetecting: (detecting: boolean) => void;
  /** Apply plan preset defaults and mark as non-custom */
  applyPlanPreset: (plan: SubscriptionPlan) => void;
  /** Update a role's model - marks config as custom if it differs from preset */
  updateRoleModel: (role: ModelRole, modelId: string) => void;
  /** Update a role's effort - marks config as custom if it differs from preset */
  updateRoleEffort: (role: ModelRole, effort: EffortLevel) => void;
  /** Assign a BYO provider to a role (null = Claude subscription via CLI) */
  updateRoleProvider: (role: ModelRole, provider: string | null) => void;
  /** Set the role's thinking/reasoning toggle (null = model default) */
  updateRoleThinking: (role: ModelRole, thinking: boolean | null) => void;

  /** Load persisted config from disk for a workspace */
  loadPersistedConfig: (targetDir: string) => Promise<void>;
  /** Load general config from app data dir */
  loadGeneralConfig: () => Promise<void>;

  isModelAvailable: (model: ClaudeModel) => boolean;
  isMaxEffortPractical: () => boolean;
  getOpusWarning: () => string | null;
  getPresetForCurrentPlan: () => ModelConfig | null;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set, get) => ({
  config: DEFAULT_CONFIG,
  generalConfig: DEFAULT_CONFIG,
  settingsScope: "workspace" as SettingsScope,
  targetDir: null,
  recentProjects: [],
  claudeInstalled: false,
  claudeVersion: null,
  availableModels: [], // Populated from Rust backend or fallback on load
  planInfo: null,
  planDetecting: false,
  isCustomConfig: false,

  setConfig: (config) => set({ config }),
  setGeneralConfig: (config) => set({ generalConfig: config }),
  markConfigCustom: () => set({ isCustomConfig: true }),
  setSettingsScope: (scope) => set({ settingsScope: scope }),
  setTargetDir: (dir) => set({ targetDir: dir }),

  addRecentProject: (path) =>
    set((state) => {
      const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
      const now = new Date().toISOString();
      const filtered = state.recentProjects.filter((p) => p.path !== path);
      const updated = [{ path, name, lastOpenedAt: now }, ...filtered].slice(0, MAX_RECENT_PROJECTS);
      return { recentProjects: updated };
    }),

  removeRecentProject: (path) =>
    set((state) => ({
      recentProjects: state.recentProjects.filter((p) => p.path !== path),
    })),

  setClaudeInstalled: (installed) => set({ claudeInstalled: installed }),
  setClaudeVersion: (version) => set({ claudeVersion: version }),
  setAvailableModels: (models) => set({ availableModels: models }),
  setPlanInfo: (info) => set({ planInfo: info }),
  setPlanDetecting: (detecting) => set({ planDetecting: detecting }),

  loadPersistedConfig: async (targetDir: string) => {
    try {
      const { loadConfig } = await import("../lib/tauri");
      const persisted = await loadConfig(targetDir);
      if (persisted) {
        set({ config: persisted, isCustomConfig: true });
      } else {
        // No workspace config — use general config as default
        const general = get().generalConfig;
        set({ config: { ...general }, isCustomConfig: false });
      }
    } catch (e) {
      console.warn("Failed to load persisted config:", e);
    }
  },

  loadGeneralConfig: async () => {
    try {
      const { loadGeneralConfig } = await import("../lib/tauri");
      const general = await loadGeneralConfig();
      set({ generalConfig: general });
    } catch (e) {
      console.warn("Failed to load general config:", e);
    }
  },

  applyPlanPreset: (plan) => {
    const preset = PLAN_PRESETS[plan] ?? PLAN_PRESETS.unknown;
    set((state) => ({
      config: {
        ...state.config,
        models: structuredClone(preset),
      },
      isCustomConfig: false,
    }));
  },

  updateRoleModel: (role, modelId) =>
    set((state) => {
      const newModels = {
        ...state.config.models,
        [role]: { ...state.config.models[role], model_id: modelId },
      };
      const preset = state.planInfo
        ? PLAN_PRESETS[state.planInfo.plan] ?? PLAN_PRESETS.unknown
        : null;
      const isCustom = preset ? !modelsEqual(newModels, preset) : true;
      return {
        config: { ...state.config, models: newModels },
        isCustomConfig: isCustom,
      };
    }),

  updateRoleEffort: (role, effort) =>
    set((state) => {
      const newModels = {
        ...state.config.models,
        [role]: { ...state.config.models[role], effort },
      };
      const preset = state.planInfo
        ? PLAN_PRESETS[state.planInfo.plan] ?? PLAN_PRESETS.unknown
        : null;
      const isCustom = preset ? !modelsEqual(newModels, preset) : true;
      return {
        config: { ...state.config, models: newModels },
        isCustomConfig: isCustom,
      };
    }),

  updateRoleProvider: (role, provider) =>
    set((state) => {
      const prev = state.config.models[role];
      let model_id = prev.model_id;
      if (provider) {
        // Fresh pick from the provider's discovered models — keeping the old
        // Claude id would filter every suggestion list down to nothing.
        model_id = "";
      } else if (!state.availableModels.some((m) => m.id === prev.model_id)) {
        // Back to Claude with a non-Claude id left over: restore a sane default
        const preset = state.planInfo
          ? PLAN_PRESETS[state.planInfo.plan] ?? PLAN_PRESETS.unknown
          : null;
        model_id = (preset ?? DEFAULT_CONFIG.models)[role].model_id;
      }
      return {
        config: {
          ...state.config,
          models: {
            ...state.config.models,
            [role]: { ...prev, provider, model_id },
          },
        },
        isCustomConfig: true,
      };
    }),

  updateRoleThinking: (role, thinking) =>
    set((state) => ({
      config: {
        ...state.config,
        models: {
          ...state.config.models,
          [role]: { ...state.config.models[role], thinking },
        },
      },
      isCustomConfig: true,
    })),

  isModelAvailable: (model) => {
    const { planInfo } = get();
    if (!planInfo) return true;
    return planInfo.available_model_families.includes(model.family);
  },

  isMaxEffortPractical: () => {
    const { planInfo } = get();
    if (!planInfo) return false;
    return planInfo.max_effort_practical;
  },

  getOpusWarning: () => {
    const { planInfo } = get();
    return planInfo?.opus_warning ?? null;
  },

  getPresetForCurrentPlan: () => {
    const { planInfo } = get();
    if (!planInfo) return null;
    return PLAN_PRESETS[planInfo.plan] ?? null;
  },
    }),
    {
      name: "claudorchestrator-config",
      // Persist targetDir + recentProjects to localStorage — full config lives on disk per workspace
      partialize: (state) => ({ targetDir: state.targetDir, recentProjects: state.recentProjects }),
    }
  )
);
