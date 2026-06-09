use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use anyhow::Result;
use tauri::AppHandle;
use tauri::Manager;

use crate::types::*;
use crate::claude::process::ExecutionController;
use crate::engine::approval::ApprovalManager;
use crate::engine::review_gate::ReviewGateManager;
use super::fs_helpers::*;

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub general_config: Mutex<AppConfig>,
    pub app_data_dir: PathBuf,
    pub execution_controller: Arc<ExecutionController>,
    pub approval_manager: Arc<ApprovalManager>,
    pub review_gate_manager: Arc<ReviewGateManager>,
}

impl AppState {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle.path().app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        ensure_dir(&app_data_dir)?;

        // Load general config from app data dir if it exists
        let general_config_path = app_data_dir.join("general-config.json");
        let general_config = if general_config_path.exists() {
            read_json::<AppConfig>(&general_config_path).unwrap_or_default()
        } else {
            AppConfig::default()
        };

        Ok(Self {
            config: Mutex::new(AppConfig::default()),
            general_config: Mutex::new(general_config),
            app_data_dir,
            execution_controller: Arc::new(ExecutionController::new()),
            approval_manager: Arc::new(ApprovalManager::new()),
            review_gate_manager: Arc::new(ReviewGateManager::new()),
        })
    }

    // ─── Config ──────────────────────────────────────────────────────

    pub fn get_config(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn set_config(&self, config: AppConfig) {
        *self.config.lock().unwrap() = config;
    }

    pub fn load_config_from_disk(&self, target_dir: &str) -> Result<AppConfig> {
        let path = get_config_path(target_dir);
        if path.exists() {
            let config: AppConfig = read_json(&path)?;
            self.set_config(config.clone());
            Ok(config)
        } else {
            // No workspace config — use general config as default
            let general = self.general_config.lock().unwrap().clone();
            self.set_config(general.clone());
            Ok(general)
        }
    }

    pub fn save_config_to_disk(&self, target_dir: &str) -> Result<()> {
        let config = self.get_config();
        let path = get_config_path(target_dir);
        write_json(&path, &config)?;
        Ok(())
    }

    // ─── General Config ──────────────────────────────────────────────

    pub fn get_general_config(&self) -> AppConfig {
        self.general_config.lock().unwrap().clone()
    }

    pub fn set_general_config(&self, config: AppConfig) {
        *self.general_config.lock().unwrap() = config;
    }

    pub fn save_general_config(&self) -> Result<()> {
        let config = self.get_general_config();
        let path = self.app_data_dir.join("general-config.json");
        write_json(&path, &config)?;
        Ok(())
    }

    // ─── Epic CRUD ───────────────────────────────────────────────────

    pub fn save_epic(&self, target_dir: &str, epic: &Epic) -> Result<()> {
        let dir = get_epic_dir(target_dir, &epic.id);
        ensure_dir(&dir)?;
        ensure_dir(&dir.join("specs"))?;
        ensure_dir(&dir.join("tickets"))?;
        ensure_dir(&dir.join("diagrams"))?;
        write_json(&dir.join("epic.json"), epic)?;
        Ok(())
    }

    pub fn load_epic(&self, target_dir: &str, epic_id: &str) -> Result<Epic> {
        let path = get_epic_dir(target_dir, epic_id).join("epic.json");
        read_json(&path)
    }

    pub fn list_epics(&self, target_dir: &str) -> Result<Vec<Epic>> {
        let dir = get_epics_dir(target_dir);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut epics = Vec::new();
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let epic_path = entry.path().join("epic.json");
                if epic_path.exists() {
                    if let Ok(epic) = read_json::<Epic>(&epic_path) {
                        epics.push(epic);
                    }
                }
            }
        }
        epics.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(epics)
    }

    pub fn delete_epic(&self, target_dir: &str, epic_id: &str) -> Result<()> {
        let dir = get_epic_dir(target_dir, epic_id);
        if dir.exists() {
            std::fs::remove_dir_all(dir)?;
        }
        Ok(())
    }

    // ─── Ticket CRUD ─────────────────────────────────────────────────

    pub fn save_ticket(&self, target_dir: &str, epic_id: &str, ticket: &Ticket) -> Result<()> {
        let dir = get_ticket_dir(target_dir, epic_id, &ticket.id);
        ensure_dir(&dir)?;
        ensure_dir(&dir.join("phases"))?;
        write_json(&dir.join("ticket.json"), ticket)?;
        Ok(())
    }

    pub fn load_ticket(&self, target_dir: &str, epic_id: &str, ticket_id: &str) -> Result<Ticket> {
        let path = get_ticket_dir(target_dir, epic_id, ticket_id).join("ticket.json");
        read_json(&path)
    }

    pub fn list_tickets(&self, target_dir: &str, epic_id: &str) -> Result<Vec<Ticket>> {
        let dir = get_tickets_dir(target_dir, epic_id);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut tickets = Vec::new();
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let ticket_path = entry.path().join("ticket.json");
                if ticket_path.exists() {
                    if let Ok(ticket) = read_json::<Ticket>(&ticket_path) {
                        tickets.push(ticket);
                    }
                }
            }
        }
        tickets.sort_by_key(|t| t.priority);
        Ok(tickets)
    }

    // ─── Phase CRUD ──────────────────────────────────────────────────

    pub fn save_phase(
        &self,
        target_dir: &str,
        epic_id: &str,
        ticket_id: &str,
        phase: &Phase,
    ) -> Result<()> {
        let dir = get_phase_dir(target_dir, epic_id, ticket_id, &phase.id);
        ensure_dir(&dir)?;
        write_json(&dir.join("phase.json"), phase)?;
        Ok(())
    }

    pub fn load_phase(
        &self,
        target_dir: &str,
        epic_id: &str,
        ticket_id: &str,
        phase_id: &str,
    ) -> Result<Phase> {
        let path = get_phase_dir(target_dir, epic_id, ticket_id, phase_id).join("phase.json");
        read_json(&path)
    }

    pub fn list_phases(
        &self,
        target_dir: &str,
        epic_id: &str,
        ticket_id: &str,
    ) -> Result<Vec<Phase>> {
        let dir = get_phases_dir(target_dir, epic_id, ticket_id);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut phases = Vec::new();
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let phase_path = entry.path().join("phase.json");
                if phase_path.exists() {
                    if let Ok(phase) = read_json::<Phase>(&phase_path) {
                        phases.push(phase);
                    }
                }
            }
        }
        phases.sort_by_key(|p| p.order);
        Ok(phases)
    }

    // ─── Spec CRUD ───────────────────────────────────────────────────

    pub fn save_spec(&self, target_dir: &str, epic_id: &str, spec: &Spec) -> Result<()> {
        let dir = get_specs_dir(target_dir, epic_id);
        ensure_dir(&dir)?;
        let filename = format!("{}.json", spec.id);
        write_json(&dir.join(&filename), spec)?;
        // Also write the markdown companion
        let md_filename = match spec.spec_type {
            SpecType::Prd => "prd.md",
            SpecType::TechSpec => "tech-spec.md",
            SpecType::Architecture => "architecture.md",
            SpecType::ApiSpec => "api-spec.md",
            SpecType::DesignSpec => "design-spec.md",
            SpecType::Custom => "custom.md",
        };
        std::fs::write(dir.join(md_filename), &spec.content)?;
        Ok(())
    }

    pub fn load_spec(&self, target_dir: &str, epic_id: &str, spec_id: &str) -> Result<Spec> {
        let path = get_specs_dir(target_dir, epic_id).join(format!("{}.json", spec_id));
        read_json(&path)
    }

    pub fn list_specs(&self, target_dir: &str, epic_id: &str) -> Result<Vec<Spec>> {
        let dir = get_specs_dir(target_dir, epic_id);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut specs = Vec::new();
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(spec) = read_json::<Spec>(&path) {
                    specs.push(spec);
                }
            }
        }
        Ok(specs)
    }

    // ─── Verification ────────────────────────────────────────────────

    pub fn save_verification(
        &self,
        target_dir: &str,
        epic_id: &str,
        ticket_id: &str,
        phase_id: &str,
        verification: &PhaseVerification,
    ) -> Result<()> {
        let dir = get_phase_dir(target_dir, epic_id, ticket_id, phase_id);
        ensure_dir(&dir)?;
        write_json(&dir.join("verification.json"), verification)?;
        Ok(())
    }
}
