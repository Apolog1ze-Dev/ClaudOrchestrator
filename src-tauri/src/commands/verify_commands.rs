use crate::storage::AppState;
use crate::types::FrontendStreamEvent;
use crate::engine::verifier;

#[tauri::command]
pub async fn verify_phase(
    epic_id: String,
    ticket_id: String,
    phase_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    let mut phase = state
        .load_phase(&target_dir, &epic_id, &ticket_id, &phase_id)
        .map_err(|e| e.to_string())?;

    // Load ticket for acceptance criteria
    let ticket = state
        .load_ticket(&target_dir, &epic_id, &ticket_id)
        .map_err(|e| e.to_string())?;

    // Load relevant specs
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let spec_excerpt = if let Some(spec_id) = epic.spec_ids.first() {
        state.load_spec(&target_dir, &epic_id, spec_id)
            .map(|s| s.content)
            .unwrap_or_default()
    } else {
        String::new()
    };

    channel.send(FrontendStreamEvent::Status {
        message: format!("Verifying phase: {}", phase.title),
    }).map_err(|e| e.to_string())?;

    let verification = verifier::verify_phase(
        &phase,
        &ticket.acceptance_criteria,
        &spec_excerpt,
        &config,
        &target_dir,
        &state.approval_manager,
        &channel,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Update phase with verification
    let passed = verification.status == crate::types::VerificationStatus::Passed;
    phase.verification = Some(verification.clone());
    phase.status = if passed {
        crate::types::PhaseStatus::Passed
    } else {
        crate::types::PhaseStatus::Failed
    };
    phase.updated_at = chrono::Utc::now().to_rfc3339();

    state.save_phase(&target_dir, &epic_id, &ticket_id, &phase)
        .map_err(|e| e.to_string())?;
    state.save_verification(&target_dir, &epic_id, &ticket_id, &phase_id, &verification)
        .map_err(|e| e.to_string())?;

    channel.send(FrontendStreamEvent::Status {
        message: format!(
            "Verification {}: score {}/100",
            if passed { "passed" } else { "failed" },
            verification.overall_score
        ),
    }).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn verify_ticket(
    epic_id: String,
    ticket_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let phases = state
        .list_phases(&target_dir, &epic_id, &ticket_id)
        .map_err(|e| e.to_string())?;

    for phase in phases {
        if phase.status == crate::types::PhaseStatus::Verifying {
            verify_phase(
                epic_id.clone(),
                ticket_id.clone(),
                phase.id.clone(),
                target_dir.clone(),
                state.clone(),
                channel.clone(),
            )
            .await?;
        }
    }

    Ok(())
}
