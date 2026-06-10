import { motion, AnimatePresence } from "framer-motion";
import {
  Save,
  ChevronDown,
  AlertTriangle,
  Lock,
  Info,
  Globe,
  FolderOpen,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useConfigStore } from "../stores/configStore";
import { saveConfig, saveGeneralConfig } from "../lib/tauri";
import { cn } from "../lib/utils";
import {
  FAMILY_META,
  EFFORT_META,
  type EffortLevel,
  type ModelRole,
} from "../types/config";

// ─── Role definitions ────────────────────────────────────────────────────────

const ROLES: {
  key: ModelRole;
  label: string;
  description: string;
  recommended: string;
}[] = [
  { key: "orchestrator", label: "Orchestrator", description: "Central brain: plans specs, tickets, phases and supervises execution", recommended: "sonnet" },
  { key: "scout", label: "Scout", description: "Analyzes codebase structure and patterns", recommended: "haiku" },
  { key: "executor", label: "Executor", description: "Implements code changes from phase plans", recommended: "sonnet" },
  { key: "verifier", label: "Reviewer", description: "Reviews changes and checks spec compliance", recommended: "opus" },
];

// ─── Effort info tooltip content ─────────────────────────────────────────────

const EFFORT_DETAILS: Record<EffortLevel, string> = {
  low: "Fastest responses with minimal token usage. Best for simple, well-defined tasks like file lookups and quick edits. Skips extended reasoning.",
  medium: "Balanced speed and quality. Good for routine coding tasks. Uses moderate reasoning without deep exploration.",
  high: "Default level. Deep reasoning, explores edge cases, produces thorough implementations. Recommended for most development work.",
  max: "No constraints on thinking depth. Claude will reason as long as needed, exploring every edge case and alternative. Uses significantly more quota. Best for complex debugging, architecture decisions, and security reviews. Only available on Opus models.",
};

// ─── ModelCard Component ─────────────────────────────────────────────────────

// Roles that drive agent tools (file edits, shell) must run on the Claude CLI
const TOOL_BOUND_ROLES: ModelRole[] = ["scout", "executor"];

