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

/// Read JSON; if the file exists but fails to parse, move it aside as
/// `<name>.corrupt-<timestamp>` so the data is preserved and the failure is
/// visible, instead of being silently skipped and later overwritten.
pub fn read_json_or_quarantine<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let content = std::fs::read_to_string(path)?;
    match serde_json::from_str(&content) {
        Ok(value) => Ok(value),
        Err(e) => {
            let file_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "file".to_string());
            let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
            let quarantine = path.with_file_name(format!("{}.corrupt-{}", file_name, stamp));
            let moved = std::fs::rename(path, &quarantine).is_ok();
            eprintln!(
                "[storage] Corrupt JSON at {}{}: {}",
                path.display(),
                if moved {
                    format!(" (preserved as {})", quarantine.display())
                } else {
                    String::new()
                },
                e
            );
            Err(anyhow::anyhow!(
                "Corrupt JSON at {}{}: {}",
                path.display(),
                if moved {
                    format!(" — original preserved as {}", quarantine.display())
                } else {
                    String::new()
                },
                e
            ))
        }
    }
}

pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let content = serde_json::to_string_pretty(value)?;
    write_atomic(path, content.as_bytes())
}

/// Write via temp file + rename in the same directory so a crash or power
/// loss mid-write can never leave a torn/truncated file behind.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let tmp = path.with_file_name(format!("{}.tmp", file_name));
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    // std::fs::rename replaces the destination atomically on both Windows
    // (MoveFileExW + MOVEFILE_REPLACE_EXISTING) and POSIX.
    std::fs::rename(&tmp, path)?;
    Ok(())
}
