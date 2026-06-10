use crate::storage::AppState;
use crate::types::*;
use crate::claude::process::{ClaudeProcessOptions, run_claude_with_callback, StreamCallback};
use crate::claude::prompts::{create_template_engine, render_prompt, impact_analysis_schema, refine_apply_schema};
use serde_json::json;

fn channel_callback(
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> StreamCallback {
    Box::new(move |event| {
        let _ = channel.send(event);
        Ok(())
    })
}

/// Gather all plan documents for an epic into JSON-serializable data
fn gather_plan_context(
    state: &AppState,
    target_dir: &str,
    epic_id: &str,
) -> Result<(Epic, Vec<Spec>, Vec<Ticket>), String> {
    let epic = state.load_epic(target_dir, epic_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(target_dir, epic_id).map_err(|e| e.to_string())?;
    let tickets = state.list_tickets(target_dir, epic_id).map_err(|e| e.to_string())?;
    Ok((epic, specs, tickets))
}

/// Build spec data for prompt templates
fn specs_to_json(specs: &[Spec]) -> Vec<serde_json::Value> {
    specs.iter().map(|s| json!({
        "id": s.id,
        "spec_type": format!("{:?}", s.spec_type),
        "title": s.title,
        "content": s.content,
    })).collect()
}

/// Build ticket data for prompt templates
fn tickets_to_json(tickets: &[Ticket]) -> Vec<serde_json::Value> {
    tickets.iter().map(|t| json!({
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "priority": t.priority,
        "estimated_complexity": format!("{:?}", t.estimated_complexity),
        "acceptance_criteria": t.acceptance_criteria,
        "dependencies": t.dependencies,
    })).collect()
}

// ─── Ask Mode ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn chat_ask(
    epic_id: String,
    target_dir: String,
    message: String,
    context_snippets: Vec<ContextSnippet>,
    conversation_history: Vec<ChatHistoryEntry>,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<String, String> {
    let config = state.get_config();
    let (epic, specs, tickets) = gather_plan_context(&state, &target_dir, &epic_id)?;

    let engine = create_template_engine().map_err(|e| e.to_string())?;
    let prompt = render_prompt(&engine, "chat_ask", &json!({
        "objective": epic.objective,
        "specs": specs_to_json(&specs),
        "tickets": tickets_to_json(&tickets),
        "context_snippets": context_snippets,
        "conversation_history": conversation_history,
        "message": message,
    })).map_err(|e| e.to_string())?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.clone(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: None, // Raw text response
            streaming: true,
            session_resume: None,
            usage: Some(crate::storage::usage::UsageContext::new("chat_ask", Some(epic_id.clone()))),
            provider: config.models.orchestrator.provider.clone(),
        },
        channel_callback(channel),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.result)
}

// ─── Refine Check (Impact Analysis) ──────────────────────────────────────────

#[tauri::command]
pub async fn chat_refine_check(
    epic_id: String,
    target_dir: String,
    message: String,
    context_snippets: Vec<ContextSnippet>,
    conversation_history: Vec<ChatHistoryEntry>,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<ImpactAnalysis, String> {
    let config = state.get_config();
    let (epic, specs, tickets) = gather_plan_context(&state, &target_dir, &epic_id)?;

    let engine = create_template_engine().map_err(|e| e.to_string())?;
    let prompt = render_prompt(&engine, "chat_refine_check", &json!({
        "objective": epic.objective,
        "specs": specs_to_json(&specs),
        "tickets": tickets_to_json(&tickets),
        "context_snippets": context_snippets,
        "conversation_history": conversation_history,
        "message": message,
    })).map_err(|e| e.to_string())?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.clone(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(impact_analysis_schema()),
            streaming: true,
            session_resume: None,
            usage: Some(crate::storage::usage::UsageContext::new("chat_refine_check", Some(epic_id.clone()))),
            provider: config.models.orchestrator.provider.clone(),
        },
        channel_callback(channel),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Parse structured output
    let output = result.structured_output
        .ok_or("No structured output from impact analysis")?;
    let analysis: ImpactAnalysis = serde_json::from_value(output)
        .map_err(|e| format!("Failed to parse impact analysis: {}", e))?;

    Ok(analysis)
}

// ─── Refine Apply ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn chat_refine_apply(
    epic_id: String,
    target_dir: String,
    message: String,
    context_snippets: Vec<ContextSnippet>,
    impact_analysis: ImpactAnalysis,
    conversation_history: Vec<ChatHistoryEntry>,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<String, String> {
    let config = state.get_config();
    let (epic, specs, tickets) = gather_plan_context(&state, &target_dir, &epic_id)?;

    // Build list of affected documents with their full content
    // Clone channel for use in the coherency review later
    let review_channel = channel.clone();

    let affected_docs: Vec<serde_json::Value> = impact_analysis.impacts.iter().filter_map(|impact| {
        match impact.document_type.as_str() {
            "prd" | "tech_spec" | "design_spec" | "architecture" | "api_spec" | "custom" => {
                specs.iter().find(|s| s.id == impact.document_id).map(|s| json!({
                    "document_type": impact.document_type,
                    "id": s.id,
                    "title": s.title,
                    "content": s.content,
                }))
            }
            "ticket" => {
                tickets.iter().find(|t| t.id == impact.document_id).map(|t| json!({
                    "document_type": "ticket",
                    "id": t.id,
                    "title": t.title,
                    "content": format!("{}\n\nAcceptance Criteria:\n{}", t.description, t.acceptance_criteria.join("\n- ")),
                }))
            }
            _ => None,
        }
    }).collect();

    let engine = create_template_engine().map_err(|e| e.to_string())?;
    let prompt = render_prompt(&engine, "chat_refine_apply", &json!({
        "affected_docs": affected_docs,
        "impact_summary": impact_analysis.summary,
        "impact_risk_level": impact_analysis.risk_level,
        "impacts": impact_analysis.impacts,
        "context_snippets": context_snippets,
        "message": message,
    })).map_err(|e| e.to_string())?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.clone(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(refine_apply_schema()),
            streaming: true,
            session_resume: None,
            usage: Some(crate::storage::usage::UsageContext::new("chat_refine_apply", Some(epic_id.clone()))),
            provider: config.models.orchestrator.provider.clone(),
        },
        channel_callback(channel),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Parse and apply changes
    let output = result.structured_output
        .ok_or("No structured output from refine apply")?;
    let summary = output.get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or("Changes applied")
        .to_string();

    if let Some(changes) = output.get("changes").and_then(|v| v.as_array()) {
        for change in changes {
            let doc_type = change.get("document_type").and_then(|v| v.as_str()).unwrap_or("");
            let doc_id = change.get("document_id").and_then(|v| v.as_str()).unwrap_or("");
            let new_content = change.get("new_content").and_then(|v| v.as_str()).unwrap_or("");

            if new_content.is_empty() { continue; }

            match doc_type {
                "prd" | "tech_spec" | "design_spec" | "architecture" | "api_spec" | "custom" => {
                    // Update the spec
                    if let Ok(mut spec) = state.load_spec(&target_dir, &epic_id, doc_id) {
                        spec.content = new_content.to_string();
                        spec.updated_at = chrono::Utc::now().to_rfc3339();
                        spec.version += 1;
                        let _ = state.save_spec(&target_dir, &epic_id, &spec);
                    }
                }
                "ticket" => {
                    // Update ticket description
                    if let Ok(mut ticket) = state.load_ticket(&target_dir, &epic_id, doc_id) {
                        ticket.description = new_content.to_string();
                        ticket.updated_at = chrono::Utc::now().to_rfc3339();
                        let _ = state.save_ticket(&target_dir, &epic_id, &ticket);
                    }
                }
                _ => {}
            }
        }
    }

    // Update epic timestamp
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;

    // Run coherency review using verifier model
    let _ = channel_callback(review_channel.clone())(FrontendStreamEvent::Status {
        message: "Running coherency review...".to_string(),
    });

    let review_specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let review_tickets = state.list_tickets(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    let review_prompt = format!(
        "Review the following project plan documents for coherency and consistency after recent modifications.\n\n\
        Summary of changes: {}\n\n\
        ## Specs\n{}\n\n\
        ## Tickets\n{}\n\n\
        Check for:\n\
        1. Cross-references that are now inconsistent\n\
        2. Acceptance criteria that no longer match the specs\n\
        3. Technical decisions that conflict across documents\n\
        4. Missing updates in dependent documents\n\n\
        Provide a brief coherency report.",
        summary,
        review_specs.iter().map(|s| format!("### {}\n{}\n", s.title, &s.content[..s.content.len().min(2000)])).collect::<Vec<_>>().join("\n"),
        review_tickets.iter().map(|t| format!("- {}: {}", t.title, &t.description[..t.description.len().min(500)])).collect::<Vec<_>>().join("\n"),
    );

    let _ = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt: review_prompt,
            model_id: config.models.verifier.model_id.clone(),
            effort: config.models.verifier.effort.clone(),
            working_dir: target_dir.clone(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: None,
            streaming: true,
            session_resume: None,
            usage: Some(crate::storage::usage::UsageContext::new("refine_coherency_review", Some(epic_id.clone()))),
            provider: config.models.verifier.provider.clone(),
        },
        channel_callback(review_channel),
    )
    .await;

    Ok(summary)
}
