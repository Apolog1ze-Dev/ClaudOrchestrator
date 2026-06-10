use serde::Serialize;

use crate::providers::{self, ProviderProfile, ProviderTestResult};
use crate::storage::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct ProviderInfo {
    #[serde(flatten)]
    pub profile: ProviderProfile,
    pub has_key: bool,
}

/// Provider profiles from the active config, annotated with key presence.
#[tauri::command]
pub fn get_provider_profiles(state: tauri::State<'_, AppState>) -> Vec<ProviderInfo> {
    state
        .get_config()
        .providers
        .into_iter()
        .map(|profile| ProviderInfo {
            has_key: providers::has_api_key(&profile.id),
            profile,
        })
        .collect()
}

/// Store (or clear, when empty) a provider API key in the OS keychain.
/// Keys never touch config files or the workspace.
#[tauri::command]
pub fn set_provider_key(provider_id: String, key: String) -> Result<(), String> {
    providers::set_api_key(&provider_id, &key).map_err(|e| e.to_string())
}

/// Connectivity/auth probe: one tiny completion against the provider.
#[tauri::command]
pub async fn test_provider(
    provider_id: String,
    model: String,
    target_dir: Option<String>,
) -> ProviderTestResult {
    let dir = target_dir.unwrap_or_else(|| ".".to_string());
    providers::test_provider(&provider_id, &model, &dir).await
}
