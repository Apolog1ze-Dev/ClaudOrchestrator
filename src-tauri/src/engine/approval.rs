use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;
use anyhow::Result;

use crate::types::FrontendStreamEvent;

/// Manages pending command approval requests.
/// In supervised mode, the backend sends an approval request to the frontend
/// and waits for the user's response via a oneshot channel.
pub struct ApprovalManager {
    pending: Mutex<HashMap<String, oneshot::Sender<bool>>>,
}

impl ApprovalManager {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    /// Request approval from the user for a command.
    /// Sends an ApprovalRequest event to the frontend, then blocks until the user responds.
    /// Returns `true` if approved, `false` if denied.
    pub async fn request_approval(
        &self,
        request_id: &str,
        command: &str,
        context: &str,
        phase_id: &str,
        channel: &tauri::ipc::Channel<FrontendStreamEvent>,
    ) -> bool {
        let (tx, rx) = oneshot::channel();

        // Store the sender
        self.pending
            .lock()
            .unwrap()
            .insert(request_id.to_string(), tx);

        // Emit approval request to the frontend
        let _ = channel.send(FrontendStreamEvent::ApprovalRequest {
            request_id: request_id.to_string(),
            command: command.to_string(),
            context: context.to_string(),
            phase_id: phase_id.to_string(),
        });

        // Wait for the user's response
        rx.await.unwrap_or(false)
    }

    /// Respond to a pending approval request.
    /// Called by the `respond_to_approval` Tauri command.
    pub fn respond(&self, request_id: &str, approved: bool) -> Result<()> {
        let sender = self
            .pending
            .lock()
            .unwrap()
            .remove(request_id)
            .ok_or_else(|| anyhow::anyhow!("No pending approval request with ID: {}", request_id))?;

        sender
            .send(approved)
            .map_err(|_| anyhow::anyhow!("Approval channel closed"))?;

        Ok(())
    }

    /// Clear all pending requests (e.g., on execution cancel)
    pub fn clear_all(&self) {
        self.pending.lock().unwrap().clear();
    }
}
