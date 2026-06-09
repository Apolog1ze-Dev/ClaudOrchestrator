use std::path::{Path, PathBuf};
use anyhow::Result;

const ORCHESTRATOR_DIR: &str = ".claudorchestrator";

pub fn get_orchestrator_dir(target_dir: &str) -> PathBuf {
    Path::new(target_dir).join(ORCHESTRATOR_DIR)
}

pub fn get_epics_dir(target_dir: &str) -> PathBuf {
    get_orchestrator_dir(target_dir).join("epics")
}

pub fn get_epic_dir(target_dir: &str, epic_id: &str) -> PathBuf {
    get_epics_dir(target_dir).join(epic_id)
}

pub fn get_specs_dir(target_dir: &str, epic_id: &str) -> PathBuf {
    get_epic_dir(target_dir, epic_id).join("specs")
}

pub fn get_tickets_dir(target_dir: &str, epic_id: &str) -> PathBuf {
    get_epic_dir(target_dir, epic_id).join("tickets")
}

pub fn get_ticket_dir(target_dir: &str, epic_id: &str, ticket_id: &str) -> PathBuf {
    get_tickets_dir(target_dir, epic_id).join(ticket_id)
}

pub fn get_phases_dir(target_dir: &str, epic_id: &str, ticket_id: &str) -> PathBuf {
    get_ticket_dir(target_dir, epic_id, ticket_id).join("phases")
}

pub fn get_phase_dir(target_dir: &str, epic_id: &str, ticket_id: &str, phase_id: &str) -> PathBuf {
    get_phases_dir(target_dir, epic_id, ticket_id).join(phase_id)
}

pub fn get_config_path(target_dir: &str) -> PathBuf {
    get_orchestrator_dir(target_dir).join("config.json")
}

pub fn ensure_dir(path: &Path) -> Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let content = std::fs::read_to_string(path)?;
    let value = serde_json::from_str(&content)?;
    Ok(value)
}

pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let content = serde_json::to_string_pretty(value)?;
    std::fs::write(path, content)?;
    Ok(())
}
