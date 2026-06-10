use anyhow::Result;
use crate::types::AppConfig;
use crate::claude::process::{run_claude_with_callback, ClaudeProcessOptions, StreamCallback};
use crate::claude::prompts::{create_template_engine, render_prompt};
use crate::storage::usage::UsageContext;
use serde_json::json;

/// Analyze a codebase and return a structured context string
pub async fn analyze_codebase(
    target_dir: &str,
    config: &AppConfig,
    on_event: StreamCallback,
) -> Result<String> {
    let engine = create_template_engine()?;
    let prompt = render_prompt(&engine, "scout", &json!({
        "target_dir": target_dir,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.scout.model_id.clone(),
            effort: config.models.scout.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: Some("You are a codebase analysis specialist. Analyze the project structure and report your findings in a structured format.".to_string()),
            allowed_tools: Some(vec![
                "Read".to_string(),
                "Glob".to_string(),
                "Grep".to_string(),
            ]),
            json_schema: None,
            streaming: true,
            session_resume: None,
            usage: Some(UsageContext::new("scout", None)),
            provider: None, // needs Read/Glob/Grep tools — CLI only
        },
        on_event,
    )
    .await?;

    Ok(result.result)
}
