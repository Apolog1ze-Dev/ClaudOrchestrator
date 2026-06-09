use serde::{Deserialize, Serialize};

// ─── Subscription Plan ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionPlan {
    Pro,
    #[serde(rename = "max_5x")]
    Max5x,
    #[serde(rename = "max_20x")]
    Max20x,
    Team,
    TeamPremium,
    Enterprise,
    Unknown,
}

impl Default for SubscriptionPlan {
    fn default() -> Self {
        SubscriptionPlan::Unknown
    }
}

/// Subscription plan metadata for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanInfo {
    pub plan: SubscriptionPlan,
    pub display_name: String,
    pub price: String,
    /// Relative usage multiplier vs Pro (Pro = 1x)
    pub usage_multiplier: f64,
    /// Models available on this plan
    pub available_model_families: Vec<ModelFamily>,
    /// Whether effort "max" is usable (Opus model required, but plan affects how fast you hit limits)
    pub max_effort_practical: bool,
    /// Warning message about Opus usage if on Pro
    pub opus_warning: Option<String>,
}

pub fn plan_info(plan: &SubscriptionPlan) -> PlanInfo {
    match plan {
        SubscriptionPlan::Pro => PlanInfo {
            plan: SubscriptionPlan::Pro,
            display_name: "Pro".to_string(),
            price: "$20/mo".to_string(),
            usage_multiplier: 1.0,
            available_model_families: vec![ModelFamily::Opus, ModelFamily::Sonnet, ModelFamily::Haiku],
            max_effort_practical: false,
            opus_warning: Some("Opus uses ~5x your quota. You'll hit rate limits quickly.".to_string()),
        },
        SubscriptionPlan::Max5x => PlanInfo {
            plan: SubscriptionPlan::Max5x,
            display_name: "Max (5x)".to_string(),
            price: "$100/mo".to_string(),
            usage_multiplier: 5.0,
            available_model_families: vec![ModelFamily::Opus, ModelFamily::Sonnet, ModelFamily::Haiku],
            max_effort_practical: true,
            opus_warning: None,
        },
        SubscriptionPlan::Max20x => PlanInfo {
            plan: SubscriptionPlan::Max20x,
            display_name: "Max (20x)".to_string(),
            price: "$200/mo".to_string(),
            usage_multiplier: 20.0,
            available_model_families: vec![ModelFamily::Opus, ModelFamily::Sonnet, ModelFamily::Haiku],
            max_effort_practical: true,
            opus_warning: None,
        },
        SubscriptionPlan::Team => PlanInfo {
            plan: SubscriptionPlan::Team,
            display_name: "Team".to_string(),
            price: "$25/user/mo".to_string(),
            usage_multiplier: 1.0,
            available_model_families: vec![ModelFamily::Sonnet, ModelFamily::Haiku],
            max_effort_practical: false,
            opus_warning: Some("Opus not available on Team standard seats.".to_string()),
        },
        SubscriptionPlan::TeamPremium => PlanInfo {
            plan: SubscriptionPlan::TeamPremium,
            display_name: "Team Premium".to_string(),
            price: "$150/user/mo".to_string(),
            usage_multiplier: 20.0,
            available_model_families: vec![ModelFamily::Opus, ModelFamily::Sonnet, ModelFamily::Haiku],
            max_effort_practical: true,
            opus_warning: None,
        },
        SubscriptionPlan::Enterprise => PlanInfo {
            plan: SubscriptionPlan::Enterprise,
            display_name: "Enterprise".to_string(),
            price: "Custom".to_string(),
            usage_multiplier: 20.0,
            available_model_families: vec![ModelFamily::Opus, ModelFamily::Sonnet, ModelFamily::Haiku],
            max_effort_practical: true,
            opus_warning: None,
        },
        SubscriptionPlan::Unknown => PlanInfo {
            plan: SubscriptionPlan::Unknown,
            display_name: "Unknown".to_string(),
            price: "—".to_string(),
            usage_multiplier: 1.0,
            available_model_families: vec![ModelFamily::Opus, ModelFamily::Sonnet, ModelFamily::Haiku],
            max_effort_practical: false,
            opus_warning: Some("Plan not detected. Opus may exhaust your quota quickly.".to_string()),
        },
    }
}

// ─── Model Identification ────────────────────────────────────────────────────

