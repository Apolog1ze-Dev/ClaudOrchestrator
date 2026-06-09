use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    Passed,
    Failed,
    Partial,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CheckType {
    SpecCompliance,
    Test,
    Lint,
    Typecheck,
    DiffReview,
    AcceptanceCriteria,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationCheck {
    pub name: String,
    pub check_type: CheckType,
    pub passed: bool,
    pub details: String,
    pub severity: Severity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseVerification {
    pub status: VerificationStatus,
    pub checks: Vec<VerificationCheck>,
    pub overall_score: u32,
    pub reasoning: String,
    pub suggested_fixes: Vec<String>,
    pub verified_at: String,
}
