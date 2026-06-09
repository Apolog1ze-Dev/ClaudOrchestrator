use std::collections::HashMap;
use serde::Serialize;
use crate::storage::AppState;
use crate::types::*;

// ─── Full epic data structure for frontend ───────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct EpicFull {
    pub epic: Epic,
    pub specs: Vec<Spec>,
    pub tickets: Vec<Ticket>,
    /// Map from ticket_id to its phases
    pub phases_by_ticket: HashMap<String, Vec<Phase>>,
}

// ─── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn create_epic(
    state: tauri::State<'_, AppState>,
    objective: String,
    target_dir: String,
    model_config: ModelConfig,
) -> Result<Epic, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = format!("epic_{}", &uuid::Uuid::new_v4().to_string()[..8]);

    let epic = Epic {
        schema_version: crate::types::epic::SCHEMA_VERSION,
        id: id.clone(),
        title: String::new(),
        objective,
        status: EpicStatus::Draft,
        planning_step: "draft".to_string(),
        clarifying_questions: Vec::new(),
        spec_ids: Vec::new(),
        ticket_ids: Vec::new(),
        model_config,
        created_at: now.clone(),
        updated_at: now,
        target_dir: target_dir.clone(),
        total_estimated_phases: 0,
        completed_phases: 0,
        total_cost_usd: 0.0,
        codebase_context: None,
        planning_active: false,
        clarification_round: 1,
    };

    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    Ok(epic)
}

#[tauri::command]
pub fn get_epic(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    target_dir: String,
) -> Result<Epic, String> {
    state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_epics(
    state: tauri::State<'_, AppState>,
    target_dir: String,
) -> Result<Vec<Epic>, String> {
    state.list_epics(&target_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_epic_status(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    target_dir: String,
    status: EpicStatus,
) -> Result<Epic, String> {
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    epic.status = status;
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    Ok(epic)
}

#[tauri::command]
pub fn delete_epic(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    target_dir: String,
) -> Result<(), String> {
    state.delete_epic(&target_dir, &epic_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_epic(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    target_dir: String,
    new_title: String,
) -> Result<Epic, String> {
    let mut epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    epic.title = new_title;
    epic.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_epic(&target_dir, &epic).map_err(|e| e.to_string())?;
    Ok(epic)
}

/// Load an epic with ALL its data: specs, tickets, and phases per ticket
#[tauri::command]
pub fn load_epic_full(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    target_dir: String,
) -> Result<EpicFull, String> {
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let tickets = state.list_tickets(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    let mut phases_by_ticket = HashMap::new();
    for ticket in &tickets {
        let phases = state
            .list_phases(&target_dir, &epic_id, &ticket.id)
            .map_err(|e| e.to_string())?;
        phases_by_ticket.insert(ticket.id.clone(), phases);
    }

    Ok(EpicFull {
        epic,
        specs,
        tickets,
        phases_by_ticket,
    })
}

#[tauri::command]
pub fn load_tickets_for_epic(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    target_dir: String,
) -> Result<Vec<Ticket>, String> {
    state.list_tickets(&target_dir, &epic_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_phases_for_ticket(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    ticket_id: String,
    target_dir: String,
) -> Result<Vec<Phase>, String> {
    state.list_phases(&target_dir, &epic_id, &ticket_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_specs_for_epic(
    state: tauri::State<'_, AppState>,
    epic_id: String,
    target_dir: String,
) -> Result<Vec<Spec>, String> {
    state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())
}
