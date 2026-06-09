use anyhow::Result;
use serde_json::json;

use crate::types::*;
use crate::claude::process::{run_claude_with_callback, ClaudeProcessOptions, StreamCallback};
use crate::claude::prompts::{create_template_engine, render_prompt};

/// Attempt to remediate a failed phase
pub async fn remediate(
    phase: &Phase,
    verification: &PhaseVerification,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<PhaseExecution> {
    let engine = create_template_engine()?;

    let failed_checks: Vec<serde_json::Value> = verification
        .checks
        .iter()
        .filter(|c| !c.passed)
        .map(|c| {
            json!({
                "name": c.name,
                "severity": format!("{:?}", c.severity),
                "details": c.details,
            })
        })
        .collect();

    let prompt = render_prompt(&engine, "remediation", &json!({
        "phase_title": phase.title,
        "phase_objective": phase.plan.objective,
        "verification_score": verification.overall_score,
        "verification_status": format!("{:?}", verification.status),
        "failed_checks": failed_checks,
        "suggested_fixes": verification.suggested_fixes,
    }))?;

    let started_at = chrono::Utc::now().to_rfc3339();
    let session_resume = phase.execution.as_ref().and_then(|e| e.session_id.clone());

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.executor.model_id.clone(),
            effort: config.models.executor.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: Some("You are fixing issues found during verification. Focus only on the specific failures listed. Do not refactor or add features beyond what's needed.".to_string()),
            allowed_tools: Some(vec![
                "Read".to_string(),
                "Write".to_string(),
                "Edit".to_string(),
                "Glob".to_string(),
                "Grep".to_string(),
            ]),
            json_schema: None,
            streaming: true,
            session_resume,
        },
        on_event,
    )
    .await?;

    let completed_at = chrono::Utc::now().to_rfc3339();

    Ok(PhaseExecution {
        session_id: result.session_id,
        started_at,
        completed_at: Some(completed_at),
        result: ExecutionResult::Success,
        cost_usd: result.total_cost_usd,
        files_changed: Vec::new(),
        git_diff: None,
        error_message: None,
    })
}
