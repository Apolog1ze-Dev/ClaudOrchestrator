use crate::storage::AppState;
use crate::types::AppConfig;

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.get_config())
}

#[tauri::command]
pub fn save_config(
    state: tauri::State<'_, AppState>,
    config: AppConfig,
    target_dir: String,
) -> Result<(), String> {
    state.set_config(config);
    state.save_config_to_disk(&target_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_default_config() -> Result<AppConfig, String> {
    Ok(AppConfig::default())
}

/// Load persisted config from disk for a specific workspace.
/// Returns Some(config) if a config file exists, None for fresh workspaces.
#[tauri::command]
pub fn load_config(
    state: tauri::State<'_, AppState>,
    target_dir: String,
) -> Result<Option<AppConfig>, String> {
    let path = crate::storage::fs_helpers::get_config_path(&target_dir);
    if path.exists() {
        let config = state.load_config_from_disk(&target_dir).map_err(|e| e.to_string())?;
        Ok(Some(config))
    } else {
        Ok(None)
    }
}

/// Load the general (default) config from app data directory.
#[tauri::command]
pub fn load_general_config(
    state: tauri::State<'_, AppState>,
) -> Result<AppConfig, String> {
    Ok(state.get_general_config())
}

/// Save the general (default) config to app data directory.
#[tauri::command]
pub fn save_general_config(
    state: tauri::State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    state.set_general_config(config);
    state.save_general_config().map_err(|e| e.to_string())
}
