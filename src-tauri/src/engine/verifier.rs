use anyhow::Result;
use serde_json::json;

use crate::types::*;
use crate::claude::process::{run_claude, ClaudeProcessOptions};
use crate::claude::prompts::{create_template_engine, render_prompt, verification_schema};

/// Run the verification pipeline for a phase.
/// In supervised mode, each shell command is gated by user approval via the ApprovalManager.
pub async fn verify_phase(
    phase: &Phase,
    acceptance_criteria: &[String],
    spec_excerpt: &str,
    config: &AppConfig,
    target_dir: &str,
    approval_manager: &crate::engine::approval::ApprovalManager,
    channel: &tauri::ipc::Channel<FrontendStreamEvent>,
) -> Result<PhaseVerification> {
    let mut checks = Vec::new();
    let supervised = config.execution.trust_mode == crate::types::config::TrustMode::Supervised;

    // 1. Run automated checks if configured
    if config.verification.run_tests {
        let cmd = &config.verification.test_command;
        let (passed, details, skipped) = if supervised {
            let req_id = format!("verify-{}-tests", phase.id);
            let approved = approval_manager.request_approval(
                &req_id, cmd, "verification", &phase.id, channel,
            ).await;
            if approved {
                let (p, d) = run_command_check(cmd, target_dir).await;
                (p, d, false)
            } else {
                (false, "Skipped by user (approval denied)".to_string(), true)
            }
        } else {
            let (p, d) = run_command_check(cmd, target_dir).await;
            (p, d, false)
        };
        checks.push(VerificationCheck {
            name: "Tests".to_string(),
            check_type: CheckType::Test,
            passed,
            details,
            severity: if passed || skipped { Severity::Info } else { Severity::Error },
            skipped,
        });
    }

    if config.verification.run_lint {
        let cmd = &config.verification.lint_command;
        let (passed, details, skipped) = if supervised {
            let req_id = format!("verify-{}-lint", phase.id);
            let approved = approval_manager.request_approval(
                &req_id, cmd, "verification", &phase.id, channel,
            ).await;
            if approved {
                let (p, d) = run_command_check(cmd, target_dir).await;
                (p, d, false)
            } else {
                (false, "Skipped by user (approval denied)".to_string(), true)
            }
        } else {
            let (p, d) = run_command_check(cmd, target_dir).await;
            (p, d, false)
        };
        checks.push(VerificationCheck {
            name: "Linting".to_string(),
            check_type: CheckType::Lint,
            passed,
            details,
            severity: if passed || skipped { Severity::Info } else { Severity::Warning },
            skipped,
        });
    }

    if config.verification.run_typecheck {
        let cmd = &config.verification.typecheck_command;
        let (passed, details, skipped) = if supervised {
            let req_id = format!("verify-{}-typecheck", phase.id);
            let approved = approval_manager.request_approval(
                &req_id, cmd, "verification", &phase.id, channel,
            ).await;
            if approved {
                let (p, d) = run_command_check(cmd, target_dir).await;
                (p, d, false)
            } else {
                (false, "Skipped by user (approval denied)".to_string(), true)
            }
        } else {
            let (p, d) = run_command_check(cmd, target_dir).await;
            (p, d, false)
        };
        checks.push(VerificationCheck {
            name: "Type Check".to_string(),
            check_type: CheckType::Typecheck,
            passed,
            details,
            severity: if passed || skipped { Severity::Info } else { Severity::Error },
            skipped,
        });
    }

    // 2. AI-powered diff review
    if config.verification.diff_review {
        let git_diff = get_git_diff(target_dir).await.unwrap_or_default();

        if !git_diff.is_empty() {
            let engine = create_template_engine()?;
            let prompt = render_prompt(&engine, "verifier", &json!({
                "phase_title": phase.title,
                "phase_objective": phase.plan.objective,
                "acceptance_criteria": acceptance_criteria,
                "git_diff": git_diff,
                "spec_excerpt": spec_excerpt,
            }))?;

            let result = run_claude(ClaudeProcessOptions {
                prompt,
                model_id: config.models.verifier.model_id.clone(),
            effort: config.models.verifier.effort.clone(),
                working_dir: target_dir.to_string(),
                system_prompt: None,
                allowed_tools: None,
                json_schema: Some(verification_schema()),
                streaming: false,
                session_resume: None,
            })
            .await?;

            if let Some(output) = result.structured_output {
                // Parse AI verification results
                if let Some(ai_checks) = output.get("checks").and_then(|c| c.as_array()) {
                    for check in ai_checks {
                        checks.push(VerificationCheck {
                            name: check.get("name").and_then(|v| v.as_str()).unwrap_or("AI Check").to_string(),
                            check_type: parse_check_type(check.get("check_type").and_then(|v| v.as_str()).unwrap_or("diff_review")),
                            passed: check.get("passed").and_then(|v| v.as_bool()).unwrap_or(false),
                            details: check.get("details").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            severity: parse_severity(check.get("severity").and_then(|v| v.as_str()).unwrap_or("info")),
                            skipped: false,
                        });
                    }
                }

                let overall_score = output.get("overall_score").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let reasoning = output.get("reasoning").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let suggested_fixes = output.get("suggested_fixes")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();

                let status = if overall_score >= config.verification.minimum_score {
                    VerificationStatus::Passed
                } else if checks.iter().any(|c| c.passed) {
                    VerificationStatus::Partial
                } else {
                    VerificationStatus::Failed
                };

                return Ok(PhaseVerification {
                    status,
                    checks,
                    overall_score,
                    reasoning,
                    suggested_fixes,
                    verified_at: chrono::Utc::now().to_rfc3339(),
                });
            }
        }
    }

    // Fallback: calculate score from automated checks only.
    // Skipped checks (user declined approval) are excluded from the
    // denominator — declining a check must never count as passing it.
    let skipped_count = checks.iter().filter(|c| c.skipped).count();
    let total = checks.iter().filter(|c| !c.skipped).count() as u32;
    let passed = checks.iter().filter(|c| !c.skipped && c.passed).count() as u32;
    let overall_score = if total > 0 { (passed * 100) / total } else { 100 };

    let status = if overall_score >= config.verification.minimum_score {
        VerificationStatus::Passed
    } else {
        VerificationStatus::Failed
    };

    let reasoning = if skipped_count > 0 {
        format!(
            "{}/{} checks passed ({} skipped by user and not counted)",
            passed, total, skipped_count
        )
    } else {
        format!("{}/{} checks passed", passed, total)
    };

    Ok(PhaseVerification {
        status,
        checks,
        overall_score,
        reasoning,
        suggested_fixes: Vec::new(),
        verified_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Run a shell command and return (passed, output).
/// Routes through the platform shell (cmd /C on Windows, sh -c on Unix)
/// so that the user's PATH is available even when the app is launched from desktop.
async fn run_command_check(command: &str, working_dir: &str) -> (bool, String) {
    use tokio::process::Command;

    let trimmed = command.trim();
    if trimmed.is_empty() {
        return (true, "No command configured".to_string());
    }

    // Route through the platform shell to get full PATH resolution
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd")
        .args(["/C", trimmed])
        .current_dir(working_dir)
        .output()
        .await;

    #[cfg(not(target_os = "windows"))]
    let result = Command::new("sh")
        .args(["-c", trimmed])
        .current_dir(working_dir)
        .output()
        .await;

    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{}{}", stdout, stderr);
            (output.status.success(), combined.chars().take(2000).collect())
        }
        Err(e) => (false, format!("Failed to run command: {}", e)),
    }
}

/// Get the current git diff, routed through platform shell
async fn get_git_diff(working_dir: &str) -> Result<String> {
    use tokio::process::Command;

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd")
        .args(["/C", "git diff HEAD"])
        .current_dir(working_dir)
        .output()
        .await?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh")
        .args(["-c", "git diff HEAD"])
        .current_dir(working_dir)
        .output()
        .await?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_check_type(s: &str) -> CheckType {
    match s {
        "spec_compliance" => CheckType::SpecCompliance,
        "test" => CheckType::Test,
        "lint" => CheckType::Lint,
        "typecheck" => CheckType::Typecheck,
        "diff_review" => CheckType::DiffReview,
        "acceptance_criteria" => CheckType::AcceptanceCriteria,
        _ => CheckType::DiffReview,
    }
}

fn parse_severity(s: &str) -> Severity {
    match s {
        "error" => Severity::Error,
        "warning" => Severity::Warning,
        _ => Severity::Info,
    }
}
