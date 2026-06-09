use crate::storage::usage::{read_usage_summary, UsageSummary};

/// Aggregate the workspace usage ledger (`.claudorchestrator/usage.jsonl`)
/// for the budget display: month/today/total spend and per-task breakdown.
#[tauri::command]
pub fn get_usage_summary(target_dir: String) -> Result<UsageSummary, String> {
    Ok(read_usage_summary(&target_dir))
}
