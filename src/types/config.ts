// ─── Subscription Plan ───────────────────────────────────────────────────────

export type SubscriptionPlan =
  | "pro"
  | "max_5x"
  | "max_20x"
  | "team"
  | "team_premium"
  | "enterprise"
  | "unknown";

export interface PlanInfo {
  plan: SubscriptionPlan;
  display_name: string;
  price: string;
  usage_multiplier: number;
  available_model_families: ModelFamily[];
  max_effort_practical: boolean;
  opus_warning: string | null;
}

// ─── Model Types ─────────────────────────────────────────────────────────────
// Mirrored from src-tauri/src/types/config.rs

export type ModelFamily = "opus" | "sonnet" | "haiku";
export type ContextWindow = "200k" | "1m";
export type EffortLevel = "low" | "medium" | "high" | "max";

/** A specific Claude model with its capabilities */
export interface ClaudeModel {
  id: string;
  display_name: string;
  family: ModelFamily;
  version: string;
  context_window: ContextWindow;
  max_output_tokens: number;
  supported_efforts: EffortLevel[];
  adaptive_thinking: boolean;
  quota_cost_multiplier: number;
}

export interface ModelAssignment {
  model_id: string;
  effort: EffortLevel;
  max_turns?: number;
}

export interface ModelConfig {
  orchestrator: ModelAssignment;
  scout: ModelAssignment;
  executor: ModelAssignment;
  verifier: ModelAssignment;
}

// ─── Remaining Config ────────────────────────────────────────────────────────

export interface YoloConfig {
  max_total_budget_qu: number;
  stop_on_verification_failure: boolean;
  adapt_specs: boolean;
}

export type TrustMode = "autonomous" | "supervised";

export interface ExecutionConfig {
  parallel_tickets: number;
  auto_remediate: boolean;
  max_remediation_attempts: number;
  yolo: YoloConfig;
  trust_mode: TrustMode;
  review_gate_enabled: boolean;
}

export interface VerificationConfig {
  run_tests: boolean;
  test_command: string;
  run_lint: boolean;
  lint_command: string;
  run_typecheck: boolean;
  typecheck_command: string;
  diff_review: boolean;
  spec_compliance_check: boolean;
  minimum_score: number;
}

export type PlanningDetail = "detailed" | "quick";

/** Budget settings for subscription agent-credit metering (June 15, 2026+) */
export interface BudgetConfig {
  /** Monthly agent (headless) allowance in USD; null = derive from detected plan */
  monthly_allowance_usd: number | null;
  /** Warn once month spend crosses this percentage of the allowance */
  warn_threshold_pct: number;
}

export interface AppConfig {
  models: ModelConfig;
  execution: ExecutionConfig;
  verification: VerificationConfig;
  target_dir?: string;
  /** How detailed the phase planning should be */
  planning_detail?: PlanningDetail;
  budget?: BudgetConfig;
}

// ─── Usage Ledger ────────────────────────────────────────────────────────────
// Mirrored from src-tauri/src/storage/usage.rs

export interface TaskSpend {
  task: string;
  cost_usd: number;
}

export interface UsageSummary {
  /** Calendar month the figures cover, e.g. "2026-06" (UTC) */
  month: string;
  month_usd: number;
  today_usd: number;
  total_usd: number;
  by_task_month: TaskSpend[];
  record_count: number;
}

/**
 * Published monthly Agent SDK credit per plan (USD), effective 2026-06-15.
 * Headless `claude -p` usage (everything this app runs) draws from this pool;
 * interactive Claude Code sessions do not.
 */
export const PLAN_AGENT_ALLOWANCE_USD: Record<SubscriptionPlan, number | null> = {
  pro: 20,
  max_5x: 100,
  max_20x: 200,
  team: 20,
  team_premium: 100,
  enterprise: 20,
  unknown: null,
};

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  orchestrator: { model_id: "sonnet", effort: "high", max_turns: 30 },
  scout: { model_id: "haiku", effort: "medium", max_turns: 20 },
  executor: { model_id: "sonnet", effort: "high", max_turns: 50 },
  verifier: { model_id: "opus", effort: "max", max_turns: 20 },
};

export const DEFAULT_CONFIG: AppConfig = {
  models: DEFAULT_MODEL_CONFIG,
  execution: {
    parallel_tickets: 1,
    auto_remediate: true,
    max_remediation_attempts: 3,
    trust_mode: "autonomous",
    review_gate_enabled: false,
    yolo: {
      max_total_budget_qu: 50000,
      stop_on_verification_failure: true,
      adapt_specs: false,
    },
  },
  verification: {
    run_tests: true,
    test_command: "npm test",
    run_lint: true,
    lint_command: "npm run lint",
    run_typecheck: true,
    typecheck_command: "npx tsc --noEmit",
    diff_review: true,
    spec_compliance_check: true,
    minimum_score: 70,
  },
};

// ─── UI Metadata ─────────────────────────────────────────────────────────────

export const FAMILY_META: Record<ModelFamily, { color: string; label: string }> = {
  opus: { color: "#8B5CF6", label: "Opus" },
  sonnet: { color: "#3B82F6", label: "Sonnet" },
  haiku: { color: "#10B981", label: "Haiku" },
};

export const EFFORT_META: Record<EffortLevel, { label: string; description: string; color: string }> = {
  low: { label: "Low", description: "Fast, efficient, saves tokens", color: "#10B981" },
  medium: { label: "Medium", description: "Balanced approach", color: "#3B82F6" },
  high: { label: "High", description: "Default, high capability", color: "#F59E0B" },
  max: { label: "Max", description: "No token constraints (Opus only)", color: "#EF4444" },
};

export type ModelRole = "orchestrator" | "scout" | "executor" | "verifier";

export const ROLE_META: Record<ModelRole, { label: string; description: string; icon: string }> = {
  orchestrator: { label: "Orchestrator", description: "Central brain: plans specs, tickets, phases and supervises execution", icon: "brain" },
  scout: { label: "Scout", description: "Analyzes codebase structure and patterns", icon: "search" },
  executor: { label: "Executor", description: "Implements code changes from phase plans", icon: "code" },
  verifier: { label: "Verifier", description: "Reviews changes and checks spec compliance", icon: "shield-check" },
};