/// A specific Claude model with family, version, and context window
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClaudeModel {
    /// CLI-friendly ID passed to `claude -p --model`. e.g. "opus", "sonnet", "claude-opus-4-6"
    pub id: String,
    /// Human-readable display name
    pub display_name: String,
    /// Model family
    pub family: ModelFamily,
    /// Version string e.g. "4.6", "4.5"
    pub version: String,
    /// Context window size
    pub context_window: ContextWindow,
    /// Maximum output tokens
    pub max_output_tokens: u32,
    /// Supported effort levels
    pub supported_efforts: Vec<EffortLevel>,
    /// Whether adaptive thinking is supported
    pub adaptive_thinking: bool,
    /// Quota consumption multiplier relative to Sonnet (Sonnet=1x, Opus≈5x, Haiku≈0.3x)
    pub quota_cost_multiplier: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModelFamily {
    Opus,
    Sonnet,
    Haiku,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ContextWindow {
    #[serde(rename = "200k")]
    Tokens200k,
    #[serde(rename = "1m")]
    Tokens1M,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EffortLevel {
    Low,
    Medium,
    High,
    Max,
}

impl EffortLevel {
    pub fn to_cli_arg(&self) -> &str {
        match self {
            EffortLevel::Low => "low",
            EffortLevel::Medium => "medium",
            EffortLevel::High => "high",
            EffortLevel::Max => "max",
        }
    }
}

// ─── Model Assignment ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelAssignment {
    /// The model CLI id (e.g. "opus", "sonnet", "claude-opus-4-6")
    pub model_id: String,
    /// Effort level for this role
    pub effort: EffortLevel,
    /// Max agentic turns
    #[serde(default)]
    pub max_turns: Option<u32>,
    /// Legacy field — ignored but accepted for backward compat with old configs
    #[serde(default, skip_serializing)]
    pub max_budget_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub orchestrator: ModelAssignment,
    pub scout: ModelAssignment,
    pub executor: ModelAssignment,
    pub verifier: ModelAssignment,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            orchestrator: ModelAssignment {
                model_id: "sonnet".to_string(),
                effort: EffortLevel::High,
                max_turns: Some(30),
                max_budget_usd: None,
            },
            scout: ModelAssignment {
                model_id: "haiku".to_string(),
                effort: EffortLevel::Medium,
                max_turns: Some(20),
                max_budget_usd: None,
            },
            executor: ModelAssignment {
                model_id: "sonnet".to_string(),
                effort: EffortLevel::High,
                max_turns: Some(50),
                max_budget_usd: None,
            },
            verifier: ModelAssignment {
                model_id: "opus".to_string(),
                effort: EffortLevel::Max,
                max_turns: Some(20),
                max_budget_usd: None,
            },
        }
    }
}

// ─── Available Models Registry ───────────────────────────────────────────────

/// Returns all known Claude models with their capabilities
pub fn available_models() -> Vec<ClaudeModel> {
    vec![
        // ── Opus 4.6 ──
        // ── Opus 4.6 ──
        ClaudeModel {
            id: "opus".to_string(),
            display_name: "Claude Opus 4.6".to_string(),
            family: ModelFamily::Opus,
            version: "4.6".to_string(),
            context_window: ContextWindow::Tokens200k,
            max_output_tokens: 128_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High, EffortLevel::Max],
            adaptive_thinking: true,
            quota_cost_multiplier: 5.0,
        },
        ClaudeModel {
            id: "opus[1m]".to_string(),
            display_name: "Claude Opus 4.6 (1M)".to_string(),
            family: ModelFamily::Opus,
            version: "4.6".to_string(),
            context_window: ContextWindow::Tokens1M,
            max_output_tokens: 128_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High, EffortLevel::Max],
            adaptive_thinking: true,
            quota_cost_multiplier: 5.0,
        },
        // ── Sonnet 4.6 ──
        ClaudeModel {
            id: "sonnet".to_string(),
            display_name: "Claude Sonnet 4.6".to_string(),
            family: ModelFamily::Sonnet,
            version: "4.6".to_string(),
            context_window: ContextWindow::Tokens200k,
            max_output_tokens: 64_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High],
            adaptive_thinking: true,
            quota_cost_multiplier: 1.0,
        },
        ClaudeModel {
            id: "sonnet[1m]".to_string(),
            display_name: "Claude Sonnet 4.6 (1M)".to_string(),
            family: ModelFamily::Sonnet,
            version: "4.6".to_string(),
            context_window: ContextWindow::Tokens1M,
            max_output_tokens: 64_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High],
            adaptive_thinking: true,
            quota_cost_multiplier: 1.0,
        },
        // ── Haiku 4.5 ──
        ClaudeModel {
            id: "haiku".to_string(),
            display_name: "Claude Haiku 4.5".to_string(),
            family: ModelFamily::Haiku,
            version: "4.5".to_string(),
            context_window: ContextWindow::Tokens200k,
            max_output_tokens: 64_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High],
            adaptive_thinking: false,
            quota_cost_multiplier: 0.27,
        },
        // ── Opus 4.5 (legacy) ──
        ClaudeModel {
            id: "claude-opus-4-5-20251101".to_string(),
            display_name: "Claude Opus 4.5".to_string(),
            family: ModelFamily::Opus,
            version: "4.5".to_string(),
            context_window: ContextWindow::Tokens200k,
            max_output_tokens: 128_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High, EffortLevel::Max],
            adaptive_thinking: true,
            quota_cost_multiplier: 5.0,
        },
        // ── Sonnet 4.5 (legacy) ──
        ClaudeModel {
            id: "claude-sonnet-4-5-20250929".to_string(),
            display_name: "Claude Sonnet 4.5".to_string(),
            family: ModelFamily::Sonnet,
            version: "4.5".to_string(),
            context_window: ContextWindow::Tokens200k,
            max_output_tokens: 64_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High],
            adaptive_thinking: true,
            quota_cost_multiplier: 1.0,
        },
        // ── Hybrid ──
        ClaudeModel {
            id: "opusplan".to_string(),
            display_name: "Opus Plan (Opus + Sonnet hybrid)".to_string(),
            family: ModelFamily::Opus,
            version: "4.6".to_string(),
            context_window: ContextWindow::Tokens200k,
            max_output_tokens: 128_000,
            supported_efforts: vec![EffortLevel::Low, EffortLevel::Medium, EffortLevel::High, EffortLevel::Max],
            adaptive_thinking: true,
            quota_cost_multiplier: 3.0, // Hybrid: uses Opus for planning, Sonnet for execution
        },
    ]
}

