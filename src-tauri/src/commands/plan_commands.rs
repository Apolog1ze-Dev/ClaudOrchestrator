use crate::storage::AppState;
use crate::types::*;
use crate::engine::{planner, scout};

fn channel_callback(
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> crate::claude::process::StreamCallback {
    Box::new(move |event| {
        let _ = channel.send(event);
        Ok(())
    })
}

fn noop_cb() -> crate::claude::process::StreamCallback {
    Box::new(|_| Ok(()))
}

/// Helper to update epic planning step + save
fn set_step(state: &AppState, target_dir: &str, epic_id: &str, step: &str, active: bool) -> Result<Epic, String> {
    let mut epic = state.load_epic(target_dir, epic_id).map_err(|e| e.to_string())?;
    epic.planning_step = step.to_string();
    epic.planning_active = active;
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(target_dir, &epic).map_err(|e| e.to_string())?;
    Ok(epic)
}

// ─── Step 1: Scout Codebase ──────────────────────────────────────────────────

/// Runs the scout to analyze the codebase, then generates clarifying questions.
/// Updates planning_step from "draft" → "scouting" → "clarifying"
#[tauri::command]
pub async fn start_scouting(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    set_step(&state, &target_dir, &epic_id, "scouting", true)?;

    channel.send(FrontendStreamEvent::Status {
        message: "Scanning codebase...".to_string(),
    }).map_err(|e| e.to_string())?;

    // Run scout
    let codebase_ctx = scout::analyze_codebase(&target_dir, &config, channel_callback(channel.clone()))
        .await
        .unwrap_or_default();

    // Save codebase context to epic
    {
        let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        epic.codebase_context = Some(codebase_ctx.clone());
        epic.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    }

    // Auto-generate epic title from objective
    {
        let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        if epic.title.is_empty() {
            channel.send(FrontendStreamEvent::Status {
                message: "Generating epic title...".to_string(),
            }).map_err(|e| e.to_string())?;

            let title_prompt = format!(
                "Generate a concise 3-6 word title for this development task. Return ONLY the title text, nothing else.\n\nObjective: {}",
                epic.objective
            );
            let title_result = crate::claude::process::run_claude(
                crate::claude::process::ClaudeProcessOptions {
                    prompt: title_prompt,
                    model_id: "haiku".to_string(),
                    effort: crate::types::config::EffortLevel::Low,
                    working_dir: target_dir.clone(),
                    system_prompt: None,
                    allowed_tools: Some(vec!["none".to_string()]),
                    json_schema: None,
                    streaming: false,
                    session_resume: None,
                },
            ).await;

            if let Ok(result) = title_result {
                let generated_title = result.result.trim().trim_matches('"').to_string();
                if !generated_title.is_empty() && generated_title.len() <= 100 {
                    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
                    epic.title = generated_title;
                    epic.updated_at = chrono::Utc::now().to_rfc3339();
                    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    channel.send(FrontendStreamEvent::Status {
        message: "Generating clarifying questions...".to_string(),
    }).map_err(|e| e.to_string())?;

    // Generate initial clarifying questions
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let questions = planner::capture_intent(&epic, &config, &target_dir, channel_callback(channel.clone()))
        .await
        .map_err(|e| e.to_string())?;

    // Save questions and advance to clarifying step
    {
        let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        epic.clarifying_questions = questions;
        epic.planning_step = "clarifying".to_string();
        epic.planning_active = false;
        epic.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    }

    channel.send(FrontendStreamEvent::Status {
        message: "Ready for your answers".to_string(),
    }).map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Step 2: Clarifying Q&A ─────────────────────────────────────────────────

/// Save user's answers to clarifying questions
#[tauri::command]
pub fn submit_answers(
    epic_id: String,
    target_dir: String,
    answers: Vec<ClarifyingQA>,
    state: tauri::State<'_, AppState>,
) -> Result<Epic, String> {
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    epic.clarifying_questions = answers;
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    Ok(epic)
}

/// Ask for follow-up questions based on existing answers
#[tauri::command]
pub async fn request_more_questions(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();

    // Increment the clarification round before generating new questions
    {
        let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        epic.clarification_round += 1;
        epic.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    }

    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    let new_questions = planner::capture_intent(&epic, &config, &target_dir, channel_callback(channel))
        .await
        .map_err(|e| e.to_string())?;

    // Append new questions with fuzzy dedup (check if topic is already covered)
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    for q in new_questions {
        // Fuzzy dedup: check if any existing question covers the same topic
        // (case-insensitive substring match on keywords)
        let q_lower = q.question.to_lowercase();
        let is_duplicate = epic.clarifying_questions.iter().any(|existing| {
            let e_lower = existing.question.to_lowercase();
            // Exact match
            if e_lower == q_lower { return true; }
            // Check for key topic overlap (experience/skill level)
            let experience_words = ["experience level", "how experienced", "technical background", "skill level", "familiarity with"];
            if experience_words.iter().any(|w| q_lower.contains(w)) && experience_words.iter().any(|w| e_lower.contains(w)) {
                return true;
            }
            false
        });

        if !is_duplicate {
            epic.clarifying_questions.push(q);
        }
    }
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Step 3: Generate Specs ─────────────────────────────────────────────────

/// Generate PRD + Tech Spec. Updates planning_step to "specs_review"
#[tauri::command]
pub async fn generate_specs(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    set_step(&state, &target_dir, &epic_id, "generating_specs", true)?;

    channel.send(FrontendStreamEvent::Status {
        message: "Generating PRD...".to_string(),
    }).map_err(|e| e.to_string())?;

    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let prd = planner::generate_prd(&epic, &config, &target_dir, channel_callback(channel.clone()))
        .await
        .map_err(|e| e.to_string())?;
    state.save_spec(&target_dir, &epic_id, &prd).map_err(|e| e.to_string())?;
    channel.send(FrontendStreamEvent::SpecSaved {
        spec_id: prd.id.clone(),
        spec_type: serde_json::to_value(&prd.spec_type).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(),
        title: prd.title.clone(),
    }).map_err(|e| e.to_string())?;

    channel.send(FrontendStreamEvent::Status {
        message: "Generating technical spec...".to_string(),
    }).map_err(|e| e.to_string())?;

    let tech_spec = planner::generate_tech_spec(&epic, &prd, &config, &target_dir, channel_callback(channel.clone()))
        .await
        .map_err(|e| e.to_string())?;
    state.save_spec(&target_dir, &epic_id, &tech_spec).map_err(|e| e.to_string())?;
    channel.send(FrontendStreamEvent::SpecSaved {
        spec_id: tech_spec.id.clone(),
        spec_type: serde_json::to_value(&tech_spec.spec_type).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(),
        title: tech_spec.title.clone(),
    }).map_err(|e| e.to_string())?;

    channel.send(FrontendStreamEvent::Status {
        message: "Generating design document...".to_string(),
    }).map_err(|e| e.to_string())?;

    let design_spec = planner::generate_design_spec(&epic, &prd, &config, &target_dir, channel_callback(channel.clone()))
        .await
        .map_err(|e| e.to_string())?;
    state.save_spec(&target_dir, &epic_id, &design_spec).map_err(|e| e.to_string())?;
    channel.send(FrontendStreamEvent::SpecSaved {
        spec_id: design_spec.id.clone(),
        spec_type: serde_json::to_value(&design_spec.spec_type).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(),
        title: design_spec.title.clone(),
    }).map_err(|e| e.to_string())?;

    // Update epic and advance to specs_review
    {
        let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        epic.spec_ids = vec![prd.id, tech_spec.id, design_spec.id];
        epic.planning_step = "specs_review".to_string();
        epic.planning_active = false;
        epic.status = EpicStatus::Speccing;
        epic.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Regenerate a specific spec with user feedback
#[tauri::command]
pub async fn regenerate_spec(
    epic_id: String,
    target_dir: String,
    spec_type: String,
    feedback: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    // Load existing PRD for tech spec generation context
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let prd = specs.iter().find(|s| s.spec_type == SpecType::Prd);

    // Modify the objective to include feedback
    let mut modified_epic = epic.clone();
    modified_epic.objective = format!(
        "{}\n\n## User Feedback for regeneration\n{}",
        epic.objective, feedback
    );

    let new_spec = if spec_type == "prd" {
        planner::generate_prd(&modified_epic, &config, &target_dir, channel_callback(channel))
            .await
            .map_err(|e| e.to_string())?
    } else if let Some(existing_prd) = prd {
        planner::generate_tech_spec(&modified_epic, existing_prd, &config, &target_dir, channel_callback(channel))
            .await
            .map_err(|e| e.to_string())?
    } else {
        return Err("No PRD found to base tech spec on".to_string());
    };

    state.save_spec(&target_dir, &epic_id, &new_spec).map_err(|e| e.to_string())?;

    // Update spec_ids
    {
        let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        if !epic.spec_ids.contains(&new_spec.id) {
            // Replace the old spec of this type
            let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
            epic.spec_ids = specs.iter().map(|s| s.id.clone()).collect();
        }
        epic.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Approve specs and advance to ticket decomposition
#[tauri::command]
pub fn approve_specs(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<Epic, String> {
    set_step(&state, &target_dir, &epic_id, "generating_tickets", false)
}

// ─── Step 4: Decompose Tickets ──────────────────────────────────────────────

/// Decompose specs into tickets. Updates planning_step to "tickets_review"
#[tauri::command]
pub async fn decompose_tickets(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    set_step(&state, &target_dir, &epic_id, "generating_tickets", true)?;

    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    channel.send(FrontendStreamEvent::Status {
        message: "Decomposing into tickets...".to_string(),
    }).map_err(|e| e.to_string())?;

    let tickets = planner::decompose_into_tickets(&epic, &specs, &config, &target_dir, channel_callback(channel))
        .await
        .map_err(|e| e.to_string())?;

    let mut ticket_ids = Vec::new();
    for ticket in &tickets {
        state.save_ticket(&target_dir, &epic_id, ticket).map_err(|e| e.to_string())?;
        ticket_ids.push(ticket.id.clone());
    }

    {
        let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        epic.ticket_ids = ticket_ids;
        epic.planning_step = "tickets_review".to_string();
        epic.planning_active = false;
        epic.status = EpicStatus::Decomposing;
        epic.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Approve tickets and advance to phase planning
#[tauri::command]
pub fn approve_tickets(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<Epic, String> {
    set_step(&state, &target_dir, &epic_id, "generating_phases", false)
}

// ─── Step 5: Plan Phases ────────────────────────────────────────────────────

/// Plan phases for all tickets. Updates planning_step to "phases_review"
#[tauri::command]
pub async fn plan_all_phases(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    set_step(&state, &target_dir, &epic_id, "generating_phases", true)?;

    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let tickets = state.list_tickets(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    // Use cached codebase context from scout phase — no need to re-analyze
    let codebase_ctx = epic.codebase_context.as_deref().unwrap_or("");

    let mut total_phases = 0u32;

    if config.planning_detail == crate::types::config::PlanningDetail::Quick {
        // Quick mode: single consolidated prompt for all tickets
        channel.send(FrontendStreamEvent::Status {
            message: "Quick planning: generating consolidated plan...".to_string(),
        }).map_err(|e| e.to_string())?;

        let results = planner::plan_quick(&tickets, &specs, codebase_ctx, &epic.id, &config, &target_dir, channel_callback(channel.clone()))
            .await
            .map_err(|e| e.to_string())?;

        for (ticket_id, phases) in &results {
            let mut phase_ids = Vec::new();
            for phase in phases {
                state.save_phase(&target_dir, &epic_id, ticket_id, phase).map_err(|e| e.to_string())?;
                phase_ids.push(phase.id.clone());
            }
            total_phases += phases.len() as u32;

            let mut t = state.load_ticket(&target_dir, &epic_id, ticket_id).map_err(|e| e.to_string())?;
            t.phase_ids = phase_ids;
            t.status = TicketStatus::Ready;
            t.updated_at = chrono::Utc::now().to_rfc3339();
            state.save_ticket(&target_dir, &epic_id, &t).map_err(|e| e.to_string())?;
        }
    } else {
        // Detailed mode: plan each ticket individually
        for ticket in &tickets {
            channel.send(FrontendStreamEvent::Status {
                message: format!("Planning phases for: {}", ticket.title),
            }).map_err(|e| e.to_string())?;

            let phases = planner::plan_ticket_phases(ticket, &specs, codebase_ctx, &epic.id, &config, &target_dir, channel_callback(channel.clone()))
                .await
                .map_err(|e| e.to_string())?;

            let mut phase_ids = Vec::new();
            for phase in &phases {
                state.save_phase(&target_dir, &epic_id, &ticket.id, phase).map_err(|e| e.to_string())?;
                phase_ids.push(phase.id.clone());
            }
            total_phases += phases.len() as u32;

            // Update ticket
            let mut t = ticket.clone();
            t.phase_ids = phase_ids;
            t.status = TicketStatus::Ready;
            t.updated_at = chrono::Utc::now().to_rfc3339();
            state.save_ticket(&target_dir, &epic_id, &t).map_err(|e| e.to_string())?;
        }
    }

    {
        let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        epic.planning_step = "phases_review".to_string();
        epic.planning_active = false;
        epic.total_estimated_phases = total_phases;
        epic.status = EpicStatus::Planning;
        epic.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Approve phases and mark epic as ready for execution
#[tauri::command]
pub fn approve_phases(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<Epic, String> {
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    epic.planning_step = "ready".to_string();
    epic.planning_active = false;
    epic.status = EpicStatus::Ready;
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    Ok(epic)
}

// ─── Legacy commands (kept for compatibility) ───────────────────────────────

#[tauri::command]
pub async fn capture_intent(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    start_scouting(epic_id, target_dir, state, channel).await
}

#[tauri::command]
pub async fn plan_phases(
    epic_id: String,
    ticket_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let ticket = state.load_ticket(&target_dir, &epic_id, &ticket_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let codebase_ctx = epic.codebase_context.as_deref().unwrap_or("");

    let phases = planner::plan_ticket_phases(&ticket, &specs, codebase_ctx, &epic_id, &config, &target_dir, channel_callback(channel))
        .await
        .map_err(|e| e.to_string())?;

    let mut phase_ids = Vec::new();
    for phase in &phases {
        state.save_phase(&target_dir, &epic_id, &ticket_id, phase).map_err(|e| e.to_string())?;
        phase_ids.push(phase.id.clone());
    }

    let mut t = ticket;
    t.phase_ids = phase_ids;
    t.status = TicketStatus::Ready;
    t.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_ticket(&target_dir, &epic_id, &t).map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Plan Coherency Review ──────────────────────────────────────────────────

/// Review the coherency of plan documents at a given scope.
/// Scope: "specs" (cross-check specs), "tickets" (specs vs tickets), "phases" (tickets vs phases)
/// Optional focus: user-guided area to prioritize in the review.
#[tauri::command]
pub async fn review_plan_coherency(
    epic_id: String,
    target_dir: String,
    scope: String,
    focus: Option<String>,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let tickets = state.list_tickets(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    let engine = crate::claude::prompts::create_template_engine().map_err(|e| e.to_string())?;

    let specs_json: Vec<serde_json::Value> = specs.iter().map(|s| serde_json::json!({
        "spec_type": format!("{:?}", s.spec_type),
        "title": s.title,
        "content": s.content,
    })).collect();

    let tickets_json: Vec<serde_json::Value> = tickets.iter().map(|t| serde_json::json!({
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "acceptance_criteria": t.acceptance_criteria,
        "dependencies": t.dependencies,
        "scope": serde_json::json!({
            "primary_files": t.scope.primary_files,
        }),
    })).collect();

    let prompt = crate::claude::prompts::render_prompt(&engine, "plan_coherency", &serde_json::json!({
        "objective": epic.objective,
        "scope": scope,
        "focus": focus,
        "specs": specs_json,
        "tickets": if scope != "specs" { Some(&tickets_json) } else { None },
        "scope_is_specs": scope == "specs",
        "scope_is_tickets": scope == "tickets",
        "scope_is_phases": scope == "phases",
    })).map_err(|e| e.to_string())?;

    let _ = channel.send(FrontendStreamEvent::Status {
        message: format!("Reviewing plan coherency (scope: {})...", scope),
    });

    let _ = crate::claude::process::run_claude_with_callback(
        crate::claude::process::ClaudeProcessOptions {
            prompt,
            model_id: config.models.verifier.model_id.clone(),
            effort: config.models.verifier.effort.clone(),
            working_dir: target_dir,
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: None,
            streaming: true,
            session_resume: None,
        },
        channel_callback(channel),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Plan Validation Questionnaire ──────────────────────────────────────────

/// Generate a post-planning validation questionnaire.
/// The model produces 8-12 diverse questions covering the entire epic.
#[tauri::command]
pub async fn generate_plan_questionnaire(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<serde_json::Value, String> {
    let config = state.get_config();
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let tickets = state.list_tickets(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    let engine = crate::claude::prompts::create_template_engine().map_err(|e| e.to_string())?;

    let specs_json: Vec<serde_json::Value> = specs.iter().map(|s| serde_json::json!({
        "spec_type": format!("{:?}", s.spec_type),
        "title": s.title,
        "content": &s.content[..s.content.len().min(3000)],
    })).collect();

    let tickets_json: Vec<serde_json::Value> = tickets.iter().map(|t| serde_json::json!({
        "title": t.title,
        "description": &t.description[..t.description.len().min(300)],
    })).collect();

    let prompt = crate::claude::prompts::render_prompt(&engine, "plan_questionnaire", &serde_json::json!({
        "objective": epic.objective,
        "specs": specs_json,
        "tickets": tickets_json,
        "ticket_count": tickets.len(),
    })).map_err(|e| e.to_string())?;

    let _ = channel.send(FrontendStreamEvent::Status {
        message: "Generating validation questions...".to_string(),
    });

    let result = crate::claude::process::run_claude_with_callback(
        crate::claude::process::ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.clone(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(crate::claude::prompts::plan_questionnaire_schema()),
            streaming: true,
            session_resume: None,
        },
        channel_callback(channel),
    )
    .await
    .map_err(|e| e.to_string())?;

    // Update epic step to plan_validation
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    epic.planning_step = "plan_validation".to_string();
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;

    let output = result.structured_output
        .ok_or("No structured output from questionnaire generation")?;
    Ok(output)
}

/// Submit plan validation answers. If all correct, sets step to ready.
#[tauri::command]
pub async fn submit_plan_validation(
    epic_id: String,
    target_dir: String,
    all_correct: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    if all_correct {
        epic.planning_step = "ready".to_string();
        epic.status = EpicStatus::Ready;
    } else {
        // Go back to phases_review so user can make adjustments
        epic.planning_step = "phases_review".to_string();
    }
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    Ok(())
}
