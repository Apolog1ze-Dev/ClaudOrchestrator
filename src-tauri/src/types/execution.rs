use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionResult {
    Success,
    Error,
    Interrupted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseExecution {
    pub session_id: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub result: ExecutionResult,
    pub cost_usd: f64,
    pub files_changed: Vec<String>,
    pub git_diff: Option<String>,
    pub error_message: Option<String>,
}

/// Events streamed from claude -p via --output-format stream-json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "system")]
    System {
        subtype: String,
        session_id: Option<String>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    #[serde(rename = "assistant")]
    Assistant {
        message: serde_json::Value,
    },
    #[serde(rename = "result")]
    Result {
        result: String,
        session_id: String,
        total_cost_usd: Option<f64>,
        #[serde(flatten)]
        extra: serde_json::Value,
    },
    #[serde(rename = "stream_event")]
    StreamDelta {
        event: serde_json::Value,
    },
    #[serde(other)]
    Unknown,
}

/// Simplified event sent to the React frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum FrontendStreamEvent {
    #[serde(rename = "text")]
    Text { content: String },
    #[serde(rename = "thinking")]
    Thinking { content: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        tool: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool: String,
        output: String,
    },
    #[serde(rename = "status")]
    Status { message: String },
    #[serde(rename = "cost")]
    Cost { usd: f64 },
    #[serde(rename = "complete")]
    Complete {
        result: String,
        session_id: String,
        total_cost_usd: f64,
    },
    #[serde(rename = "error")]
    Error { message: String },

    // ─── Orchestration events (supervised execution) ──────────────
    #[serde(rename = "phase_started")]
    PhaseStarted {
        phase_id: String,
        phase_title: String,
        ticket_id: String,
        ticket_title: String,
        phase_order: u32,
        total_phases: u32,
    },
    #[serde(rename = "phase_completed")]
    PhaseCompleted {
        phase_id: String,
        status: String,
        score: u32,
        cost_usd: f64,
    },
    #[serde(rename = "ticket_started")]
    TicketStarted {
        ticket_id: String,
        ticket_title: String,
        ticket_order: u32,
        total_tickets: u32,
    },
    #[serde(rename = "ticket_completed")]
    TicketCompleted {
        ticket_id: String,
        status: String,
    },
    #[serde(rename = "verification_result")]
    VerificationResult {
        phase_id: String,
        score: u32,
        passed: bool,
        summary: String,
        checks: Vec<String>,
    },
    #[serde(rename = "remediation_started")]
    RemediationStarted {
        phase_id: String,
        attempt: u32,
        max_attempts: u32,
    },

    // ─── Stop/Resume events ─────────────────────────────────────
    #[serde(rename = "execution_stopped")]
    ExecutionStopped {
        reason: String, // "user_stopped" | "cancelled" | "completed"
        last_completed_phase_id: Option<String>,
    },

    // ─── Command Approval events ────────────────────────────────
    #[serde(rename = "approval_request")]
    ApprovalRequest {
        request_id: String,
        command: String,
        context: String, // "verification" | "remediation"
        phase_id: String,
    },

    // ─── Planning progress events ─────────────────────────────────
    #[serde(rename = "spec_saved")]
    SpecSaved {
        spec_id: String,
        spec_type: String,
        title: String,
    },

    // ─── Review Gate events ──────────────────────────────────────
    #[serde(rename = "phase_review_ready")]
    PhaseReviewReady {
        request_id: String,
        phase_id: String,
        phase_title: String,
        score: u32,
        status: String,
        checks: Vec<String>,
        suggested_fixes: Vec<String>,
    },
}