function ModelCard({ role }: { role: (typeof ROLES)[number] }) {
  const config = useConfigStore((s) => s.config);
  const availableModels = useConfigStore((s) => s.availableModels);
  const planInfo = useConfigStore((s) => s.planInfo);
  const updateRoleModel = useConfigStore((s) => s.updateRoleModel);
  const updateRoleEffort = useConfigStore((s) => s.updateRoleEffort);
  const updateRoleProvider = useConfigStore((s) => s.updateRoleProvider);
  const updateRoleThinking = useConfigStore((s) => s.updateRoleThinking);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const isModelAvailable = useConfigStore((s) => s.isModelAvailable);
  const isMaxEffortPractical = useConfigStore((s) => s.isMaxEffortPractical);
  const [open, setOpen] = useState(false);
  const [showEffortInfo, setShowEffortInfo] = useState<EffortLevel | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const assignment = config.models[role.key];
  const currentModel = availableModels.find((m) => m.id === assignment.model_id);
  const familyMeta = currentModel ? FAMILY_META[currentModel.family] : FAMILY_META.sonnet;
  const supportedEfforts = currentModel?.supported_efforts ?? ["low", "medium", "high"];
  const isOpusFamily = currentModel?.family === "opus";
  const opusWarning = isOpusFamily ? planInfo?.opus_warning : null;
  const toolBound = TOOL_BOUND_ROLES.includes(role.key);
  const providerProfiles = config.providers ?? [];
  const activeProvider = providerProfiles.find((p) => p.id === assignment.provider);
  // Agent roles keep the CLI tool harness, so only providers with an
  // Anthropic-compatible endpoint can power their inference.
  const selectableProfiles = toolBound
    ? providerProfiles.filter((p) => p.anthropic_base_url)
    : providerProfiles;

  const refreshModels = async (providerId: string) => {
    setDiscovering(true);
    try {
      const { listProviderModels } = await import("../lib/tauri");
      setDiscovered(await listProviderModels(providerId));
    } catch {
      setDiscovered([]);
    } finally {
      setDiscovering(false);
    }
  };
  useEffect(() => {
    if (assignment.provider) {
      refreshModels(assignment.provider);
    } else {
      setDiscovered([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.provider]);

  return (
    <div className="bg-surface-1 border border-neutral-800 rounded-xl" style={{ overflow: "visible" }}>
      {/* Header */}
      <div className="p-5 pb-4">
        <h4 className="font-semibold text-neutral-200">{role.label}</h4>
        <p className="text-xs text-neutral-500">{role.description}</p>
      </div>

      {/* Provider (BYO) */}
      <div className="px-5 pb-3">
        <label className="text-xs text-neutral-500 mb-2 block">Provider</label>
        <select
          value={assignment.provider ?? ""}
          onChange={(e) => updateRoleProvider(role.key, e.target.value || null)}
          className="w-full px-3 py-2.5 rounded-lg border border-neutral-700 bg-surface-2 text-sm text-neutral-200 focus:outline-none focus:border-neutral-500"
        >
          <option value="">Claude (subscription)</option>
          {selectableProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {toolBound && (
          <p className="text-[11px] text-neutral-600 mt-1.5">
            Agent roles keep the Claude CLI tool harness — only providers with an
            Anthropic-compatible endpoint (e.g. Ollama) can power their inference.
          </p>
        )}
      </div>

      {/* Model Selector */}
      <div className="px-5 pb-3" ref={wrapperRef} style={{ position: "relative", zIndex: open ? 50 : 1 }}>
        <label className="text-xs text-neutral-500 mb-2 block">Model</label>
        {assignment.provider ? (
          <>
            <div className="flex gap-1.5">
              <input
                type="text"
                list={`models-${role.key}`}
                value={assignment.model_id}
                onChange={(e) => updateRoleModel(role.key, e.target.value)}
                placeholder={activeProvider?.local ? "e.g. llama3.3, qwen2.5-coder" : "e.g. gpt-4.1-mini"}
                className="flex-1 px-3 py-2.5 rounded-lg border border-neutral-700 bg-surface-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-neutral-500"
              />
              <button
                onClick={() => assignment.provider && refreshModels(assignment.provider)}
                disabled={discovering}
                title="Refresh available models"
                className="px-3 py-2 rounded-lg border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition-colors text-xs disabled:opacity-50"
              >
                {discovering ? "…" : "↻"}
              </button>
            </div>
            <datalist id={`models-${role.key}`}>
              {discovered.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="text-[11px] text-neutral-600 mt-1.5">
              {discovered.length > 0
                ? `${discovered.length} models discovered on ${activeProvider?.label ?? assignment.provider}`
                : `Model name as known by ${activeProvider?.label ?? assignment.provider}`}
            </p>
          </>
        ) : (
        <>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-neutral-700 bg-surface-2 hover:border-neutral-600 transition-colors text-sm"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: familyMeta.color }} />
            <span className="text-neutral-200">{currentModel?.display_name ?? assignment.model_id}</span>
            {currentModel && (
              <span className="text-[10px] text-neutral-500 font-mono">
                {currentModel.quota_cost_multiplier}x quota
              </span>
            )}
          </div>
          <ChevronDown className={cn("w-4 h-4 text-neutral-500 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div
            className="absolute left-0 right-0 mt-1 mx-5 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl max-h-[350px] overflow-y-auto"
            style={{ zIndex: 9999 }}
          >
            {availableModels.length === 0 && (
              <div className="px-3 py-4 text-xs text-neutral-500 text-center">No models available</div>
            )}
            {availableModels.map((model) => {
              const meta = FAMILY_META[model.family];
              const isSelected = model.id === assignment.model_id;
              const available = isModelAvailable(model);
              const isOpus = model.family === "opus";

              return (
                <button
                  key={model.id}
                  onClick={() => {
                    if (!available) return;
                    updateRoleModel(role.key, model.id);
                    if (!model.supported_efforts.includes(assignment.effort)) {
                      updateRoleEffort(role.key, "high");
                    }
                    setOpen(false);
                  }}
                  disabled={!available}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                    !available
                      ? "opacity-40 cursor-not-allowed"
                      : isSelected
                      ? "bg-neutral-700/50"
                      : "hover:bg-neutral-800/50"
                  )}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: available ? meta.color : "#52525b" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate", available ? "text-neutral-200" : "text-neutral-600")}>
                        {model.display_name}
                      </span>
                      {!available && <Lock className="w-3 h-3 text-neutral-600" />}
                      {model.id === role.recommended && available && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-700 text-neutral-400">Rec</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-0.5">
                      <span>v{model.version}</span>
                      <span>·</span>
                      <span>{model.context_window === "1m" ? "1M ctx" : "200K ctx"}</span>
                      <span>·</span>
                      <span className={cn(
                        "font-medium",
                        model.quota_cost_multiplier >= 5 ? "text-red-400/70" :
                        model.quota_cost_multiplier >= 1 ? "text-amber-400/70" : "text-emerald-400/70"
                      )}>
                        {model.quota_cost_multiplier}x quota
                      </span>
                      {!available && <span className="text-neutral-600">· Not on your plan</span>}
                      {isOpus && available && planInfo?.opus_warning && (
                        <>
                          <span>·</span>
                          <AlertTriangle className="w-3 h-3 text-amber-400/70" />
                        </>
                      )}
                    </div>
                  </div>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Opus quota warning */}
        {opusWarning && !open && (
          <div className="flex items-start gap-2 mt-2 px-2.5 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[11px] text-amber-400/80">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{opusWarning}</span>
          </div>
        )}
        </>
        )}
      </div>

      {/* Thinking toggle (provider chat calls) */}
      {assignment.provider && !toolBound && (
        <div className="px-5 pb-3">
          <label className="text-xs text-neutral-500 mb-2 block">Thinking</label>
          <div className="flex gap-1.5">
            {([["Default", null], ["On", true], ["Off", false]] as const).map(([label, value]) => (
              <button
                key={label}
                onClick={() => updateRoleThinking(role.key, value)}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  (assignment.thinking ?? null) === value
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-600 mt-1.5">
            Reasoning control where supported (Ollama think, OpenRouter reasoning).
          </p>
        </div>
      )}

      {/* Effort Selector (applies to the Claude CLI, incl. agent-harness runs) */}
      {assignment.provider && !toolBound ? (
        <div className="px-5 pb-5">
          <p className="text-[11px] text-neutral-600">
            Effort levels apply to Claude CLI runs only.
          </p>
        </div>
      ) : (
      <div className="px-5 pb-5">
        <label className="flex items-center text-xs text-neutral-500 mb-2">
          Effort Level
          <button
            onClick={() => setShowEffortInfo(showEffortInfo ? null : assignment.effort)}
            className="ml-auto text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            <Info className="w-3 h-3" />
          </button>
        </label>
        <div className="flex gap-1.5">
          {(["low", "medium", "high", "max"] as EffortLevel[]).map((level) => {
            const meta = EFFORT_META[level];
            const isSelected = assignment.effort === level;
            const isSupported = supportedEfforts.includes(level);
            const isMaxLocked = level === "max" && !isMaxEffortPractical() && isSupported;
            const canSelect = isSupported && !isMaxLocked;

            return (
              <button
                key={level}
                onClick={() => {
                  if (canSelect) {
                    updateRoleEffort(role.key, level);
                    setShowEffortInfo(level);
                  }
                }}
                disabled={!canSelect}
                className={cn(
                  "flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-all relative group",
                  isSelected
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : canSelect
                    ? "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
                    : "border-neutral-800/50 text-neutral-700 cursor-not-allowed"
                )}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4].map((seg) => {
                      const filled = { low: 1, medium: 2, high: 3, max: 4 }[level];
                      return (
                        <div key={seg} className={cn(
                          "w-1.5 h-2.5 rounded-[1px]",
                          seg <= filled ? "bg-current" : "bg-neutral-700"
                        )} />
                      );
                    })}
                  </div>
                  {meta.label}
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-[10px] text-neutral-400 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                  {!isSupported && "Not available for this model"}
                  {isMaxLocked && "Upgrade to Max plan for practical use"}
                  {canSelect && meta.description}
                </div>
              </button>
            );
          })}
        </div>

        {/* Effort info panel */}
        <AnimatePresence>
          {showEffortInfo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 px-3 py-2.5 rounded-lg bg-surface-0 border border-neutral-800 text-[11px] text-neutral-400 leading-relaxed"
            >
              <div className="flex items-center gap-1.5 text-neutral-300 font-medium mb-1">
                <Info className="w-3 h-3" />
                {EFFORT_META[showEffortInfo].label} effort
              </div>
              {EFFORT_DETAILS[showEffortInfo]}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

    </div>
  );
}

// ─── Providers Section ───────────────────────────────────────────────────────

function ProvidersSection({
  config,
  updateConfig,
  targetDir,
}: {
  config: import("../types/config").AppConfig;
  updateConfig: (c: import("../types/config").AppConfig) => void;
  targetDir: string | null;
}) {
  const profiles = config.providers ?? [];
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [testModels, setTestModels] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<string | null>(null);

  const loadModels = async (providerId: string) => {
    setLoadingModels(providerId);
    try {
      const { listProviderModels } = await import("../lib/tauri");
      const models = await listProviderModels(providerId);
      setModelLists((m) => ({ ...m, [providerId]: models }));
      setTestResults((r) => ({ ...r, [providerId]: `${models.length} models available` }));
    } catch (e) {
      setTestResults((r) => ({ ...r, [providerId]: String(e) }));
    } finally {
      setLoadingModels(null);
    }
  };

  useEffect(() => {
    import("../lib/tauri").then(({ getProviderProfiles }) =>
      getProviderProfiles()
        .then((infos) => {
          const status: Record<string, boolean> = {};
          for (const info of infos) status[info.id] = info.has_key;
          setKeyStatus(status);
        })
        .catch(() => {})
    );
  }, []);

  const saveKey = async (providerId: string) => {
    const { setProviderKey } = await import("../lib/tauri");
    const key = keyDrafts[providerId] ?? "";
    try {
      await setProviderKey(providerId, key);
      setKeyStatus((s) => ({ ...s, [providerId]: key.trim().length > 0 }));
      setKeyDrafts((d) => ({ ...d, [providerId]: "" }));
    } catch (e) {
      setTestResults((r) => ({ ...r, [providerId]: `Key save failed: ${e}` }));
    }
  };

  const runTest = async (providerId: string) => {
    const model = testModels[providerId]?.trim();
    if (!model) {
      setTestResults((r) => ({ ...r, [providerId]: "Enter a model name to test" }));
      return;
    }
    setTesting(providerId);
    setTestResults((r) => ({ ...r, [providerId]: "" }));
    try {
      const { testProvider } = await import("../lib/tauri");
      const result = await testProvider(providerId, model, targetDir ?? undefined);
      setTestResults((r) => ({
        ...r,
        [providerId]: result.ok
          ? `OK in ${result.latency_ms}ms${result.cost_usd > 0 ? ` · $${result.cost_usd.toFixed(5)} (provider-reported)` : ""} · ${result.message}`
          : result.message,
      }));
    } finally {
      setTesting(null);
    }
  };

  const updateBaseUrl = (providerId: string, baseUrl: string) => {
    updateConfig({
      ...config,
      providers: profiles.map((p) => (p.id === providerId ? { ...p, base_url: baseUrl } : p)),
    });
  };

  const updateAgentUrl = (providerId: string, url: string) => {
    updateConfig({
      ...config,
      providers: profiles.map((p) =>
        p.id === providerId ? { ...p, anthropic_base_url: url.trim() === "" ? null : url } : p
      ),
    });
  };

  return (
    <div className="space-y-3">
      {profiles.map((p) => (
        <div key={p.id} className="bg-surface-1 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-200">{p.label}</span>
              {p.local && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  local · $0
                </span>
              )}
              {p.requires_key && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] border",
                    keyStatus[p.id]
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  )}
                >
                  {keyStatus[p.id] ? "key set" : "no key"}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-neutral-600 block mb-1">Base URL</label>
              <input
                type="text"
                value={p.base_url}
                onChange={(e) => updateBaseUrl(p.id, e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-800 bg-surface-0 text-xs text-neutral-300 font-mono focus:outline-none focus:border-neutral-600"
              />
            </div>
            {p.requires_key && (
              <div>
                <label className="text-[11px] text-neutral-600 block mb-1">API key</label>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={keyDrafts[p.id] ?? ""}
                    onChange={(e) => setKeyDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder={keyStatus[p.id] ? "•••••• (set — paste to replace, empty to clear)" : "paste key"}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-800 bg-surface-0 text-xs text-neutral-300 focus:outline-none focus:border-neutral-600"
                  />
                  <button
                    onClick={() => saveKey(p.id)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-neutral-700 text-neutral-300 hover:border-neutral-500 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="text-[11px] text-neutral-600 block mb-1">
                Agent endpoint (Anthropic-compatible, optional)
              </label>
              <input
                type="text"
                value={p.anthropic_base_url ?? ""}
                onChange={(e) => updateAgentUrl(p.id, e.target.value)}
                placeholder="http://localhost:11434 (lets agent roles use this provider)"
                className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-800 bg-surface-0 text-xs text-neutral-300 font-mono focus:outline-none focus:border-neutral-600"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] text-neutral-600 block mb-1">Test (model name)</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  list={`test-models-${p.id}`}
                  value={testModels[p.id] ?? ""}
                  onChange={(e) => setTestModels((m) => ({ ...m, [p.id]: e.target.value }))}
                  placeholder={p.local ? "llama3.3" : p.id === "openrouter" ? "openai/gpt-4.1-mini" : "gpt-4.1-mini"}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-800 bg-surface-0 text-xs text-neutral-300 font-mono focus:outline-none focus:border-neutral-600"
                />
                <datalist id={`test-models-${p.id}`}>
                  {(modelLists[p.id] ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <button
                  onClick={() => loadModels(p.id)}
                  disabled={loadingModels !== null}
                  title="Discover available models"
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-neutral-700 text-neutral-300 hover:border-neutral-500 transition-colors disabled:opacity-50"
                >
                  {loadingModels === p.id ? "…" : "↻ models"}
                </button>
                <button
                  onClick={() => runTest(p.id)}
                  disabled={testing !== null}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                >
                  {testing === p.id ? "Testing…" : "Test"}
                </button>
              </div>
              {testResults[p.id] && (
                <p className="text-[11px] text-neutral-400 mt-1.5 break-all">{testResults[p.id]}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Settings Page ───────────────────────────────────────────────────────────

export function SettingsPage() {
  const workspaceConfig = useConfigStore((s) => s.config);
  const generalConfig = useConfigStore((s) => s.generalConfig);
  const setConfig = useConfigStore((s) => s.setConfig);
  const setGeneralConfig = useConfigStore((s) => s.setGeneralConfig);
  const settingsScope = useConfigStore((s) => s.settingsScope);
  const setSettingsScope = useConfigStore((s) => s.setSettingsScope);
  const targetDir = useConfigStore((s) => s.targetDir);

  const config = settingsScope === "general" ? generalConfig : workspaceConfig;
  const workspaceName = targetDir?.split(/[/\\]/).filter(Boolean).pop() ?? "";

  // Persist edits made through store actions (the ModelCards call
  // updateRoleModel/Effort/Provider, which update the store but never wrote
  // to disk — the second half of the "settings silently revert" bug).
  const lastPersistedRef = useRef(workspaceConfig);
  useEffect(() => {
    if (lastPersistedRef.current === workspaceConfig) return;
    lastPersistedRef.current = workspaceConfig;
    if (targetDir) {
      saveConfig(workspaceConfig, targetDir).catch((e) =>
        console.error("Failed to persist model settings:", e)
      );
    }
  }, [workspaceConfig, targetDir]);

  // Auto-save: update store AND persist to disk immediately on every change
  const updateConfig = (newConfig: typeof config) => {
    // Any manual settings edit marks the config as custom — otherwise async
    // plan detection (applyPlanPreset) silently overwrites user-chosen models.
    useConfigStore.getState().markConfigCustom();
    if (settingsScope === "general") {
      setGeneralConfig(newConfig);
      saveGeneralConfig(newConfig).catch((e) =>
        console.error("Failed to save general config:", e)
      );
    } else {
      setConfig(newConfig);
      if (targetDir) {
        saveConfig(newConfig, targetDir).catch((e) =>
          console.error("Failed to save config:", e)
        );
      }
    }
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-neutral-100 mb-2">Settings</h2>
          <p className="text-neutral-400">
            Configure model assignments, effort levels, and execution preferences
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Save className="w-3.5 h-3.5" />
          Auto-saved
        </span>
      </div>

      {/* Scope selector */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setSettingsScope("general")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
            settingsScope === "general"
              ? "bg-neutral-800 border-neutral-600 text-neutral-200"
              : "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
          )}
        >
          <Globe className="w-4 h-4" />
          General (Default)
        </button>
        {targetDir && (
          <button
            onClick={() => setSettingsScope("workspace")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
              settingsScope === "workspace"
                ? "bg-neutral-800 border-neutral-600 text-neutral-200"
                : "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
            )}
          >
            <FolderOpen className="w-4 h-4" />
            {workspaceName || "Workspace"}
          </button>
        )}
      </div>

      {settingsScope === "general" && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs text-blue-400/80">
          General settings act as defaults for new workspaces. Existing workspace settings are not affected.
        </div>
      )}

      {/* Model Assignments */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold text-neutral-200 mb-2">Model Assignments</h3>
        <p className="text-sm text-neutral-400 mb-6">
          Configure which model and effort level to use for each role.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROLES.map((role) => (
            <ModelCard key={role.key} role={role} />
          ))}
        </div>
      </section>

      {/* BYO Providers */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold text-neutral-200 mb-2">Model Providers (BYO)</h3>
        <p className="text-sm text-neutral-400 mb-6">
          Bring your own API keys or local engines for planning-stage roles. API keys are
          stored in the OS keychain, never in config files. Costs are recorded from real
          call data — provider-reported charges and actual token counts; local engines
          are a true $0.
        </p>
        <ProvidersSection config={config} updateConfig={updateConfig} targetDir={targetDir} />
      </section>

      {/* Verification Config */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold text-neutral-200 mb-4">Verification Pipeline</h3>
        <div className="bg-surface-1 border border-neutral-800 rounded-xl p-5 space-y-4">
          {[
            { key: "run_tests", label: "Run Tests", command: config.verification.test_command },
            { key: "run_lint", label: "Run Linter", command: config.verification.lint_command },
            { key: "run_typecheck", label: "Run Type Check", command: config.verification.typecheck_command },
            { key: "diff_review", label: "AI Diff Review", command: null },
            { key: "spec_compliance_check", label: "Spec Compliance Check", command: null },
          ].map((check) => (
            <div key={check.key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-neutral-200">{check.label}</p>
                {check.command && <p className="text-xs text-neutral-500 font-mono">{check.command}</p>}
              </div>
              <div
                onClick={() =>
                  updateConfig({
                    ...config,
                    verification: {
                      ...config.verification,
                      [check.key]: !config.verification[check.key as keyof typeof config.verification],
                    },
                  })
                }
                className={cn(
                  "w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors",
                  config.verification[check.key as keyof typeof config.verification]
                    ? "bg-brand-500 justify-end"
                    : "bg-neutral-700 justify-start"
                )}
              >
                <motion.div className="w-4 h-4 rounded-full bg-white" layout transition={{ type: "spring", stiffness: 500, damping: 30 }} />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between py-2 border-t border-neutral-800">
            <div>
              <p className="text-sm text-neutral-200">Minimum Score</p>
              <p className="text-xs text-neutral-500">Phases below this score trigger remediation</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-neutral-300">{config.verification.minimum_score}</span>
              <span className="text-xs text-neutral-500">/100</span>
            </div>
          </div>
        </div>
      </section>

      {/* Planning Config */}
      <section>
        <h3 className="text-lg font-semibold text-neutral-200 mb-4">Planning</h3>
        <div className="bg-surface-1 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div>
            <p className="text-sm text-neutral-200 mb-2">Planning Detail Level</p>
            <p className="text-xs text-neutral-500 mb-3">Controls how granular the phase planning is</p>
            <div className="grid grid-cols-2 gap-3">
              {(["detailed", "quick"] as const).map((level) => {
                const isActive = (config.planning_detail ?? "detailed") === level;
                return (
                  <button
                    key={level}
                    onClick={() => updateConfig({ ...config, planning_detail: level })}
                    className={cn(
                      "px-4 py-3 rounded-lg border text-left transition-colors",
                      isActive
                        ? "border-neutral-600 bg-neutral-800 text-neutral-200"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
                    )}
                  >
                    <div className="text-sm font-medium capitalize">{level}</div>
                    <div className="text-xs mt-1 opacity-70">
                      {level === "detailed"
                        ? "Full per-ticket phase breakdown with complete implementation steps"
                        : "Consolidated plan covering all tickets with lighter per-ticket detail"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Execution Config */}
      <section>
        <h3 className="text-lg font-semibold text-neutral-200 mb-4">Build</h3>
        <div className="bg-surface-1 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-neutral-200">Auto Remediate</p>
              <p className="text-xs text-neutral-500">Automatically attempt to fix failed phases</p>
            </div>
            <div
              onClick={() =>
                updateConfig({
                  ...config,
                  execution: { ...config.execution, auto_remediate: !config.execution.auto_remediate },
                })
              }
              className={cn(
                "w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors",
                config.execution.auto_remediate ? "bg-brand-500 justify-end" : "bg-neutral-700 justify-start"
              )}
            >
              <motion.div className="w-4 h-4 rounded-full bg-white" layout transition={{ type: "spring", stiffness: 500, damping: 30 }} />
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-neutral-200">Max Remediation Attempts</p>
            <span className="text-sm font-mono text-neutral-300">{config.execution.max_remediation_attempts}</span>
          </div>

          {/* Trust Mode */}
          <div className="py-3 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-neutral-200">Approval Gates</p>
                <p className="text-xs text-neutral-500">Control whether phase builds, verification commands, and remediation wait for your approval</p>
              </div>
            </div>
            <div className="flex gap-2">
              {(["autonomous", "supervised"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    updateConfig({
                      ...config,
                      execution: { ...config.execution, trust_mode: mode },
                    })
                  }
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all",
                    config.execution.trust_mode === mode
                      ? "bg-neutral-800 border-neutral-600 text-neutral-200"
                      : "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
                  )}
                >
                  <span className="block">{mode === "autonomous" ? "Autonomous" : "Supervised"}</span>
                  <span className="block text-[10px] mt-0.5 font-normal opacity-70">
                    {mode === "autonomous"
                      ? "Everything runs without asking"
                      : "Approve each phase and verification command"}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-amber-400/80 mt-2 leading-relaxed">
              Note: supervised mode gates phase starts, verification commands, and remediation.
              During a phase build the executor agent itself can run shell commands without
              per-command prompts in both modes. For full command-level control, execute
              phases in your own Claude Code session instead.
            </p>
          </div>

          {/* Monthly agent budget */}
          <div className="py-3 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-200">Monthly Agent Budget</p>
                <p className="text-xs text-neutral-500">
                  Headless usage allowance in USD (metered separately from interactive
                  sessions since June 15, 2026). Leave empty to use your plan's published
                  credit.
                </p>
              </div>
              <input
                type="number"
                min={0}
                step={5}
                value={config.budget?.monthly_allowance_usd ?? ""}
                placeholder="auto"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const parsed = v === "" ? null : Math.max(0, Number(v));
                  updateConfig({
                    ...config,
                    budget: {
                      monthly_allowance_usd: parsed === null || Number.isNaN(parsed) ? null : parsed,
                      warn_threshold_pct: config.budget?.warn_threshold_pct ?? 80,
                    },
                  });
                }}
                className="w-24 px-3 py-1.5 bg-surface-0 border border-neutral-800 rounded-lg text-sm text-neutral-200 text-right focus:outline-none focus:border-neutral-600"
              />
            </div>
          </div>

          {/* Review Gate Toggle */}
          <div className="flex items-center justify-between py-3 border-t border-neutral-800">
            <div>
              <p className="text-sm text-neutral-200">Review Gate</p>
              <p className="text-xs text-neutral-500">Pause after each phase for you to Accept, Retry, Skip, or Reject</p>
            </div>
            <div
              onClick={() =>
                updateConfig({
                  ...config,
                  execution: { ...config.execution, review_gate_enabled: !config.execution.review_gate_enabled },
                })
              }
              className={cn(
                "w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors",
                config.execution.review_gate_enabled ? "bg-brand-500 justify-end" : "bg-neutral-700 justify-start"
              )}
            >
              <motion.div className="w-4 h-4 rounded-full bg-white" layout transition={{ type: "spring", stiffness: 500, damping: 30 }} />
            </div>
          </div>

        </div>
      </section>
    </div>
    </div>
  );
}
