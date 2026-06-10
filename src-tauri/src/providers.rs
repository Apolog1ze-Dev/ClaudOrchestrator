//! BYO model providers over the OpenAI-compatible chat-completions protocol.
//!
//! One client covers OpenAI, OpenRouter, and local engines (Ollama,
//! LM Studio) plus any custom base URL — they all speak the same protocol.
//! Claude subscription calls stay on the CLI backend; only tool-free
//! prompt→text/JSON calls are eligible for provider routing.
//!
//! Cost policy (budget v2): we record only REAL data from each call —
//! the provider-reported cost when the API returns one (OpenRouter), the
//! actual token usage every compatible API returns, and a hard $0.00 for
//! local engines. No price-table estimation.

use std::sync::RwLock;
use anyhow::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use crate::claude::process::{ClaudeProcessOptions, ClaudeResult, StreamCallback};
use crate::storage::usage::{append_usage, UsageRecord};
use crate::types::FrontendStreamEvent;

const KEYRING_SERVICE: &str = "claudorchestrator";

// ─── Profiles ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderProfile {
    pub id: String,
    pub label: String,
    /// Base URL up to (not including) /chat/completions
    pub base_url: String,
    /// Whether this provider needs an API key (local engines do not)
    pub requires_key: bool,
    /// Local engines are hard-$0 — real, not estimated
    #[serde(default)]
    pub local: bool,
    /// Anthropic-compatible endpoint (serves /v1/messages). When set, this
    /// provider can power AGENT roles too: the Claude CLI keeps the tool
    /// harness while ANTHROPIC_BASE_URL points inference here. Ollama ships
    /// this natively; proxies (LiteLLM, claude-code-router) can provide it
    /// for anything else.
    #[serde(default)]
    pub anthropic_base_url: Option<String>,
}

pub fn default_provider_profiles() -> Vec<ProviderProfile> {
    vec![
        ProviderProfile {
            id: "openai".into(),
            label: "OpenAI".into(),
            base_url: "https://api.openai.com/v1".into(),
            requires_key: true,
            local: false,
            anthropic_base_url: None,
        },
        ProviderProfile {
            id: "openrouter".into(),
            label: "OpenRouter".into(),
            base_url: "https://openrouter.ai/api/v1".into(),
            requires_key: true,
            local: false,
            anthropic_base_url: None,
        },
        ProviderProfile {
            id: "ollama".into(),
            label: "Ollama (local)".into(),
            base_url: "http://localhost:11434/v1".into(),
            requires_key: false,
            local: true,
            anthropic_base_url: Some("http://localhost:11434".into()),
        },
        ProviderProfile {
            id: "lmstudio".into(),
            label: "LM Studio (local)".into(),
            base_url: "http://localhost:1234/v1".into(),
            requires_key: false,
            local: true,
            anthropic_base_url: None,
        },
        ProviderProfile {
            id: "custom".into(),
            label: "Custom (OpenAI-compatible)".into(),
            base_url: "http://localhost:8080/v1".into(),
            requires_key: false,
            local: true,
            anthropic_base_url: None,
        },
    ]
}

// Runtime profile registry: config load/save pushes the user's (possibly
// edited) profiles here so the dispatch path needs no AppState access.
static RUNTIME_PROFILES: RwLock<Option<Vec<ProviderProfile>>> = RwLock::new(None);

pub fn set_runtime_profiles(profiles: &[ProviderProfile]) {
    *RUNTIME_PROFILES.write().unwrap() = Some(profiles.to_vec());
}

pub fn resolve_profile(id: &str) -> Option<ProviderProfile> {
    if let Some(profiles) = RUNTIME_PROFILES.read().unwrap().as_ref() {
        if let Some(p) = profiles.iter().find(|p| p.id == id) {
            return Some(p.clone());
        }
    }
    default_provider_profiles().into_iter().find(|p| p.id == id)
}

// ─── API keys (OS keychain — never in config files) ─────────────────────────

fn key_entry(provider_id: &str) -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(
        KEYRING_SERVICE,
        &format!("provider:{}", provider_id),
    )?)
}

pub fn set_api_key(provider_id: &str, key: &str) -> Result<()> {
    let entry = key_entry(provider_id)?;
    if key.trim().is_empty() {
        let _ = entry.delete_credential();
    } else {
        entry.set_password(key.trim())?;
    }
    Ok(())
}

pub fn get_api_key(provider_id: &str) -> Option<String> {
    key_entry(provider_id).ok()?.get_password().ok()
}

