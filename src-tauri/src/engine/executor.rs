use anyhow::Result;
use serde_json::json;

use crate::types::*;
use crate::claude::process::{run_claude_with_callback, ClaudeProcessOptions, StreamCallback};
use crate::claude::prompts::{create_template_engine, render_prompt};
use crate::storage::usage::UsageContext;

/// Execute a phase via claude -p with streaming output
pub async fn execute_phase_streaming(
    phase: &Phase,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<PhaseExecution> {
    let engine = create_template_engine()?;

    let prompt = render_prompt(&engine, "executor", &json!({
        "phase_title": phase.title,
        "phase_description": phase.description,
        "phase_objective": phase.plan.objective,
        "steps": phase.plan.steps.iter().map(|s| json!({
            "order": s.order,
            "description": s.description,
            "file_targets": s.file_targets,
        })).collect::<Vec<_>>(),
        "files_to_create": phase.plan.files_to_create.iter().map(|f| json!({
            "path": f.path,
            "description": f.description,
            "references": f.references,
        })).collect::<Vec<_>>(),
        "files_to_modify": phase.plan.files_to_modify.iter().map(|f| json!({
            "path": f.path,
            "description": f.description,
            "references": f.references,
        })).collect::<Vec<_>>(),
        "files_to_delete": phase.plan.files_to_delete,
        "context_files": phase.plan.context_files,
        "test_strategy": phase.plan.test_strategy,
    }))?;

    let started_at = chrono::Utc::now().to_rfc3339();

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.executor.model_id.clone(),
            effort: config.models.executor.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: Some("You are a senior software engineer implementing a specific phase of development. Follow the plan precisely. Read reference files before making changes to match existing conventions.".to_string()),
            allowed_tools: Some(vec![
                "Read".to_string(),
                "Write".to_string(),
                "Edit".to_string(),
                "Glob".to_string(),
                "Grep".to_string(),
                "Bash".to_string(),
            ]),
            json_schema: None,
            streaming: true,
            session_resume: None,
            usage: Some(UsageContext::new("executor", Some(phase.epic_id.clone()))),
            provider: None, // needs full agent tools — CLI only
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