// ─── Remaining Config Types (unchanged) ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YoloConfig {
    /// Max total quota units before stopping. Accepts legacy "max_total_budget_usd" key.
    #[serde(alias = "max_total_budget_usd")]
    pub max_total_budget_qu: f64,
    pub stop_on_verification_failure: bool,
    pub adapt_specs: bool,
}

impl Default for YoloConfig {
    fn default() -> Self {
        Self {
            max_total_budget_qu: 50000.0,
            stop_on_verification_failure: true,
            adapt_specs: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TrustMode {
    Autonomous,
    Supervised,
}

impl Default for TrustMode {
    fn default() -> Self {
        TrustMode::Autonomous
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    pub parallel_tickets: u32,
    pub auto_remediate: bool,
    pub max_remediation_attempts: u32,
    pub yolo: YoloConfig,
    /// Whether commands run freely (autonomous) or need user approval (supervised)
    #[serde(default)]
    pub trust_mode: TrustMode,
    /// Whether to pause after each phase for user review (Accept/Retry/Skip/Reject)
    #[serde(default)]
    pub review_gate_enabled: bool,
}

impl Default for ExecutionConfig {
    fn default() -> Self {
        Self {
            parallel_tickets: 1,
            auto_remediate: true,
            max_remediation_attempts: 3,
            yolo: YoloConfig::default(),
            trust_mode: TrustMode::default(),
            review_gate_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationConfig {
    pub run_tests: bool,
    pub test_command: String,
    pub run_lint: bool,
    pub lint_command: String,
    pub run_typecheck: bool,
    pub typecheck_command: String,
    pub diff_review: bool,
    pub spec_compliance_check: bool,
    pub minimum_score: u32,
}

impl Default for VerificationConfig {
    fn default() -> Self {
        Self {
            run_tests: true,
            test_command: "npm test".to_string(),
            run_lint: true,
            lint_command: "npm run lint".to_string(),
            run_typecheck: true,
            typecheck_command: "npx tsc --noEmit".to_string(),
            diff_review: true,
            spec_compliance_check: true,
            minimum_score: 70,
        }
    }
}

// ─── Planning Detail ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlanningDetail {
    /// Plan each ticket individually with full per-ticket phases (current behavior)
    Detailed,
    /// Generate a single consolidated plan covering all tickets with lighter per-ticket detail
    Quick,
}

impl Default for PlanningDetail {
    fn default() -> Self {
        PlanningDetail::Detailed
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "super::epic::default_schema_version")]
    pub schema_version: u32,
    pub models: ModelConfig,
    pub execution: ExecutionConfig,
    pub verification: VerificationConfig,
    pub target_dir: Option<String>,
    /// How detailed the phase planning should be
    #[serde(default)]
    pub planning_detail: PlanningDetail,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: super::epic::SCHEMA_VERSION,
            models: ModelConfig::default(),
            execution: ExecutionConfig::default(),
            verification: VerificationConfig::default(),
            target_dir: None,
            planning_detail: PlanningDetail::default(),
        }
    }
}
