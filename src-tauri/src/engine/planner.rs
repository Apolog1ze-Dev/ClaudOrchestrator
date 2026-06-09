use anyhow::Result;
use serde_json::json;

use crate::types::*;
use crate::claude::process::{run_claude_with_callback, ClaudeProcessOptions, StreamCallback};
use crate::claude::prompts::{
    create_template_engine, render_prompt,
    intent_capture_schema, spec_schema, ticket_decomposition_schema, phase_planning_schema,
};
// Scout is no longer called from planner — cached context is passed as parameter

/// Run the intent capture flow: generate clarifying questions
pub async fn capture_intent(
    epic: &Epic,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<Vec<ClarifyingQA>> {
    let engine = create_template_engine()?;

    // Use cached codebase context from the epic (populated during scouting)
    let codebase_ctx = epic.codebase_context.clone().unwrap_or_default();

    let prompt = render_prompt(&engine, "intent_capture", &json!({
        "objective": epic.objective,
        "codebase_context": codebase_ctx,
        "previous_answers": epic.clarifying_questions,
        "round": epic.clarification_round,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(intent_capture_schema()),
            streaming: true,
            session_resume: None,
        },
        on_event,
    )
    .await?;

    if let Some(output) = result.structured_output {
        if let Some(questions) = output.get("questions").and_then(|q| q.as_array()) {
            let qas: Vec<ClarifyingQA> = questions
                .iter()
                .filter_map(|q| {
                    let options: Vec<QuestionOption> = q.get("options")
                        .and_then(|o| o.as_array())
                        .map(|arr| arr.iter().filter_map(|opt| {
                            // Handle both new format {"label":"..","description":".."} and old format (string)
                            if let Some(obj) = opt.as_object() {
                                // Parse palette array if present
                                let palette: Option<Vec<PaletteColor>> = obj.get("palette")
                                    .and_then(|v| v.as_array())
                                    .map(|arr| arr.iter().filter_map(|c| {
                                        Some(PaletteColor {
                                            name: c.get("name").and_then(|v| v.as_str())?.to_string(),
                                            hex: c.get("hex").and_then(|v| v.as_str())?.to_string(),
                                        })
                                    }).collect());

                                Some(QuestionOption {
                                    label: obj.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    description: obj.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    color: obj.get("color").and_then(|v| v.as_str()).map(String::from),
                                    palette,
                                })
                            } else if let Some(s) = opt.as_str() {
                                Some(QuestionOption { label: s.to_string(), description: String::new(), color: None, palette: None })
                            } else {
                                None
                            }
                        }).collect())
                        .unwrap_or_default();

                    Some(ClarifyingQA {
                        question: q.get("question")?.as_str()?.to_string(),
                        answer: String::new(),
                        asked_at: chrono::Utc::now().to_rfc3339(),
                        context: q.get("context").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        options,
                        multi_select: q.get("multi_select").and_then(|v| v.as_bool()).unwrap_or(false),
                    })
                })
                .collect();
            return Ok(qas);
        }
    }

    Ok(Vec::new())
}

/// Generate a PRD (Product Requirements Document)
pub async fn generate_prd(
    epic: &Epic,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<Spec> {
    let engine = create_template_engine()?;
    // Use cached codebase context from the epic
    let codebase_ctx = epic.codebase_context.clone().unwrap_or_default();

    let prompt = render_prompt(&engine, "spec_prd", &json!({
        "objective": epic.objective,
        "clarifying_answers": epic.clarifying_questions,
        "codebase_context": codebase_ctx,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(spec_schema()),
            streaming: true,
            session_resume: None,
        },
        on_event,
    )
    .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let id = format!("spec_{}", &uuid::Uuid::new_v4().to_string()[..8]);

    let (title, content, diagrams) = if let Some(output) = result.structured_output {
        let title = output.get("title").and_then(|v| v.as_str()).unwrap_or("PRD").to_string();
        let content = output.get("content").and_then(|v| v.as_str()).unwrap_or(&result.result).to_string();
        let diagrams = parse_mermaid_diagrams(&output);
        (title, content, diagrams)
    } else {
        ("PRD".to_string(), result.result, Vec::new())
    };

    Ok(Spec {
        schema_version: SCHEMA_VERSION,
        id,
        epic_id: epic.id.clone(),
        spec_type: SpecType::Prd,
        title,
        content,
        mermaid_diagrams: diagrams,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Generate a Technical Specification
pub async fn generate_tech_spec(
    epic: &Epic,
    prd: &Spec,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<Spec> {
    let engine = create_template_engine()?;
    // Use cached codebase context from the epic
    let codebase_ctx = epic.codebase_context.clone().unwrap_or_default();

    let prompt = render_prompt(&engine, "spec_tech", &json!({
        "objective": epic.objective,
        "prd_content": prd.content,
        "codebase_context": codebase_ctx,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(spec_schema()),
            streaming: true,
            session_resume: None,
        },
        on_event,
    )
    .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let id = format!("spec_{}", &uuid::Uuid::new_v4().to_string()[..8]);

    let (title, content, diagrams) = if let Some(output) = result.structured_output {
        let title = output.get("title").and_then(|v| v.as_str()).unwrap_or("Tech Spec").to_string();
        let content = output.get("content").and_then(|v| v.as_str()).unwrap_or(&result.result).to_string();
        let diagrams = parse_mermaid_diagrams(&output);
        (title, content, diagrams)
    } else {
        ("Technical Specification".to_string(), result.result, Vec::new())
    };

    Ok(Spec {
        schema_version: SCHEMA_VERSION,
        id,
        epic_id: epic.id.clone(),
        spec_type: SpecType::TechSpec,
        title,
        content,
        mermaid_diagrams: diagrams,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Generate a Design Document
pub async fn generate_design_spec(
    epic: &Epic,
    prd: &Spec,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<Spec> {
    let engine = create_template_engine()?;
    let codebase_ctx = epic.codebase_context.clone().unwrap_or_default();

    let prompt = render_prompt(&engine, "spec_design", &json!({
        "objective": epic.objective,
        "prd_content": prd.content,
        "clarifying_answers": epic.clarifying_questions,
        "codebase_context": codebase_ctx,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(spec_schema()),
            streaming: true,
            session_resume: None,
        },
        on_event,
    )
    .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let id = format!("spec_{}", &uuid::Uuid::new_v4().to_string()[..8]);

    let (title, content, diagrams) = if let Some(output) = result.structured_output {
        let title = output.get("title").and_then(|v| v.as_str()).unwrap_or("Design Document").to_string();
        let content = output.get("content").and_then(|v| v.as_str()).unwrap_or(&result.result).to_string();
        let diagrams = parse_mermaid_diagrams(&output);
        (title, content, diagrams)
    } else {
        ("Design Document".to_string(), result.result, Vec::new())
    };

    Ok(Spec {
        schema_version: SCHEMA_VERSION,
        id,
        epic_id: epic.id.clone(),
        spec_type: SpecType::DesignSpec,
        title,
        content,
        mermaid_diagrams: diagrams,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Decompose specs into tickets
pub async fn decompose_into_tickets(
    epic: &Epic,
    specs: &[Spec],
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<Vec<Ticket>> {
    let engine = create_template_engine()?;
    // Use cached codebase context from the epic
    let codebase_ctx = epic.codebase_context.clone().unwrap_or_default();

    let prd_content = specs.iter().find(|s| s.spec_type == SpecType::Prd).map(|s| s.content.as_str()).unwrap_or("");
    let tech_content = specs.iter().find(|s| s.spec_type == SpecType::TechSpec).map(|s| s.content.as_str()).unwrap_or("");

    let prompt = render_prompt(&engine, "decomposer", &json!({
        "objective": epic.objective,
        "prd_content": prd_content,
        "tech_spec_content": tech_content,
        "codebase_context": codebase_ctx,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(ticket_decomposition_schema()),
            streaming: true,
            session_resume: None,
        },
        on_event,
    )
    .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut tickets = Vec::new();

    if let Some(output) = result.structured_output {
        if let Some(ticket_arr) = output.get("tickets").and_then(|t| t.as_array()) {
            for (i, t) in ticket_arr.iter().enumerate() {
                let id = format!("tkt_{}", &uuid::Uuid::new_v4().to_string()[..8]);
                let scope_val = t.get("scope").cloned().unwrap_or(json!({}));

                tickets.push(Ticket {
                    schema_version: SCHEMA_VERSION,
                    id,
                    epic_id: epic.id.clone(),
                    title: t.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    description: t.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    acceptance_criteria: t.get("acceptance_criteria")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default(),
                    status: TicketStatus::Todo,
                    priority: t.get("priority").and_then(|v| v.as_u64()).unwrap_or((i + 1) as u64) as u32,
                    dependencies: t.get("dependencies")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default(),
                    scope: TicketScope {
                        primary_files: json_string_array(&scope_val, "primary_files"),
                        reference_files: json_string_array(&scope_val, "reference_files"),
                        directories: json_string_array(&scope_val, "directories"),
                        technologies: json_string_array(&scope_val, "technologies"),
                    },
                    phase_ids: Vec::new(),
                    estimated_complexity: parse_complexity(t.get("estimated_complexity").and_then(|v| v.as_str()).unwrap_or("medium")),
                    cost_usd: 0.0,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                });
            }
        }
    }

    Ok(tickets)
}

/// Plan implementation phases for a ticket
pub async fn plan_ticket_phases(
    ticket: &Ticket,
    specs: &[Spec],
    codebase_context: &str,
    epic_id: &str,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<Vec<Phase>> {
    let engine = create_template_engine()?;

    // Build spec file references with short summaries instead of embedding full content
    let spec_references: Vec<String> = specs.iter().map(|s| {
        let type_name = match s.spec_type {
            SpecType::Prd => "prd",
            SpecType::TechSpec => "tech-spec",
            SpecType::Architecture => "architecture",
            SpecType::ApiSpec => "api-spec",
            SpecType::DesignSpec => "design-spec",
            SpecType::Custom => "custom",
        };
        let file_path = format!(".claudorchestrator/epics/{}/specs/{}.md", epic_id, type_name);
        let summary: String = s.content.chars().take(500).collect();
        format!("### {} — `{}`\n{}{}", s.title, file_path, summary, if s.content.len() > 500 { "..." } else { "" })
    }).collect();
    let spec_excerpt = spec_references.join("\n\n---\n\n");

    let prompt = render_prompt(&engine, "phase_planner", &json!({
        "ticket_title": ticket.title,
        "ticket_description": ticket.description,
        "acceptance_criteria": ticket.acceptance_criteria,
        "scope": {
            "primary_files": ticket.scope.primary_files,
            "reference_files": ticket.scope.reference_files,
            "technologies": ticket.scope.technologies,
        },
        "spec_excerpt": spec_excerpt,
        "codebase_context": codebase_context,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(phase_planning_schema()),
            streaming: true,
            session_resume: None,
        },
        on_event,
    )
    .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut phases = Vec::new();

    if let Some(output) = result.structured_output {
        if let Some(phase_arr) = output.get("phases").and_then(|p| p.as_array()) {
            for (i, p) in phase_arr.iter().enumerate() {
                let id = format!("phs_{}", &uuid::Uuid::new_v4().to_string()[..8]);

                let steps: Vec<PlanStep> = p.get("steps")
                    .and_then(|s| s.as_array())
                    .map(|arr| arr.iter().filter_map(|s| {
                        Some(PlanStep {
                            order: s.get("order").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                            description: s.get("description").and_then(|v| v.as_str())?.to_string(),
                            file_targets: json_string_array(s, "file_targets"),
                            tool: s.get("tool").and_then(|v| v.as_str()).unwrap_or("Edit").to_string(),
                        })
                    }).collect())
                    .unwrap_or_default();

                let files_to_create: Vec<FileOperation> = parse_file_operations(p, "files_to_create");
                let files_to_modify: Vec<FileOperation> = parse_file_operations(p, "files_to_modify");

                phases.push(Phase {
                    schema_version: SCHEMA_VERSION,
                    id,
                    ticket_id: ticket.id.clone(),
                    epic_id: ticket.epic_id.clone(),
                    order: (i + 1) as u32,
                    title: p.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    description: p.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    plan: PhasePlan {
                        objective: p.get("objective").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        steps,
                        files_to_create,
                        files_to_modify,
                        files_to_delete: json_string_array(p, "files_to_delete"),
                        test_strategy: p.get("test_strategy").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        rollback_strategy: p.get("rollback_strategy").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        context_files: json_string_array(p, "context_files"),
                        reasoning: p.get("reasoning").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        mermaid_diagram: p.get("mermaid_diagram").and_then(|v| v.as_str()).map(String::from),
                        reference_docs: json_string_array(p, "reference_docs"),
                    },
                    status: PhaseStatus::Planned,
                    execution: None,
                    verification: None,
                    remediation_attempts: 0,
                    max_remediation_attempts: config.execution.max_remediation_attempts,
                    cost_usd: 0.0,
                    duration_ms: 0,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                });
            }
        }
    }

    Ok(phases)
}

/// Quick planning: consolidate all tickets into a single planning prompt
/// Produces fewer, coarser phases grouped by logical dependency
pub async fn plan_quick(
    tickets: &[Ticket],
    specs: &[Spec],
    codebase_context: &str,
    epic_id: &str,
    config: &AppConfig,
    target_dir: &str,
    on_event: StreamCallback,
) -> Result<Vec<(String, Vec<Phase>)>> {
    let engine = create_template_engine()?;

    // Build spec references
    let spec_references: Vec<String> = specs.iter().map(|s| {
        let type_name = match s.spec_type {
            SpecType::Prd => "prd",
            SpecType::TechSpec => "tech-spec",
            SpecType::Architecture => "architecture",
            SpecType::ApiSpec => "api-spec",
            SpecType::DesignSpec => "design-spec",
            SpecType::Custom => "custom",
        };
        format!("- **{}**: `.claudorchestrator/epics/{}/specs/{}.md`", s.title, epic_id, type_name)
    }).collect();

    // Build ticket summaries
    let ticket_summaries: Vec<serde_json::Value> = tickets.iter().map(|t| {
        json!({
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "acceptance_criteria": t.acceptance_criteria,
            "primary_files": t.scope.primary_files,
        })
    }).collect();

    let prompt = render_prompt(&engine, "quick_planner", &json!({
        "tickets": ticket_summaries,
        "spec_references": spec_references.join("\n"),
        "codebase_context": codebase_context,
    }))?;

    let result = run_claude_with_callback(
        ClaudeProcessOptions {
            prompt,
            model_id: config.models.orchestrator.model_id.clone(),
            effort: config.models.orchestrator.effort.clone(),
            working_dir: target_dir.to_string(),
            system_prompt: None,
            allowed_tools: Some(vec!["none".to_string()]),
            json_schema: Some(phase_planning_schema()),
            streaming: true,
            session_resume: None,
        },
        on_event,
    )
    .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let mut results: Vec<(String, Vec<Phase>)> = Vec::new();

    // For quick mode, assign all phases to the first ticket or distribute evenly
    if let Some(output) = result.structured_output {
        if let Some(phase_arr) = output.get("phases").and_then(|p| p.as_array()) {
            let mut phases_per_ticket: std::collections::HashMap<String, Vec<Phase>> = std::collections::HashMap::new();

            for (i, p) in phase_arr.iter().enumerate() {
                // Try to match phase to a ticket by checking its target files
                let ticket_id = p.get("ticket_id")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_else(|| {
                        // Distribute round-robin if no ticket_id
                        tickets.get(i % tickets.len()).map(|t| t.id.clone()).unwrap_or_default()
                    });

                let id = format!("phs_{}", &uuid::Uuid::new_v4().to_string()[..8]);
                let steps: Vec<PlanStep> = p.get("steps")
                    .and_then(|s| s.as_array())
                    .map(|arr| arr.iter().filter_map(|s| {
                        Some(PlanStep {
                            order: s.get("order").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                            description: s.get("description").and_then(|v| v.as_str())?.to_string(),
                            file_targets: json_string_array(s, "file_targets"),
                            tool: s.get("tool").and_then(|v| v.as_str()).unwrap_or("Edit").to_string(),
                        })
                    }).collect())
                    .unwrap_or_default();

                let epic_id_str = tickets.first().map(|t| t.epic_id.clone()).unwrap_or_default();

                let phase = Phase {
                    schema_version: SCHEMA_VERSION,
                    id,
                    ticket_id: ticket_id.clone(),
                    epic_id: epic_id_str,
                    order: (phases_per_ticket.entry(ticket_id.clone()).or_default().len() + 1) as u32,
                    title: p.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    description: p.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    plan: PhasePlan {
                        objective: p.get("objective").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        steps,
                        files_to_create: parse_file_operations(p, "files_to_create"),
                        files_to_modify: parse_file_operations(p, "files_to_modify"),
                        files_to_delete: json_string_array(p, "files_to_delete"),
                        test_strategy: p.get("test_strategy").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        rollback_strategy: p.get("rollback_strategy").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        context_files: json_string_array(p, "context_files"),
                        reasoning: p.get("reasoning").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        mermaid_diagram: p.get("mermaid_diagram").and_then(|v| v.as_str()).map(String::from),
                        reference_docs: json_string_array(p, "reference_docs"),
                    },
                    status: PhaseStatus::Planned,
                    execution: None,
                    verification: None,
                    remediation_attempts: 0,
                    max_remediation_attempts: config.execution.max_remediation_attempts,
                    cost_usd: 0.0,
                    duration_ms: 0,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };

                phases_per_ticket.entry(ticket_id).or_default().push(phase);
            }

            for ticket in tickets {
                if let Some(phases) = phases_per_ticket.remove(&ticket.id) {
                    results.push((ticket.id.clone(), phases));
                }
            }
        }
    }

    Ok(results)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn json_string_array(val: &serde_json::Value, key: &str) -> Vec<String> {
    val.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

fn parse_complexity(s: &str) -> Complexity {
    match s.to_lowercase().as_str() {
        "trivial" => Complexity::Trivial,
        "small" => Complexity::Small,
        "medium" => Complexity::Medium,
        "large" => Complexity::Large,
        "epic" => Complexity::Epic,
        _ => Complexity::Medium,
    }
}

fn parse_file_operations(val: &serde_json::Value, key: &str) -> Vec<FileOperation> {
    val.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|f| {
                    Some(FileOperation {
                        path: f.get("path").and_then(|v| v.as_str())?.to_string(),
                        description: f.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        references: json_string_array(f, "references"),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_mermaid_diagrams(output: &serde_json::Value) -> Vec<MermaidDiagram> {
    output.get("mermaid_diagrams")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|d| {
                    Some(MermaidDiagram {
                        id: format!("diag_{}", &uuid::Uuid::new_v4().to_string()[..8]),
                        title: d.get("title").and_then(|v| v.as_str())?.to_string(),
                        diagram_type: d.get("diagram_type").and_then(|v| v.as_str()).unwrap_or("flowchart").to_string(),
                        content: d.get("content").and_then(|v| v.as_str())?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