pub fn has_api_key(provider_id: &str) -> bool {
    get_api_key(provider_id).is_some()
}

// ─── Chat completions (streaming SSE) ────────────────────────────────────────

/// Strip ```json fences some models wrap structured output in.
fn strip_code_fences(s: &str) -> &str {
    let t = s.trim();
    if let Some(rest) = t.strip_prefix("```json").or_else(|| t.strip_prefix("```")) {
        if let Some(inner) = rest.strip_suffix("```") {
            return inner.trim();
        }
    }
    t
}

pub async fn run_chat(
    provider_id: &str,
    opts: &ClaudeProcessOptions,
    mut on_event: StreamCallback,
) -> Result<ClaudeResult> {
    let profile = resolve_profile(provider_id)
        .ok_or_else(|| anyhow::anyhow!("Unknown provider profile: {}", provider_id))?;

    let api_key = get_api_key(provider_id);
    if profile.requires_key && api_key.is_none() {
        anyhow::bail!(
            "Provider '{}' needs an API key — set it in Settings → Providers",
            profile.label
        );
    }

    let started = std::time::Instant::now();

    // Build messages
    let mut messages: Vec<serde_json::Value> = Vec::new();
    if let Some(ref sys) = opts.system_prompt {
        messages.push(serde_json::json!({ "role": "system", "content": sys }));
    }
    let mut user_content = opts.prompt.clone();
    if let Some(ref schema) = opts.json_schema {
        user_content.push_str(&format!(
            "\n\nRespond with ONLY a single JSON object matching this JSON Schema — no prose, no code fences:\n{}",
            schema
        ));
    }
    messages.push(serde_json::json!({ "role": "user", "content": user_content }));

    let mut body = serde_json::json!({
        "model": opts.model_id,
        "messages": messages,
        "stream": true,
        "stream_options": { "include_usage": true },
    });
    if opts.json_schema.is_some() {
        // json_object mode is the widest-compat structured hint (OpenAI,
        // OpenRouter, Ollama, LM Studio); the schema itself travels in the
        // prompt above.
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }
    if profile.id == "openrouter" {
        // OpenRouter: include real cost accounting in the final usage chunk.
        body["usage"] = serde_json::json!({ "include": true });
    }
    // Reasoning/thinking control where the provider supports it
    if let Some(thinking) = opts.thinking {
        match profile.id.as_str() {
            "openrouter" => {
                body["reasoning"] = serde_json::json!({ "enabled": thinking });
            }
            "ollama" => {
                body["think"] = serde_json::json!(thinking);
            }
            _ => {} // others: leave the model's default behavior
        }
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()?;
    let url = format!("{}/chat/completions", profile.base_url.trim_end_matches('/'));
    let mut req = client.post(&url).json(&body);
    if let Some(ref key) = api_key {
        req = req.bearer_auth(key);
    }
    if profile.id == "openrouter" {
        req = req
            .header("HTTP-Referer", "https://github.com/Apolog1ze-Dev/ClaudOrchestrator")
            .header("X-Title", "ClaudOrchestrator");
    }

    let _ = on_event(FrontendStreamEvent::Status {
        message: format!("Calling {} ({})", profile.label, opts.model_id),
    });

    let response = req.send().await.map_err(|e| {
        anyhow::anyhow!(
            "Could not reach {} at {} — {}{}",
            profile.label,
            url,
            e,
            if profile.local { " (is the local server running?)" } else { "" }
        )
    })?;

    let status = response.status();
    if !status.is_success() {
        let body_text = response.text().await.unwrap_or_default();
        let snippet: String = body_text.chars().take(500).collect();
        let _ = on_event(FrontendStreamEvent::Error {
            message: format!("{} returned {}: {}", profile.label, status, snippet),
        });
        anyhow::bail!("{} returned {}: {}", profile.label, status, snippet);
    }

    // SSE stream parse
    let mut full_text = String::new();
    let mut tokens_in: u64 = 0;
    let mut tokens_out: u64 = 0;
    let mut reported_cost: Option<f64> = None;
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines; keep the tail in the buffer.
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
            buffer.drain(..=newline_pos);

            let Some(data) = line.strip_prefix("data:") else { continue };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let Ok(json) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };

            if let Some(delta) = json
                .pointer("/choices/0/delta/content")
                .and_then(|v| v.as_str())
            {
                if !delta.is_empty() {
                    full_text.push_str(delta);
                    let _ = on_event(FrontendStreamEvent::Text {
                        content: delta.to_string(),
                    });
                }
            }

            if let Some(usage) = json.get("usage").filter(|u| !u.is_null()) {
                tokens_in = usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(tokens_in);
                tokens_out = usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(tokens_out);
                // OpenRouter reports the actual charged cost here.
                if let Some(cost) = usage.get("cost").and_then(|v| v.as_f64()) {
                    reported_cost = Some(cost);
                }
            }
        }
    }

    // Real cost only: provider-reported, or hard zero for local engines.
    let (cost_usd, cost_source) = if let Some(cost) = reported_cost {
        (cost, "provider")
    } else if profile.local {
        (0.0, "free_local")
    } else {
        (0.0, "tokens_only")
    };

    let structured_output = if opts.json_schema.is_some() {
        serde_json::from_str::<serde_json::Value>(strip_code_fences(&full_text)).ok()
    } else {
        None
    };

    if opts.json_schema.is_some() && structured_output.is_none() {
        anyhow::bail!(
            "{} ({}) did not return valid JSON for a structured request",
            profile.label,
            opts.model_id
        );
    }

    if let Some(ref usage_ctx) = opts.usage {
        append_usage(
            &opts.working_dir,
            &UsageRecord {
                ts: chrono::Utc::now().to_rfc3339(),
                task: usage_ctx.task.clone(),
                epic_id: usage_ctx.epic_id.clone(),
                model: format!("{}:{}", profile.id, opts.model_id),
                effort: "n/a".to_string(),
                cost_usd,
                duration_ms: started.elapsed().as_millis() as u64,
                session_id: None,
                tokens_in,
                tokens_out,
                cost_source: cost_source.to_string(),
            },
        );
    }

    let _ = on_event(FrontendStreamEvent::Complete {
        result: full_text.clone(),
        session_id: String::new(),
        total_cost_usd: cost_usd,
    });

    Ok(ClaudeResult {
        result: full_text,
        session_id: None,
        total_cost_usd: cost_usd,
        structured_output,
    })
}

