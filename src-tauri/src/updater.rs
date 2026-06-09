use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct UpdateReadyPayload {
    pub version: String,
    pub body: Option<String>,
}

/// Holds a downloaded update + its bytes until the user decides to install.
pub struct PendingUpdate(pub Mutex<Option<(Update, Vec<u8>)>>);

/// Silently checks for updates and downloads if available.
/// Emits "update-ready" to the frontend on success, does nothing on failure.
pub async fn check_and_download_update(app: AppHandle) {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[updater] failed to get updater: {e}");
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return,
        Err(e) => {
            eprintln!("[updater] check failed: {e}");
            return;
        }
    };

    let version = update.version.clone();
    let body = update.body.clone();

    // Download only — do not install yet
    let bytes = match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("[updater] download failed: {e}");
            return;
        }
    };

    // Store the update + bytes so install_update can use them later
    if let Some(state) = app.try_state::<PendingUpdate>() {
        state.0.lock().unwrap().replace((update, bytes));
    }

    let _ = app.emit("update-ready", UpdateReadyPayload { version, body });
}

/// Called by the frontend when the user clicks "Restart Now",
/// or by the exit handler when the app closes with a pending update.
pub fn install_pending(app: &AppHandle) -> Result<(), String> {
    let pending = app
        .try_state::<PendingUpdate>()
        .ok_or("No PendingUpdate state")?;

    let data = pending.0.lock().unwrap().take();
    match data {
        Some((update, bytes)) => {
            update.install(&bytes).map_err(|e| e.to_string())?;
            // On Windows the NSIS installer causes the process to exit,
            // so restart() may not be reached — that's expected.
            app.restart();
        }
        None => Err("No pending update".into()),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    install_pending(&app)
}
