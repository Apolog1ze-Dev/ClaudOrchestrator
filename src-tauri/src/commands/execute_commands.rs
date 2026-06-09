use crate::storage::AppState;
use crate::types::*;
use crate::engine::{executor, verifier, remediator};

fn channel_callback(
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> crate::claude::process::StreamCallback {
    Box::new(move |event| {
        let _ = channel.send(event);
        Ok(())
    })
}

#[tauri::command]
pub async fn execute_phase(
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

    phase.status = PhaseStatus::Executing;
    phase.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_phase(&target_dir, &epic_id, &ticket_id, &phase)
        .map_err(|e| e.to_string())?;

    let execution = executor::execute_phase_streaming(
        &phase, &config, &target_dir, channel_callback(channel.clone()),
    )
    .await
    .map_err(|e| e.to_string())?;

    phase.execution = Some(execution.clone());
    phase.cost_usd = execution.cost_usd;
    phase.status = match execution.result {
        ExecutionResult::Success => PhaseStatus::Verifying,
        _ => PhaseStatus::Failed,
    };
    phase.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_phase(&target_dir, &epic_id, &ticket_id, &phase)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn execute_ticket(
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
        if phase.status == PhaseStatus::Planned {
            execute_phase(
                epic_id.clone(), ticket_id.clone(), phase.id.clone(),
                target_dir.clone(), state.clone(), channel.clone(),
            ).await?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn execute_epic(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    for ticket_id in &epic.ticket_ids {
        execute_ticket(
            epic_id.clone(), ticket_id.clone(),
            target_dir.clone(), state.clone(), channel.clone(),
        ).await?;
    }
    Ok(())
}

/// Graceful stop — let the current phase finish, then stop before the next one.
/// The user can resume later by calling run_supervised_epic again (it skips passed phases).
#[tauri::command]
pub async fn stop_execution(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.execution_controller.request_stop();
    Ok(())
}

/// Hard cancel — kills the running Claude process immediately.
#[tauri::command]
pub async fn cancel_execution(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.execution_controller.request_cancel();
    // Also set the global flag for backward compat with planner calls
    crate::claude::process::request_cancel();
    // Clear any pending approval requests
    state.approval_manager.clear_all();
    Ok(())
}

/// Respond to a command approval request (supervised mode)
#[tauri::command]
pub async fn respond_to_approval(
    request_id: String,
    approved: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.approval_manager.respond(&request_id, approved).map_err(|e| e.to_string())
}

/// Respond to a review gate during supervised execution.
#[tauri::command]
pub async fn respond_to_review_gate(
    request_id: String,
    decision: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    use crate::engine::review_gate::ReviewDecision;
    let decision = match decision.as_str() {
        "accept" => ReviewDecision::Accept,
        "retry" => ReviewDecision::Retry,
        "skip" => ReviewDecision::Skip,
        "reject" => ReviewDecision::Reject,
        _ => return Err(format!("Invalid review decision: {}", decision)),
    };
    state.review_gate_manager.respond(&request_id, decision).map_err(|e| e.to_string())
}

/// Review work done in a specific phase for coherency and consistency.
/// Uses the VERIFIER model (not executor) to provide an independent review.
#[tauri::command]
pub async fn review_phase_work(
    epic_id: String,
    ticket_id: String,
    phase_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    let phase = state.load_phase(&target_dir, &epic_id, &ticket_id, &phase_id)
        .map_err(|e| e.to_string())?;
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    // Load specs for context
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let spec_excerpt = specs.iter().map(|s| s.content.as_str()).collect::<Vec<_>>().join("\n\n---\n\n");

    // Load completed phases for context
    let all_phases = state.list_phases(&target_dir, &epic_id, &ticket_id).map_err(|e| e.to_string())?;
    let completed_phases: Vec<serde_json::Value> = all_phases.iter()
        .filter(|p| p.status == PhaseStatus::Passed && p.id != phase_id)
        .map(|p| serde_json::json!({
            "title": p.title,
            "status": "passed",
            "description": p.description,
        }))
        .collect();

    // Get git diff for the phase
    let git_diff = {
        use tokio::process::Command;
        let output = Command::new("git")
            .args(["diff", "HEAD"])
            .current_dir(&target_dir)
            .output()
            .await
            .map_err(|e| e.to_string())?;
        String::from_utf8_lossy(&output.stdout).to_string()
    };

    channel.send(FrontendStreamEvent::Status {
        message: format!("Reviewing phase: {} (using verifier model)", phase.title),
    }).map_err(|e| e.to_string())?;

    let engine = crate::claude::prompts::create_template_engine().map_err(|e| e.to_string())?;
    let prompt = crate::claude::prompts::render_prompt(&engine, "phase_review", &serde_json::json!({
        "objective": epic.objective,
        "spec_excerpt": spec_excerpt,
        "phase_title": phase.title,
        "phase_objective": phase.plan.objective,
        "git_diff": git_diff,
        "completed_phases": completed_phases,
    })).map_err(|e| e.to_string())?;

    let _result = crate::claude::process::run_claude_with_callback(
        crate::claude::process::ClaudeProcessOptions {
            prompt,
            model_id: config.models.verifier.model_id.clone(),
            effort: config.models.verifier.effort.clone(),
            working_dir: target_dir,
            system_prompt: None,
            allowed_tools: Some(vec!["Read".to_string(), "Glob".to_string(), "Grep".to_string()]),
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

/// Re-execute a single phase, then re-verify it.
/// Used when a phase failed and the user wants to retry just that phase.
#[tauri::command]
pub async fn retry_phase(
    epic_id: String,
    ticket_id: String,
    phase_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();

    // Reset phase state
    let mut phase = state.load_phase(&target_dir, &epic_id, &ticket_id, &phase_id)
        .map_err(|e| e.to_string())?;
    phase.status = PhaseStatus::Executing;
    phase.verification = None;
    phase.updated_at = chrono::Utc::now().to_rfc3339();
    state.save_phase(&target_dir, &epic_id, &ticket_id, &phase)
        .map_err(|e| e.to_string())?;

    let _ = channel.send(FrontendStreamEvent::Status {
        message: format!("Retrying phase: {}", phase.title),
    });

    // Execute
    let exec_result = executor::execute_phase_streaming(
        &phase, &config, &target_dir, channel_callback(channel.clone()),
    ).await;

    let execution = match exec_result {
        Ok(e) => e,
        Err(e) => {
            phase.status = PhaseStatus::Failed;
            phase.updated_at = chrono::Utc::now().to_rfc3339();
            let _ = state.save_phase(&target_dir, &epic_id, &ticket_id, &phase);
            return Err(format!("Execution failed: {}", e));
        }
    };

    phase.execution = Some(execution.clone());
    phase.cost_usd += execution.cost_usd;

    // Verify
    let ticket = state.load_ticket(&target_dir, &epic_id, &ticket_id)
        .map_err(|e| e.to_string())?;
    let specs = state.list_specs(&target_dir, &epic_id).map_err(|e| e.to_string())?;
    let spec_excerpt = specs.iter().map(|s| s.content.as_str()).collect::<Vec<_>>().join("\n\n---\n\n");

    let _ = channel.send(FrontendStreamEvent::Status {
        message: format!("Verifying: {}", phase.title),
    });

    let verification = verifier::verify_phase(
        &phase, &ticket.acceptance_criteria, &spec_excerpt,
        &config, &target_dir, &state.approval_manager, &channel,
    ).await.map_err(|e| e.to_string())?;

    let passed = verification.status == VerificationStatus::Passed;
    phase.verification = Some(verification.clone());
    phase.status = if passed { PhaseStatus::Passed } else { PhaseStatus::Failed };
    phase.updated_at = chrono::Utc::now().to_rfc3339();

    state.save_phase(&target_dir, &epic_id, &ticket_id, &phase)
        .map_err(|e| e.to_string())?;
    state.save_verification(&target_dir, &epic_id, &ticket_id, &phase_id, &verification)
        .map_err(|e| e.to_string())?;

    let _ = channel.send(FrontendStreamEvent::PhaseCompleted {
        phase_id: phase.id.clone(),
        status: if passed { "passed".to_string() } else { "failed".to_string() },
        score: verification.overall_score,
        cost_usd: execution.cost_usd,
    });

    Ok(())
}

/// Supervised execution: runs all tickets/phases with automatic verification and remediation.
/// Streams orchestration events (PhaseStarted, PhaseCompleted, VerificationResult, etc.)
/// alongside the raw AI output.
#[tauri::command]
pub async fn run_supervised_epic(
    epic_id: String,
    target_dir: String,
    state: tauri::State<'_, AppState>,
    channel: tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<(), String> {
    let config = state.get_config();
    let epic = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;

    // Execute dependencies before dependents; ties keep priority order.
    let tickets = order_by_dependencies(
        state.list_tickets(&target_dir, &epic_id).map_err(|e| e.to_string())?,
    );
    let total_tickets = tickets.len() as u32;

    // Clear execution controller flags before starting
    state.execution_controller.clear();

    // Update epic status
    {
        let mut e = epic.clone();
        e.status = EpicStatus::Executing;
        e.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &e).map_err(|e| e.to_string())?;
    }

    let mut stopped_by_user = false;

    for (ti, ticket) in tickets.iter().enumerate() {
        // Emit TicketStarted
        let _ = channel.send(FrontendStreamEvent::TicketStarted {
            ticket_id: ticket.id.clone(),
            ticket_title: ticket.title.clone(),
            ticket_order: (ti + 1) as u32,
            total_tickets,
        });

        let phases = state
            .list_phases(&target_dir, &epic_id, &ticket.id)
            .map_err(|e| e.to_string())?;
        let total_phases = phases.len() as u32;

        let mut ticket_passed = true;

        'phases: for phase in &phases {
            if phase.status == PhaseStatus::Passed {
                continue 'phases; // Already done
            }

            // ─── Check if user requested stop ───
            if state.execution_controller.should_stop_after_phase() || state.execution_controller.is_cancelled() {
                let reason = if state.execution_controller.is_cancelled() { "cancelled" } else { "user_stopped" };
                let _ = channel.send(FrontendStreamEvent::ExecutionStopped {
                    reason: reason.to_string(),
                    last_completed_phase_id: None,
                });
                stopped_by_user = true;
                break 'phases;
            }

            // ─── Phase Start ───
            let _ = channel.send(FrontendStreamEvent::PhaseStarted {
                phase_id: phase.id.clone(),
                phase_title: phase.title.clone(),
                ticket_id: ticket.id.clone(),
                ticket_title: ticket.title.clone(),
                phase_order: phase.order,
                total_phases,
            });

            // ─── Supervised mode: request approval before executing phase ───
            if config.execution.trust_mode == crate::types::config::TrustMode::Supervised {
                let request_id = format!("exec-{}", phase.id);
                let command_desc = format!(
                    "Execute phase: {}\nClaude will use Write/Edit/Bash tools to modify files and run commands in your project.",
                    phase.title
                );
                let approved = state.approval_manager.request_approval(
                    &request_id,
                    &command_desc,
                    "phase_execution",
                    &phase.id,
                    &channel,
                ).await;

                if !approved {
                    let _ = channel.send(FrontendStreamEvent::Status {
                        message: format!("Phase '{}' skipped by user", phase.title),
                    });
                    let _ = channel.send(FrontendStreamEvent::PhaseCompleted {
                        phase_id: phase.id.clone(),
                        status: "skipped".to_string(),
                        score: 0,
                        cost_usd: 0.0,
                    });
                    continue 'phases;
                }
            }

            // ─── Execute (re-enters on review-gate Retry) ───
            let mut current_phase = phase.clone();
            let mut final_passed;
            'attempt: loop {

            let _ = channel.send(FrontendStreamEvent::Status {
                message: format!("Executing: {}", phase.title),
            });

            current_phase.status = PhaseStatus::Executing;
            current_phase.updated_at = chrono::Utc::now().to_rfc3339();
            state.save_phase(&target_dir, &epic_id, &ticket.id, &current_phase)
                .map_err(|e| e.to_string())?;

            let exec_result = executor::execute_phase_streaming(
                &current_phase, &config, &target_dir, channel_callback(channel.clone()),
            )
            .await;

            let execution = match exec_result {
                Ok(e) => e,
                Err(e) => {
                    let _ = channel.send(FrontendStreamEvent::Error {
                        message: format!("Execution failed: {}", e),
                    });
                    let _ = channel.send(FrontendStreamEvent::PhaseCompleted {
                        phase_id: phase.id.clone(),
                        status: "failed".to_string(),
                        score: 0,
                        cost_usd: 0.0,
                    });
                    // Persist the failure and halt the ticket — later phases
                    // build on this one, so continuing compounds the failure.
                    current_phase.status = PhaseStatus::Failed;
                    current_phase.updated_at = chrono::Utc::now().to_rfc3339();
                    let _ = state.save_phase(&target_dir, &epic_id, &ticket.id, &current_phase);
                    ticket_passed = false;
                    break 'phases;
                }
            };

            current_phase.execution = Some(execution.clone());
            current_phase.cost_usd += execution.cost_usd;

            // ─── Verify ───
            let _ = channel.send(FrontendStreamEvent::Status {
                message: format!("Verifying: {}", phase.title),
            });

            let spec_excerpt = {
                let specs = state.list_specs(&target_dir, &epic_id).unwrap_or_default();
                specs.iter().map(|s| s.content.as_str()).collect::<Vec<_>>().join("\n\n---\n\n")
            };

            let verification = verifier::verify_phase(
                &current_phase,
                &ticket.acceptance_criteria,
                &spec_excerpt,
                &config,
                &target_dir,
                &state.approval_manager,
                &channel,
            )
            .await
            .map_err(|e| e.to_string())?;

            let passed = verification.status == VerificationStatus::Passed;
            let score = verification.overall_score;

            // Emit verification result
            let _ = channel.send(FrontendStreamEvent::VerificationResult {
                phase_id: phase.id.clone(),
                score,
                passed,
                summary: verification.reasoning.clone(),
                checks: verification.checks.iter().map(|c| {
                    format!("{}: {} {}", c.name, if c.skipped { "SKIPPED" } else if c.passed { "PASS" } else { "FAIL" }, c.details)
                }).collect(),
            });

            current_phase.verification = Some(verification.clone());

            // ─── Review Gate (if enabled) ───
            if config.execution.review_gate_enabled {
                use crate::engine::review_gate::ReviewDecision;

                let gate_id = format!("review-gate-{}", phase.id);
                let check_summaries: Vec<String> = current_phase.verification.as_ref()
                    .map(|v| v.checks.iter().map(|c| format!("{}: {} - {}", c.name, if c.skipped { "SKIPPED" } else if c.passed { "PASS" } else { "FAIL" }, c.details)).collect())
                    .unwrap_or_default();
                let fixes: Vec<String> = current_phase.verification.as_ref()
                    .map(|v| v.suggested_fixes.clone())
                    .unwrap_or_default();

                let decision = state.review_gate_manager.request_review(
                    &gate_id,
                    &phase.id,
                    &phase.title,
                    current_phase.verification.as_ref().map(|v| v.overall_score).unwrap_or(0),
                    if passed { "passed" } else { "failed" },
                    &check_summaries,
                    &fixes,
                    &channel,
                ).await;

                match decision {
                    ReviewDecision::Accept => { /* continue normal flow */ }
                    ReviewDecision::Skip => {
                        current_phase.status = PhaseStatus::Passed;
                        current_phase.updated_at = chrono::Utc::now().to_rfc3339();
                        state.save_phase(&target_dir, &epic_id, &ticket.id, &current_phase)
                            .map_err(|e| e.to_string())?;
                        let _ = channel.send(FrontendStreamEvent::PhaseCompleted {
                            phase_id: phase.id.clone(),
                            status: "skipped".to_string(),
                            score: 0,
                            cost_usd: current_phase.cost_usd,
                        });
                        continue 'phases;
                    }
                    ReviewDecision::Reject => {
                        stopped_by_user = true;
                        let _ = channel.send(FrontendStreamEvent::ExecutionStopped {
                            reason: "user_rejected".to_string(),
                            last_completed_phase_id: Some(phase.id.clone()),
                        });
                        break 'phases;
                    }
                    ReviewDecision::Retry => {
                        // Re-run the phase now; each retry is an explicit
                        // user decision at the gate, so no attempt cap.
                        let _ = channel.send(FrontendStreamEvent::Status {
                            message: format!("Re-running phase '{}' at user request", phase.title),
                        });
                        continue 'attempt;
                    }
                }
            }

            // ─── Remediate if needed ───
            final_passed = passed;
            if !passed && config.execution.auto_remediate {
                let max_attempts = config.execution.max_remediation_attempts;
                for attempt in 1..=max_attempts {
                    // ─── Supervised mode: request approval before remediation ───
                    if config.execution.trust_mode == crate::types::config::TrustMode::Supervised {
                        let req_id = format!("remediate-{}-{}", phase.id, attempt);
                        let approved = state.approval_manager.request_approval(
                            &req_id,
                            &format!("Remediation attempt {}/{} for phase: {}\nThis will use Claude to fix issues found during verification.", attempt, max_attempts, phase.title),
                            "remediation",
                            &phase.id,
                            &channel,
                        ).await;
                        if !approved {
                            break; // User declined remediation, leave phase as failed
                        }
                    }

                    let _ = channel.send(FrontendStreamEvent::RemediationStarted {
                        phase_id: phase.id.clone(),
                        attempt,
                        max_attempts,
                    });

                    let rem_verification = match current_phase.verification.clone() {
                        Some(v) => v,
                        None => break, // no verification recorded — nothing to remediate against
                    };
                    let rem_result = remediator::remediate(
                        &current_phase,
                        &rem_verification,
                        &config,
                        &target_dir,
                        channel_callback(channel.clone()),
                    )
                    .await;

                    if let Ok(rem_exec) = rem_result {
                        current_phase.execution = Some(rem_exec);
                        current_phase.remediation_attempts = attempt;

                        // Re-verify
                        let re_verification = verifier::verify_phase(
                            &current_phase,
                            &ticket.acceptance_criteria,
                            &spec_excerpt,
                            &config,
                            &target_dir,
                            &state.approval_manager,
                            &channel,
                        )
                        .await
                        .map_err(|e| e.to_string())?;

                        let re_passed = re_verification.status == VerificationStatus::Passed;
                        let _ = channel.send(FrontendStreamEvent::VerificationResult {
                            phase_id: phase.id.clone(),
                            score: re_verification.overall_score,
                            passed: re_passed,
                            summary: re_verification.reasoning.clone(),
                            checks: re_verification.checks.iter().map(|c| {
                                format!("{}: {} {}", c.name, if c.skipped { "SKIPPED" } else if c.passed { "PASS" } else { "FAIL" }, c.details)
                            }).collect(),
                        });

                        current_phase.verification = Some(re_verification);

                        if re_passed {
                            final_passed = true;
                            break;
                        }
                    } else {
                        break; // Remediation itself failed
                    }
                }
            }

            break 'attempt;
            } // end 'attempt

            // ─── Save final phase state ───
            current_phase.status = if final_passed { PhaseStatus::Passed } else { PhaseStatus::Failed };
            current_phase.updated_at = chrono::Utc::now().to_rfc3339();
            state.save_phase(&target_dir, &epic_id, &ticket.id, &current_phase)
                .map_err(|e| e.to_string())?;
            if let Some(ref verification) = current_phase.verification {
                state.save_verification(
                    &target_dir, &epic_id, &ticket.id, &phase.id,
                    verification,
                ).map_err(|e| e.to_string())?;
            }

            let _ = channel.send(FrontendStreamEvent::PhaseCompleted {
                phase_id: phase.id.clone(),
                status: if final_passed { "passed".to_string() } else { "failed".to_string() },
                score: current_phase.verification.as_ref().map(|v| v.overall_score).unwrap_or(0),
                cost_usd: current_phase.cost_usd,
            });

            if !final_passed {
                // Halt the ticket: subsequent phases depend on this one.
                ticket_passed = false;
                let _ = channel.send(FrontendStreamEvent::Status {
                    message: format!(
                        "Ticket '{}' halted: phase '{}' did not pass — remaining phases were not run",
                        ticket.title, phase.title
                    ),
                });
                break 'phases;
            }
        }

        // Update ticket status
        {
            let mut t = ticket.clone();
            t.status = if ticket_passed { TicketStatus::Done } else { TicketStatus::Failed };
            t.updated_at = chrono::Utc::now().to_rfc3339();
            state.save_ticket(&target_dir, &epic_id, &t).map_err(|e| e.to_string())?;
        }

        let _ = channel.send(FrontendStreamEvent::TicketCompleted {
            ticket_id: ticket.id.clone(),
            status: if ticket_passed { "done".to_string() } else { "failed".to_string() },
        });

        // Break outer loop if stopped by user
        if stopped_by_user {
            break;
        }
    }

    // Update epic status
    {
        let mut e = state.load_epic(&target_dir, &epic_id).map_err(|e| e.to_string())?;
        if stopped_by_user {
            e.status = EpicStatus::Paused;
        } else {
            // Check if all tickets passed by reloading from disk
            let fresh_tickets = state.list_tickets(&target_dir, &epic_id).unwrap_or_default();
            let all_done = fresh_tickets.iter().all(|t| t.status == TicketStatus::Done);
            e.status = if all_done { EpicStatus::Completed } else { EpicStatus::Failed };
        }
        e.updated_at = chrono::Utc::now().to_rfc3339();
        state.save_epic(&target_dir, &e).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Order tickets so dependencies execute before dependents. Stable within a
/// "ready" wave, so ties keep the storage layer's priority order. Tickets in
/// a dependency cycle (or depending on unknown ids in a cycle-like way) are
/// appended in their original order rather than dropped.
fn order_by_dependencies(tickets: Vec<Ticket>) -> Vec<Ticket> {
    use std::collections::HashSet;

    let known_ids: HashSet<String> = tickets.iter().map(|t| t.id.clone()).collect();
    let mut ordered: Vec<Ticket> = Vec::with_capacity(tickets.len());
    let mut placed: HashSet<String> = HashSet::new();
    let mut remaining = tickets;

    while !remaining.is_empty() {
        let (ready, rest): (Vec<Ticket>, Vec<Ticket>) = remaining.into_iter().partition(|t| {
            t.dependencies
                .iter()
                .all(|dep| placed.contains(dep) || !known_ids.contains(dep))
        });

        if ready.is_empty() {
            // Cycle: nothing can be placed — fall back to original order.
            ordered.extend(rest);
            break;
        }

        for t in ready {
            placed.insert(t.id.clone());
            ordered.push(t);
        }
        remaining = rest;
    }

    ordered
}
