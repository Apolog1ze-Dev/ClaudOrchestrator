use crate::handoff::{
    self, BundleSummary, ExternalPhaseStatus, TargetAvailability,
};
use crate::storage::AppState;
use crate::types::{Phase, Ticket};

/// Load tickets (dependency-ordered) paired with their ordered phases.
fn tickets_with_phases(
    state: &AppState,
    target_dir: &str,
    epic_id: &str,
) -> Result<Vec<(Ticket, Vec<Phase>)>, String> {
    let tickets = super::execute_commands::order_by_dependencies(
        state.list_tickets(target_dir, epic_id).map_err(|e| e.to_string())?,
    );
    let mut result = Vec::with_capacity(tickets.len());
    for ticket in tickets {
        let phases = state
            .list_phases(target_dir, epic_id, &ticket.id)
            .map_err(|e| e.to_string())?;
        result.push((ticket, phases));
    }
    Ok(result)
}

/// Write the full hand-off bundle (docs/plan + AGENTS.md + Claude command)
/// into the target project.
#[tauri::command]
pub fn generate_handoff_bundle(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<BundleSummary, String> {
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let twp = tickets_with_phases(&state, &target_dir, &epic_id)?;
    handoff::generate_bundle(&epic, &specs, &twp, &target_dir).map_err(|e| e.to_string())
}

/// Which external tools are installed on this machine.
#[tauri::command]
pub fn detect_handoff_targets() -> Vec<TargetAvailability> {
    handoff::detect_targets()
}

/// Open the chosen tool on the project directory.
#[tauri::command]
pub fn launch_handoff_target(target: String, target_dir: String) -> Result<(), String> {
    handoff::launch_target(&target, &target_dir).map_err(|e| e.to_string())
}

/// Build a self-contained prompt for one phase (frontend copies to clipboard).
#[tauri::command]
pub fn build_handoff_phase_prompt(
    epic_id: String,
    ticket_id: String,
    phase_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let twp = tickets_with_phases(&state, &target_dir, &epic_id)?;
    for (ti, (ticket, phases)) in twp.iter().enumerate() {
        if ticket.id != ticket_id {
            continue;
        }
        if let Some(phase) = phases.iter().find(|p| p.id == phase_id) {
            return Ok(handoff::build_phase_prompt(&epic, ticket, phase, ti + 1));
        }
    }
    Err(format!("Phase {} not found in ticket {}", phase_id, ticket_id))
}

/// Read external completion signals (status.json + Plan-Phase git trailers)
/// and report which phases were finished outside the app.
#[tauri::command]
pub fn sync_handoff_status(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ExternalPhaseStatus>, String> {
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let twp = tickets_with_phases(&state, &target_dir, &epic_id)?;
    handoff::sync_status(&epic, &twp, &target_dir).map_err(|e| e.to_string())
}
