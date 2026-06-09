use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;
use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::types::FrontendStreamEvent;

/// Decisions the user can make at a review gate.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewDecision {
    Accept,   // Continue to next phase
    Retry,    // Re-execute this phase
    Skip,     // Mark as skipped, continue
    Reject,   // Stop execution entirely
}

/// Manages per-phase review gates during supervised execution.
/// When review_gate_enabled is true, after each phase's verification,
/// execution pauses and waits for the user to review results and choose
/// Accept/Retry/Skip/Reject.
pub struct ReviewGateManager {
    pending: Mutex<HashMap<String, oneshot::Sender<ReviewDecision>>>,
}

impl ReviewGateManager {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    /// Send a review gate event to the frontend, then block until
    /// the user responds with a ReviewDecision.
    pub async fn request_review(
        &self,
        request_id: &str,
        phase_id: &str,
        phase_title: &str,
        score: u32,
        status: &str,
        checks: &[String],
        suggested_fixes: &[String],
        channel: &tauri::ipc::Channel<FrontendStreamEvent>,
    ) -> ReviewDecision {
        let (tx, rx) = oneshot::channel();

        self.pending
            .lock()
            .unwrap()
            .insert(request_id.to_string(), tx);

        let _ = channel.send(FrontendStreamEvent::PhaseReviewReady {
            request_id: request_id.to_string(),
            phase_id: phase_id.to_string(),
            phase_title: phase_title.to_string(),
            score,
            status: status.to_string(),
            checks: checks.to_vec(),
            suggested_fixes: suggested_fixes.to_vec(),
        });

        rx.await.unwrap_or(ReviewDecision::Accept)
    }

    /// Respond to a pending review gate request.
    pub fn respond(&self, request_id: &str, decision: ReviewDecision) -> Result<()> {
        let sender = self
            .pending
            .lock()
            .unwrap()
            .remove(request_id)
            .ok_or_else(|| anyhow::anyhow!("No pending review gate with ID: {}", request_id))?;

        sender
            .send(decision)
            .map_err(|_| anyhow::anyhow!("Review gate channel closed"))?;

        Ok(())
    }

    /// Clear all pending review gates (e.g., on cancel).
    pub fn clear_all(&self) {
        self.pending.lock().unwrap().clear();
    }
}
