use std::io::Write;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

use super::fs_helpers::{ensure_dir, get_orchestrator_dir};

/// Identifies what a model call was for, so spend can be attributed.
#[derive(Debug, Clone)]
pub struct UsageContext {
    pub task: String,
    pub epic_id: Option<String>,
}

impl UsageContext {
    pub fn new(task: &str, epic_id: Option<String>) -> Self {
        Self {
            task: task.to_string(),
            epic_id,
        }
    }
}

/// One line in the append-only usage ledger (`.claudorchestrator/usage.jsonl`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRecord {
    /// RFC3339 UTC timestamp of completion
    pub ts: String,
    /// Task label, e.g. "executor", "clarify", "spec_prd"
    pub task: String,
    #[serde(default)]
    pub epic_id: Option<String>,
    pub model: String,
    pub effort: String,
    /// Cost as reported by the call itself (CLI result event or provider
    /// usage block). Local providers record a real 0.0.
    pub cost_usd: f64,
    pub duration_ms: u64,
    #[serde(default)]
    pub session_id: Option<String>,
    /// Real prompt tokens reported by the call
    #[serde(default)]
    pub tokens_in: u64,
    /// Real completion tokens reported by the call
    #[serde(default)]
    pub tokens_out: u64,
    /// Where cost_usd came from: "cli" | "provider" | "free_local" |
    /// "tokens_only" (no price reported — tokens are still real)
    #[serde(default = "default_cost_source")]
    pub cost_source: String,
}

fn default_cost_source() -> String {
    "cli".to_string()
}

pub fn usage_ledger_path(working_dir: &str) -> PathBuf {
    get_orchestrator_dir(working_dir).join("usage.jsonl")
}

/// Append a usage record to the workspace ledger. Failures are logged and
/// swallowed — the ledger must never be able to break a model run.
pub fn append_usage(working_dir: &str, record: &UsageRecord) {
    let path = usage_ledger_path(working_dir);
    let result = (|| -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            ensure_dir(parent)?;
        }
        let line = serde_json::to_string(record)?;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        writeln!(file, "{}", line)?;
        Ok(())
    })();
    if let Err(e) = result {
        eprintln!("[usage] Failed to append usage record at {}: {}", path.display(), e);
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskSpend {
    pub task: String,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UsageSummary {
    /// Calendar month the month figures cover, e.g. "2026-06" (UTC)
    pub month: String,
    pub month_usd: f64,
    pub today_usd: f64,
    pub total_usd: f64,
    /// This month's spend per task, highest first
    pub by_task_month: Vec<TaskSpend>,
    pub record_count: u64,
    /// Real token totals for the month (all backends)
    pub month_tokens_in: u64,
    pub month_tokens_out: u64,
}

/// Read and aggregate the workspace ledger. Unparseable lines (e.g. a torn
/// final line from a crash mid-append) are skipped.
pub fn read_usage_summary(working_dir: &str) -> UsageSummary {
    let now = chrono::Utc::now();
    let month_prefix = now.format("%Y-%m").to_string();
    let day_prefix = now.format("%Y-%m-%d").to_string();

    let mut summary = UsageSummary {
        month: month_prefix.clone(),
        month_usd: 0.0,
        today_usd: 0.0,
        total_usd: 0.0,
        by_task_month: Vec::new(),
        record_count: 0,
        month_tokens_in: 0,
        month_tokens_out: 0,
    };

    let content = match std::fs::read_to_string(usage_ledger_path(working_dir)) {
        Ok(c) => c,
        Err(_) => return summary, // no ledger yet
    };

    let mut by_task: std::collections::HashMap<String, f64> = Default::default();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let record: UsageRecord = match serde_json::from_str(line) {
            Ok(r) => r,
            Err(_) => continue,
        };
        summary.record_count += 1;
        summary.total_usd += record.cost_usd;
        if record.ts.starts_with(&month_prefix) {
            summary.month_usd += record.cost_usd;
            summary.month_tokens_in += record.tokens_in;
            summary.month_tokens_out += record.tokens_out;
            *by_task.entry(record.task.clone()).or_insert(0.0) += record.cost_usd;
            if record.ts.starts_with(&day_prefix) {
                summary.today_usd += record.cost_usd;
            }
        }
    }

    let mut by_task_month: Vec<TaskSpend> = by_task
        .into_iter()
        .map(|(task, cost_usd)| TaskSpend { task, cost_usd })
        .collect();
    by_task_month.sort_by(|a, b| {
        b.cost_usd
            .partial_cmp(&a.cost_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    summary.by_task_month = by_task_month;

    summary
}
