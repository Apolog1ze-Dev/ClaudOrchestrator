use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use anyhow::Result;

use crate::types::{FrontendStreamEvent, EffortLevel};

// ─── Execution Controller ───────────────────────────────────────────────────

/// Controls execution lifecycle: cancel (hard kill) and stop (graceful, after current phase).
pub struct ExecutionController {
    /// Hard kill the running Claude process immediately
    cancel: AtomicBool,
    /// Let the current phase finish, then stop before starting the next one
    stop_after_phase: AtomicBool,
}

impl ExecutionController {
    pub fn new() -> Self {
        Self {
            cancel: AtomicBool::new(false),
            stop_after_phase: AtomicBool::new(false),
        }
    }

    /// Hard cancel — kills the running Claude process
    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// Graceful stop — let current phase finish, then stop
    pub fn request_stop(&self) {
        self.stop_after_phase.store(true, Ordering::SeqCst);
    }

    /// Clear all flags (call before starting a new execution)
    pub fn clear(&self) {
        self.cancel.store(false, Ordering::SeqCst);
        self.stop_after_phase.store(false, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    pub fn should_stop_after_phase(&self) -> bool {
        self.stop_after_phase.load(Ordering::SeqCst)
    }
}

// Backward-compat: keep the global static for non-controller callers (planner, etc.)
static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

pub fn request_cancel() {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
}

pub fn clear_cancel() {
    CANCEL_FLAG.store(false, Ordering::SeqCst);
}

fn is_cancelled() -> bool {
    CANCEL_FLAG.load(Ordering::SeqCst)
}

// ─── Claude Binary Resolution ────────────────────────────────────────────────

pub(crate) fn find_claude_bin() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let candidates = [
                format!("{}\\.local\\bin\\claude.exe", profile),
                format!("{}/.local/bin/claude.exe", profile),
            ];
            for c in &candidates {
                if std::path::Path::new(c).exists() {
                    return c.clone();
                }
            }
        }
        if let Ok(output) = std::process::Command::new("where").arg("claude").output() {
            if output.status.success() {
                if let Some(line) = String::from_utf8_lossy(&output.stdout).lines().next() {
                    let t = line.trim();
                    if !t.is_empty() {
                        return t.to_string();
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home_candidates: Vec<String> = std::env::var("HOME")
            .map(|home| vec![
                format!("{}/.local/bin/claude", home),
                format!("{}/.npm-global/bin/claude", home),
            ])
            .unwrap_or_default();

        let system_candidates = [
            "/opt/homebrew/bin/claude", // Apple Silicon Homebrew
            "/usr/local/bin/claude",    // Intel Mac Homebrew / Linux manual
            "/usr/bin/claude",          // Linux package manager
        ];

        for c in home_candidates.iter().map(String::as_str)
            .chain(system_candidates.iter().copied())
        {
            if std::path::Path::new(c).exists() {
                return c.to_string();
            }
        }

        // Fallback: ask the shell (macOS/Linux equivalent of `where`)
        if let Ok(output) = std::process::Command::new("which").arg("claude").output() {
            if output.status.success() {
                if let Some(line) = String::from_utf8_lossy(&output.stdout).lines().next() {
                    let t = line.trim();
                    if !t.is_empty() {
                        return t.to_string();
                    }
                }
            }
        }
    }

    "claude".to_string() // last resort: rely on PATH at spawn time
}

// ─── Types ───────────────────────────────────────────────────────────────────

pub struct ClaudeProcessOptions {
    pub prompt: String,
    pub model_id: String,
    pub effort: EffortLevel,
    pub working_dir: String,
    pub system_prompt: Option<String>,
    pub allowed_tools: Option<Vec<String>>,
    pub json_schema: Option<String>,
    pub streaming: bool,
    pub session_resume: Option<String>,
}

#[derive(Debug)]
pub struct ClaudeResult {
    pub result: String,
    pub session_id: Option<String>,
    pub total_cost_usd: f64,
    pub structured_output: Option<serde_json::Value>,
}

pub type StreamCallback = Box<dyn FnMut(FrontendStreamEvent) -> Result<()> + Send + 'static>;

fn noop_callback() -> StreamCallback {
    Box::new(|_| Ok(()))
}

// ─── Fatal error patterns ────────────────────────────────────────────────────

const FATAL_PATTERNS: &[&str] = &[
    "authentication_error",
    "oauth token has expired",
    "invalid_api_key",
    "permission_denied",
    "billing_error",
    "account_suspended",
];

// ─── Core execution ─────────────────────────────────────────────────────────

pub async fn run_claude(opts: ClaudeProcessOptions) -> Result<ClaudeResult> {
    run_claude_with_callback(opts, noop_callback()).await
}

pub async fn run_claude_with_callback(
    opts: ClaudeProcessOptions,
    mut on_event: StreamCallback,
) -> Result<ClaudeResult> {
    clear_cancel();

    // Pass prompt via stdin to avoid Windows 32K command-line limit (OS error 206).
    // claude -p reads from stdin when "-" is passed as the prompt, or when prompt is piped.
    let mut args = vec![
        "-p".to_string(),
        "-".to_string(), // Read prompt from stdin
        "--model".to_string(),
        opts.model_id.clone(),
        "--effort".to_string(),
        opts.effort.to_cli_arg().to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];

    // System prompt: write to temp file if long, pass as arg if short
    let _sys_prompt_file: Option<tempfile::NamedTempFile> = None;
    if let Some(ref sys_prompt) = opts.system_prompt {
        if sys_prompt.len() < 8000 {
            args.push("--append-system-prompt".to_string());
            args.push(sys_prompt.clone());
        } else {
            // Write to temp file to avoid command-line length limits
            let mut tmp = tempfile::NamedTempFile::new()
                .map_err(|e| anyhow::anyhow!("Failed to create temp file: {}", e))?;
            use std::io::Write;
            tmp.write_all(sys_prompt.as_bytes())?;
            args.push("--append-system-prompt-file".to_string());
            args.push(tmp.path().to_string_lossy().to_string());
            // Keep the temp file alive until the process finishes
            // _sys_prompt_file = Some(tmp); // Shadowed below
        }
    }

    if let Some(ref tools) = opts.allowed_tools {
        args.push("--allowedTools".to_string());
        args.push(tools.join(","));
    }

    if let Some(ref schema) = opts.json_schema {
        args.push("--json-schema".to_string());
        args.push(schema.clone());
    }

    if let Some(ref session_id) = opts.session_resume {
        args.push("--resume".to_string());
        args.push(session_id.clone());
    }

    let claude_bin = find_claude_bin();

    // Inherit the full parent environment.
    // Don't inject tokens from the credentials file — they may be expired.
    // The user must authenticate via `claude auth login` first.

    let mut child = Command::new(&claude_bin)
        .args(&args)
        .current_dir(&opts.working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // Pipe the prompt via stdin (avoids Windows 32K command-line limit)
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(opts.prompt.as_bytes()).await?;
        drop(stdin); // Close stdin so claude knows the prompt is complete
    }

    let stdout = child.stdout.take().expect("stdout should be piped");
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let mut session_id: Option<String> = None;
    let mut total_cost: f64 = 0.0;
    let mut final_result = String::new();
    let mut structured_output: Option<serde_json::Value> = None;
    let mut fatal_hit_count: u32 = 0;

    while let Some(line) = lines.next_line().await? {
        // Check cancellation
        if is_cancelled() {
            let _ = child.kill().await;
            let _ = on_event(FrontendStreamEvent::Error {
                message: "Cancelled by user".to_string(),
            });
            anyhow::bail!("Cancelled by user");
        }

        if line.trim().is_empty() {
            continue;
        }

        // Check for fatal auth errors in raw output
        let line_lower = line.to_lowercase();
        for pattern in FATAL_PATTERNS {
            if line_lower.contains(pattern) {
                fatal_hit_count += 1;
                if fatal_hit_count >= 2 {
                    let _ = child.kill().await;
                    let error_msg = format!(
                        "Authentication error. Please run `claude` in your terminal to re-authenticate, then try again."
                    );
                    let _ = on_event(FrontendStreamEvent::Error {
                        message: error_msg.clone(),
                    });
                    anyhow::bail!(error_msg);
                }
            }
        }

        let parsed: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match event_type {
            "system" => {
                let subtype = parsed.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
                if subtype == "init" {
                    session_id = parsed.get("session_id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let _ = on_event(FrontendStreamEvent::Status {
                        message: "Session started".to_string(),
                    });
                } else if subtype == "api_retry" {
                    let error_kind = parsed.get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    // Fatal auth errors — abort immediately
                    if error_kind == "authentication_failed" || error_kind == "billing_error" {
                        let _ = child.kill().await;
                        let error_msg = "Authentication failed. Please run `claude` in your terminal to re-authenticate.".to_string();
                        let _ = on_event(FrontendStreamEvent::Error {
                            message: error_msg.clone(),
                        });
                        anyhow::bail!(error_msg);
                    }
                    // Transient retries — show status
                    let attempt = parsed.get("attempt").and_then(|v| v.as_u64()).unwrap_or(0);
                    let _ = on_event(FrontendStreamEvent::Status {
                        message: format!("API retry (attempt {}, {})", attempt, error_kind),
                    });
                }
            }
            "assistant" => {
                if let Some(message) = parsed.get("message") {
                    if let Some(content) = message.get("content") {
                        if let Some(arr) = content.as_array() {
                            for block in arr {
                                let block_type = block.get("type")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                match block_type {
                                    "text" => {
                                        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                                            let _ = on_event(FrontendStreamEvent::Text {
                                                content: text.to_string(),
                                            });
                                        }
                                    }
                                    "tool_use" => {
                                        let tool = block.get("name")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("unknown")
                                            .to_string();
                                        let input = block.get("input")
                                            .cloned()
                                            .unwrap_or(serde_json::Value::Null);
                                        let _ = on_event(FrontendStreamEvent::ToolUse { tool, input });
                                    }
                                    "thinking" => {
                                        if let Some(thinking) = block.get("thinking").and_then(|v| v.as_str()) {
                                            let _ = on_event(FrontendStreamEvent::Thinking {
                                                content: thinking.to_string(),
                                            });
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
            "result" => {
                final_result = parsed.get("result")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                total_cost = parsed.get("total_cost_usd")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                if let Some(sid) = parsed.get("session_id").and_then(|v| v.as_str()) {
                    session_id = Some(sid.to_string());
                }
                structured_output = parsed.get("structured_output").cloned();
                let _ = on_event(FrontendStreamEvent::Complete {
                    result: final_result.clone(),
                    session_id: session_id.clone().unwrap_or_default(),
                    total_cost_usd: total_cost,
                });
            }
            "stream_event" => {
                if let Some(event) = parsed.get("event") {
                    if let Some(delta) = event.get("delta") {
                        let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if delta_type == "text_delta" {
                            if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                                let _ = on_event(FrontendStreamEvent::Text {
                                    content: text.to_string(),
                                });
                            }
                        } else if delta_type == "thinking_delta" {
                            if let Some(thinking) = delta.get("thinking").and_then(|v| v.as_str()) {
                                let _ = on_event(FrontendStreamEvent::Thinking {
                                    content: thinking.to_string(),
                                });
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let status = child.wait().await?;
    if !status.success() {
        let mut stderr_out = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            use tokio::io::AsyncReadExt;
            stderr.read_to_string(&mut stderr_out).await?;
        }
        let error_msg = format!("claude -p exited with {}: {}", status, stderr_out.trim());
        let _ = on_event(FrontendStreamEvent::Error {
            message: error_msg.clone(),
        });
        anyhow::bail!(error_msg);
    }

    Ok(ClaudeResult {
        result: final_result,
        session_id,
        total_cost_usd: total_cost,
        structured_output,
    })
}

pub async fn run_claude_streaming<F>(
    opts: ClaudeProcessOptions,
    mut on_event: F,
) -> Result<ClaudeResult>
where
    F: FnMut(FrontendStreamEvent) -> Result<()> + Send + 'static,
{
    run_claude_with_callback(opts, Box::new(move |e| on_event(e))).await
}