/// Dynamic model discovery: GET {base}/models (standard across OpenAI,
/// OpenRouter, Ollama, LM Studio). Returns sorted model ids.
pub async fn list_models(provider_id: &str) -> Result<Vec<String>> {
    let profile = resolve_profile(provider_id)
        .ok_or_else(|| anyhow::anyhow!("Unknown provider profile: {}", provider_id))?;

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()?;
    let url = format!("{}/models", profile.base_url.trim_end_matches('/'));
    let mut req = client.get(&url);
    if let Some(key) = get_api_key(provider_id) {
        req = req.bearer_auth(key);
    }

    let response = req.send().await.map_err(|e| {
        anyhow::anyhow!(
            "Could not reach {} at {} — {}{}",
            profile.label,
            url,
            e,
            if profile.local { " (is the local server running?)" } else { "" }
        )
    })?;
    if !response.status().is_success() {
        anyhow::bail!("{} returned {} from /models", profile.label, response.status());
    }

    let json: serde_json::Value = response.json().await?;
    let mut models: Vec<String> = json
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|v| v.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    models.sort();
    models.dedup();
    Ok(models)
}

/// Quick connectivity/auth probe used by Settings → Test.
#[derive(Debug, Clone, Serialize)]
pub struct ProviderTestResult {
    pub ok: bool,
    pub message: String,
    pub latency_ms: u64,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub cost_usd: f64,
}

pub async fn test_provider(provider_id: &str, model: &str, working_dir: &str) -> ProviderTestResult {
    let started = std::time::Instant::now();
    let opts = ClaudeProcessOptions {
        prompt: "Reply with exactly: OK".to_string(),
        model_id: model.to_string(),
        effort: crate::types::config::EffortLevel::Low,
        working_dir: working_dir.to_string(),
        system_prompt: None,
        allowed_tools: Some(vec!["none".to_string()]),
        json_schema: None,
        streaming: false,
        session_resume: None,
        usage: None, // probes don't pollute the ledger
        provider: Some(provider_id.to_string()),
        thinking: None,
    };
    match run_chat(provider_id, &opts, Box::new(|_| Ok(()))).await {
        Ok(result) => ProviderTestResult {
            ok: true,
            message: format!("Response: {}", result.result.trim().chars().take(80).collect::<String>()),
            latency_ms: started.elapsed().as_millis() as u64,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: result.total_cost_usd,
        },
        Err(e) => ProviderTestResult {
            ok: false,
            message: e.to_string(),
            latency_ms: started.elapsed().as_millis() as u64,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0.0,
        },
    }
}
