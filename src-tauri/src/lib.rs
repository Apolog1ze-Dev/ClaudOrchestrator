mod commands;
mod claude;
mod engine;
mod handoff;
mod providers;
mod storage;
mod types;
mod updater;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(updater::PendingUpdate(Mutex::new(None)))
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = storage::AppState::new(&app_handle)?;
            app.manage(state);

            // Register updater plugin (desktop only)
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            // Silent background update check
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                updater::check_and_download_update(update_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // System commands
            commands::system_commands::check_claude_installed,
            commands::system_commands::get_claude_version,
            commands::system_commands::select_project_directory,
            commands::system_commands::get_available_models,
            commands::system_commands::detect_subscription_plan,
            commands::system_commands::get_plan_info,
            commands::system_commands::check_auth_status,
            commands::system_commands::launch_auth_login,
            // Config commands
            commands::config_commands::get_config,
            commands::config_commands::save_config,
            commands::config_commands::get_default_config,
            commands::config_commands::load_general_config,
            commands::config_commands::save_general_config,
            // Epic commands
            commands::epic_commands::create_epic,
            commands::epic_commands::get_epic,
            commands::epic_commands::list_epics,
            commands::epic_commands::update_epic_status,
            commands::epic_commands::delete_epic,
            commands::epic_commands::rename_epic,
            commands::epic_commands::load_epic_full,
            commands::epic_commands::load_tickets_for_epic,
            commands::epic_commands::load_phases_for_ticket,
            commands::epic_commands::load_specs_for_epic,
            commands::config_commands::load_config,
            // Plan commands (interactive steps)
            commands::plan_commands::start_scouting,
            commands::plan_commands::submit_answers,
            commands::plan_commands::request_more_questions,
            commands::plan_commands::continue_clarification,
            commands::plan_commands::generate_specs,
            commands::plan_commands::regenerate_spec,
            commands::plan_commands::approve_specs,
            commands::plan_commands::decompose_tickets,
            commands::plan_commands::approve_tickets,
            commands::plan_commands::plan_all_phases,
            commands::plan_commands::approve_phases,
            commands::plan_commands::review_plan_coherency,
            commands::plan_commands::generate_plan_questionnaire,
            commands::plan_commands::submit_plan_validation,
            // Legacy plan commands
            commands::plan_commands::capture_intent,
            commands::plan_commands::plan_phases,
            // Execute commands
            commands::execute_commands::execute_phase,
            commands::execute_commands::execute_ticket,
            commands::execute_commands::execute_epic,
            commands::execute_commands::stop_execution,
            commands::execute_commands::cancel_execution,
            commands::execute_commands::respond_to_approval,
            commands::execute_commands::review_phase_work,
            commands::execute_commands::retry_phase,
            commands::execute_commands::respond_to_review_gate,
            commands::execute_commands::run_supervised_epic,
            // Verify commands
            commands::verify_commands::verify_phase,
            commands::verify_commands::verify_ticket,
            // Chat commands
            commands::chat_commands::chat_ask,
            commands::chat_commands::chat_refine_check,
            commands::chat_commands::chat_refine_apply,
            // Usage / budget commands
            commands::usage_commands::get_usage_summary,
            // Provider (BYO) commands
            commands::provider_commands::get_provider_profiles,
            commands::provider_commands::set_provider_key,
            commands::provider_commands::test_provider,
            commands::provider_commands::list_provider_models,
            // Hand-off commands
            commands::handoff_commands::generate_handoff_bundle,
            commands::handoff_commands::detect_handoff_targets,
            commands::handoff_commands::launch_handoff_target,
            commands::handoff_commands::build_handoff_phase_prompt,
            commands::handoff_commands::sync_handoff_status,
            // Filesystem commands
            commands::filesystem_commands::list_directory_tree,
            commands::filesystem_commands::read_file_text,
            commands::filesystem_commands::write_file_text,
            // Update commands
            updater::install_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building ClaudOrchestrator");

    app.run(|app_handle, event| {
        // Install pending update when app exits (user clicked "Later")
        if let tauri::RunEvent::Exit = event {
            let _ = updater::install_pending(app_handle);
        }
    });
}
