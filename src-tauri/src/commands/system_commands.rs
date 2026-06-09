use std::process::Command;
use serde::Serialize;
use crate::types::config::{ClaudeModel, PlanInfo, SubscriptionPlan, available_models, plan_info};
use crate::claude::process::find_claude_bin;

fn claude_command() -> Command {
    Command::new(find_claude_bin())
}

// ─── Auth Status ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AuthStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub logged_in: bool,
    pub auth_method: Option<String>,
    pub email: Option<String>,
    pub subscription_type: Option<String>,
    /// True if a quick `-p` test actually works (token not expired)
    pub token_valid: bool,
    pub error: Option<String>,
}

/// Comprehensive auth check: is claude installed, logged in, and is the token actually valid?
#[tauri::command]
pub async fn check_auth_status() -> AuthStatus {
    // Step 1: Check installed
    let version = match claude_command().arg("--version").output() {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    };

    if version.is_none() {
        return AuthStatus {
            installed: false,
            version: None,
            logged_in: false,
            auth_method: None,
            email: None,
            subscription_type: None,
            token_valid: false,
            error: Some("Claude Code is not installed".to_string()),
        };
    }

    // Step 2: Check auth status
    let auth_output = claude_command()
        .args(["auth", "status"])
        .output();

    let (logged_in, auth_method, email, subscription_type) = match auth_output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let json: serde_json::Value = serde_json::from_str(&stdout).unwrap_or_default();
            (
                json.get("loggedIn").and_then(|v| v.as_bool()).unwrap_or(false),
                json.get("authMethod").and_then(|v| v.as_str()).map(String::from),
                json.get("email").and_then(|v| v.as_str()).map(String::from),
                json.get("subscriptionType").and_then(|v| v.as_str()).map(String::from),
            )
        }
        _ => (false, None, None, None),
    };

    if !logged_in {
        return AuthStatus {
            installed: true,
            version,
            logged_in: false,
            auth_method,
            email,
            subscription_type,
            token_valid: false,
            error: Some("Not logged in. Run `claude auth login` to authenticate.".to_string()),
        };
    }

    // Step 3: Test if the token actually works with a minimal -p call
    let test = claude_command()
        .args(["-p", "ok", "--output-format", "json", "--no-session-persistence"])
        .output();

    let (token_valid, error) = match test {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if output.status.success() && !stdout.contains("authentication_error") && !stdout.contains("OAuth token has expired") {
                (true, None)
            } else {
                (false, Some("OAuth token has expired. Please run `claude auth login` in your terminal to refresh it.".to_string()))
            }
        }
        Err(e) => (false, Some(format!("Failed to test token: {}", e))),
    };

    AuthStatus {
        installed: true,
        version,
        logged_in,
        auth_method,
        email,
        subscription_type,
        token_valid,
        error,
    }
}

/// Launch `claude auth login` to open the browser for re-authentication.
/// This spawns the process detached so the browser opens.
#[tauri::command]
pub async fn launch_auth_login() -> Result<(), String> {
    claude_command()
        .args(["auth", "login"])
        .spawn()
        .map_err(|e| format!("Failed to launch auth login: {}", e))?;
    Ok(())
}

// ─── Existing commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_claude_installed() -> Result<bool, String> {
    match claude_command().arg("--version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn get_claude_version() -> Result<String, String> {
    let output = claude_command()
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run claude: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Claude CLI returned non-zero exit code".to_string())
    }
}

#[tauri::command]
pub async fn select_project_directory() -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub fn get_available_models() -> Vec<ClaudeModel> {
    available_models()
}

#[tauri::command]
pub async fn detect_subscription_plan() -> Result<PlanInfo, String> {
    // `claude auth status` reports the subscription tier directly and costs
    // nothing. (The previous implementation burned two real "ok" prompts per
    // app start and inferred the plan from which model answered — both
    // quota-wasteful and nondeterministic under transient failures.)
    let output = claude_command()
        .args(["auth", "status"])
        .output()
        .map_err(|e| format!("Failed to run claude auth status: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(stdout.trim()).unwrap_or_default();
    let subscription = json
        .get("subscriptionType")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let plan = match subscription {
        "pro" => SubscriptionPlan::Pro,
        // auth status does not distinguish Max 5x from Max 20x. Assume the
        // lower tier so budget estimates stay conservative — the monthly
        // allowance can be corrected in Settings.
        "max" => SubscriptionPlan::Max5x,
        "team" => SubscriptionPlan::Team,
        "enterprise" => SubscriptionPlan::Enterprise,
        _ => SubscriptionPlan::Unknown,
    };

    Ok(plan_info(&plan))
}

#[tauri::command]
pub fn get_plan_info(plan: SubscriptionPlan) -> PlanInfo {
    plan_info(&plan)
}
