//! Hand-off: export the epic's plan as a deterministic, agent-readable
//! bundle inside the target repo, launch external tools on it, and read
//! externally-completed work back for local verification.
//!
//! Design notes:
//! - The bundle is plain markdown + one status.json. Any agent (or human)
//!   can execute it; nothing here is specific to one tool.
//! - Output is deterministic for a given epic state (no wall-clock
//!   timestamps inside files; `generated_at` mirrors epic.updated_at), so
//!   the bundle diffs cleanly in git.
//! - External completion protocol: the executing agent flips
//!   `external_status` in status.json and/or commits with a
//!   `Plan-Phase: <epic>/<ticket>/<phase>` trailer. `sync_status` reads both.

use std::collections::HashSet;
use std::path::PathBuf;
use anyhow::Result;
use serde::Serialize;

use crate::storage::fs_helpers::{ensure_dir, write_atomic};
use crate::types::*;

pub const BUNDLE_VERSION: u32 = 1;
pub const BUNDLE_DIR: &str = "docs/plan";
const AGENTS_BEGIN: &str = "<!-- claudorch:begin -->";
const AGENTS_END: &str = "<!-- claudorch:end -->";

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn slugify(s: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = true; // suppress leading dash
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
        if slug.len() >= 40 {
            break;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() { "item".to_string() } else { slug }
}

fn status_str<T: Serialize>(status: &T) -> String {
    serde_json::to_value(status)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "unknown".to_string())
}

fn yaml_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn bundle_root(target_dir: &str) -> PathBuf {
    PathBuf::from(target_dir).join(BUNDLE_DIR)
}

fn phase_file_name(ticket_order: usize, phase: &Phase) -> String {
    format!("{:02}-{:02}-{}.md", ticket_order, phase.order, slugify(&phase.title))
}

fn ticket_file_name(ticket_order: usize, ticket: &Ticket) -> String {
    format!("{:02}-{}.md", ticket_order, slugify(&ticket.title))
}

// ─── Bundle generation ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct BundleSummary {
    pub bundle_dir: String,
    pub files_written: u32,
    pub tickets: u32,
    pub phases: u32,
}

pub fn generate_bundle(
    epic: &Epic,
    specs: &[Spec],
    tickets_with_phases: &[(Ticket, Vec<Phase>)],
    target_dir: &str,
) -> Result<BundleSummary> {
    let root = bundle_root(target_dir);
    ensure_dir(&root)?;
    ensure_dir(&root.join("tickets"))?;
    ensure_dir(&root.join("phases"))?;

    let mut files_written: u32 = 0;
    let mut phase_count: u32 = 0;

    // spec.md — objective + every spec document, stable order
    {
        let objective = epic.enhanced_objective.as_deref().unwrap_or(&epic.objective);
        let mut ordered: Vec<&Spec> = specs.iter().collect();
        ordered.sort_by_key(|s| match s.spec_type {
            SpecType::Prd => 0,
            SpecType::TechSpec => 1,
            SpecType::DesignSpec => 2,
            SpecType::Architecture => 3,
            SpecType::ApiSpec => 4,
            SpecType::Custom => 5,
        });
        let mut md = format!(
            "# {}\n\n## Objective\n\n{}\n",
            if epic.title.is_empty() { "Project Plan" } else { &epic.title },
            objective
        );
        for spec in ordered {
            md.push_str(&format!("\n---\n\n## {}\n\n{}\n", spec.title, spec.content));
        }
        write_atomic(&root.join("spec.md"), md.as_bytes())?;
        files_written += 1;
    }

    // tickets/NN-slug.md and phases/NN-MM-slug.md
    let mut status_phases: Vec<serde_json::Value> = Vec::new();
    for (ti, (ticket, phases)) in tickets_with_phases.iter().enumerate() {
        let ticket_order = ti + 1;

        let mut tmd = String::new();
        tmd.push_str("---\n");
        tmd.push_str(&format!("id: {}\n", ticket.id));
        tmd.push_str(&format!("epic: {}\n", epic.id));
        tmd.push_str(&format!("order: {}\n", ticket_order));
        tmd.push_str(&format!("status: {}\n", status_str(&ticket.status)));
        tmd.push_str(&format!(
            "dependencies: [{}]\n",
            ticket.dependencies.join(", ")
        ));
        tmd.push_str(&format!("title: {}\n", yaml_quote(&ticket.title)));
        tmd.push_str("---\n\n");
        tmd.push_str(&format!("# {}\n\n{}\n", ticket.title, ticket.description));
        if !ticket.acceptance_criteria.is_empty() {
            tmd.push_str("\n## Acceptance Criteria\n\n");
            for ac in &ticket.acceptance_criteria {
                tmd.push_str(&format!("- {}\n", ac));
            }
        }
        if !phases.is_empty() {
            tmd.push_str("\n## Phases (execute in order)\n\n");
            for phase in phases {
                tmd.push_str(&format!(
                    "- [{}] `phases/{}` — {}\n",
                    if phase.status == PhaseStatus::Passed { "x" } else { " " },
                    phase_file_name(ticket_order, phase),
                    phase.title
                ));
            }
        }
        write_atomic(
            &root.join("tickets").join(ticket_file_name(ticket_order, ticket)),
            tmd.as_bytes(),
        )?;
        files_written += 1;

        for phase in phases {
            let file_name = phase_file_name(ticket_order, phase);
            let pmd = build_phase_markdown(epic, ticket, phase, ticket_order, true);
            write_atomic(&root.join("phases").join(&file_name), pmd.as_bytes())?;
            files_written += 1;
            phase_count += 1;

            status_phases.push(serde_json::json!({
                "id": phase.id,
                "ticket_id": ticket.id,
                "file": format!("phases/{}", file_name),
                "title": phase.title,
                "internal_status": status_str(&phase.status),
                "external_status": if phase.status == PhaseStatus::Passed { "done" } else { "pending" },
            }));
        }
    }

    // status.json — machine-readable mirror + the external completion ledger
    {
        let status = serde_json::json!({
            "bundle_version": BUNDLE_VERSION,
            "epic_id": epic.id,
            "epic_title": epic.title,
            "generated_at": epic.updated_at,
            "phases": status_phases,
        });
        write_atomic(
            &root.join("status.json"),
            serde_json::to_string_pretty(&status)?.as_bytes(),
        )?;
        files_written += 1;
    }

    // README.md — the agent-facing execution contract
    {
        let md = format!(
            r#"# Plan Bundle (ClaudOrchestrator hand-off)

This directory contains an orchestrated implementation plan. Any coding
agent or human can execute it. Bundle version: {version}.

## Read order

1. `spec.md` — objective, requirements, architecture, design
2. `tickets/` — units of work with acceptance criteria, ordered by dependency
3. `phases/` — step-by-step implementation units (the things you execute)
4. `status.json` — machine-readable progress ledger

## Execution protocol

- Execute phases in file-name order (`01-01-…`, `01-02-…`, …). A phase's
  ticket lists its dependencies — never start a ticket before its
  dependencies are done.
- Each phase file contains the exact steps, file targets, and a
  "Done when" section. Stay within the phase's scope.
- When a phase is complete:
  1. Set `external_status: done` in the phase file's frontmatter
  2. Set the matching entry's `external_status` to `"done"` in `status.json`
  3. Commit with a trailer line: `Plan-Phase: {epic_id}/<ticket_id>/<phase_id>`
- ClaudOrchestrator reads both signals to verify completed work locally.

## Conventions

- Make the smallest change that satisfies the phase. Do not refactor
  beyond scope. Run the project's tests when a phase's "Done when"
  mentions them.
"#,
            version = BUNDLE_VERSION,
            epic_id = epic.id,
        );
        write_atomic(&root.join("README.md"), md.as_bytes())?;
        files_written += 1;
    }

    // AGENTS.md marked section (cross-tool convention) + Claude Code command
    write_agents_section(epic, target_dir)?;
    files_written += 1;
    write_claude_command(target_dir)?;
    files_written += 1;

    Ok(BundleSummary {
        bundle_dir: root.to_string_lossy().to_string(),
        files_written,
        tickets: tickets_with_phases.len() as u32,
        phases: phase_count,
    })
}

/// Phase markdown. With `with_frontmatter` false this doubles as the body of
/// the copy-as-prompt export.
fn build_phase_markdown(
    epic: &Epic,
    ticket: &Ticket,
    phase: &Phase,
    ticket_order: usize,
    with_frontmatter: bool,
) -> String {
    let mut md = String::new();
    if with_frontmatter {
        md.push_str("---\n");
        md.push_str(&format!("id: {}\n", phase.id));
        md.push_str(&format!("ticket: {}\n", ticket.id));
        md.push_str(&format!("epic: {}\n", epic.id));
        md.push_str(&format!("order: {:02}-{:02}\n", ticket_order, phase.order));
        md.push_str(&format!("status: {}\n", status_str(&phase.status)));
        md.push_str(&format!(
            "external_status: {}\n",
            if phase.status == PhaseStatus::Passed { "done" } else { "pending" }
        ));
        md.push_str(&format!("title: {}\n", yaml_quote(&phase.title)));
        md.push_str("---\n\n");
    }

    md.push_str(&format!("# {}\n\n{}\n", phase.title, phase.description));
    md.push_str(&format!("\n## Objective\n\n{}\n", phase.plan.objective));

    if !phase.plan.steps.is_empty() {
        md.push_str("\n## Steps\n\n");
        let mut steps = phase.plan.steps.clone();
        steps.sort_by_key(|s| s.order);
        for step in &steps {
            md.push_str(&format!("{}. {}", step.order, step.description));
            if !step.file_targets.is_empty() {
                md.push_str(&format!("  \n   Files: `{}`", step.file_targets.join("`, `")));
            }
            md.push('\n');
        }
    }

    let file_section = |title: &str, ops: &[FileOperation], md: &mut String| {
        if !ops.is_empty() {
            md.push_str(&format!("\n## {}\n\n", title));
            for op in ops {
                md.push_str(&format!("- `{}` — {}\n", op.path, op.description));
            }
        }
    };
    file_section("Files to Create", &phase.plan.files_to_create, &mut md);
    file_section("Files to Modify", &phase.plan.files_to_modify, &mut md);
    if !phase.plan.files_to_delete.is_empty() {
        md.push_str("\n## Files to Delete\n\n");
        for f in &phase.plan.files_to_delete {
            md.push_str(&format!("- `{}`\n", f));
        }
    }
    if !phase.plan.context_files.is_empty() {
        md.push_str("\n## Context Files (read first)\n\n");
        for f in &phase.plan.context_files {
            md.push_str(&format!("- `{}`\n", f));
        }
    }
    if !phase.plan.test_strategy.trim().is_empty() {
        md.push_str(&format!("\n## Test Strategy\n\n{}\n", phase.plan.test_strategy));
    }
    if !ticket.acceptance_criteria.is_empty() {
        md.push_str("\n## Done when (ticket acceptance criteria)\n\n");
        for ac in &ticket.acceptance_criteria {
            md.push_str(&format!("- {}\n", ac));
        }
    }
    if with_frontmatter {
        md.push_str(&format!(
            "\n## Completion protocol\n\nSet `external_status: done` in this file's frontmatter and in `status.json`, then commit with the trailer `Plan-Phase: {}/{}/{}`.\n",
            epic.id, ticket.id, phase.id
        ));
    }
    md
}

/// Self-contained prompt for pasting a single phase into any tool.
pub fn build_phase_prompt(epic: &Epic, ticket: &Ticket, phase: &Phase, ticket_order: usize) -> String {
    let objective = epic.enhanced_objective.as_deref().unwrap_or(&epic.objective);
    format!(
        "You are implementing one phase of a larger planned project.\n\n## Project objective\n\n{}\n\n## Ticket: {}\n\n{}\n\n{}\n\nStay strictly within this phase's scope. When done, summarize exactly which files you created or modified.",
        objective,
        ticket.title,
        ticket.description,
        build_phase_markdown(epic, ticket, phase, ticket_order, false),
    )
}

fn write_agents_section(epic: &Epic, target_dir: &str) -> Result<()> {
    let path = PathBuf::from(target_dir).join("AGENTS.md");
    let section = format!(
        "{begin}\n## Orchestrated plan available\n\nThis repository contains a machine-readable implementation plan at `{dir}/`\n(epic: {title}). Before implementing anything from that plan, read\n`{dir}/README.md` for the execution protocol, then execute phases in order.\n{end}",
        begin = AGENTS_BEGIN,
        end = AGENTS_END,
        dir = BUNDLE_DIR,
        title = if epic.title.is_empty() { &epic.objective } else { &epic.title },
    );

    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let updated = if let (Some(start), Some(end)) = (existing.find(AGENTS_BEGIN), existing.find(AGENTS_END)) {
        // Replace the managed section, never touching user content
        let after = end + AGENTS_END.len();
        format!("{}{}{}", &existing[..start], section, &existing[after..])
    } else if existing.trim().is_empty() {
        format!("# Agent Instructions\n\n{}\n", section)
    } else {
        format!("{}\n\n{}\n", existing.trim_end(), section)
    };
    write_atomic(&path, updated.as_bytes())?;
    Ok(())
}

fn write_claude_command(target_dir: &str) -> Result<()> {
    let dir = PathBuf::from(target_dir).join(".claude").join("commands");
    ensure_dir(&dir)?;
    let body = format!(
        r#"---
description: Execute a phase from the orchestrated plan bundle in {dir}
---
Read `{dir}/README.md` and `{dir}/status.json` first.

Target phase: $ARGUMENTS
- If $ARGUMENTS is empty or "next": pick the first phase in `{dir}/phases/`
  (file-name order) whose `external_status` is `pending` and whose ticket's
  dependencies are complete.
- Otherwise treat $ARGUMENTS as a phase id or phase file path.

Execute that phase exactly as written (steps, file targets, done-when),
staying within its scope. Then follow the completion protocol from the
phase file: update its frontmatter and `status.json`, and commit with the
`Plan-Phase:` trailer.
"#,
        dir = BUNDLE_DIR,
    );
    write_atomic(&dir.join("claudorch-execute-phase.md"), body.as_bytes())?;
    Ok(())
}

// ─── External tool detection & launch ────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TargetAvailability {
    pub id: String,
    pub label: String,
    pub available: bool,
}

fn bin_available(bin: &str) -> bool {
    #[cfg(target_os = "windows")]
    let probe = std::process::Command::new("where").arg(bin).output();
    #[cfg(not(target_os = "windows"))]
    let probe = std::process::Command::new("which").arg(bin).output();
    matches!(probe, Ok(out) if out.status.success())
}

pub fn detect_targets() -> Vec<TargetAvailability> {
    let candidates = [
        ("claude", "Claude Code (terminal)"),
        ("cursor", "Cursor"),
        ("code", "VS Code"),
        ("codex", "Codex CLI (terminal)"),
        ("gemini", "Gemini CLI (terminal)"),
    ];
    candidates
        .iter()
        .map(|(id, label)| TargetAvailability {
            id: id.to_string(),
            label: label.to_string(),
            available: bin_available(id),
        })
        .collect()
}

/// Open the target tool in/on the project directory. Terminal CLIs get a
/// fresh terminal window in the project dir; editors open the folder.
pub fn launch_target(target: &str, target_dir: &str) -> Result<()> {
    let is_terminal_cli = matches!(target, "claude" | "codex" | "gemini");
    let is_editor = matches!(target, "cursor" | "code");
    if !is_terminal_cli && !is_editor {
        anyhow::bail!("Unknown hand-off target: {}", target);
    }

    #[cfg(target_os = "windows")]
    {
        if is_terminal_cli {
            // Prefer Windows Terminal; fall back to a classic console window.
            let wt = std::process::Command::new("wt")
                .args(["-d", target_dir, "cmd", "/k", target])
                .spawn();
            if wt.is_err() {
                std::process::Command::new("cmd")
                    .args(["/C", "start", "", "/D", target_dir, "cmd", "/K", target])
                    .spawn()?;
            }
        } else {
            std::process::Command::new("cmd")
                .args(["/C", "start", "", target, "."])
                .current_dir(target_dir)
                .spawn()?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Best effort on other platforms: editors open the dir; terminal
        // CLIs can't reliably get a new window without knowing the terminal
        // emulator, so launch the binary detached in the project dir.
        std::process::Command::new(target)
            .arg(if is_editor { "." } else { "" })
            .current_dir(target_dir)
            .spawn()?;
    }

    Ok(())
}

// ─── Status sync (external work → local verification) ──────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ExternalPhaseStatus {
    pub phase_id: String,
    pub ticket_id: String,
    pub title: String,
    pub internal_status: String,
    pub external_done: bool,
    /// "status_json", "git_trailer", or "both"
    pub source: String,
}

pub fn sync_status(
    epic: &Epic,
    tickets_with_phases: &[(Ticket, Vec<Phase>)],
    target_dir: &str,
) -> Result<Vec<ExternalPhaseStatus>> {
    // Signal 1: status.json external_status flags
    let mut done_in_status: HashSet<String> = HashSet::new();
    let status_path = bundle_root(target_dir).join("status.json");
    if let Ok(content) = std::fs::read_to_string(&status_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(phases) = json.get("phases").and_then(|p| p.as_array()) {
                for p in phases {
                    let done = p.get("external_status").and_then(|v| v.as_str()) == Some("done");
                    if done {
                        if let Some(id) = p.get("id").and_then(|v| v.as_str()) {
                            done_in_status.insert(id.to_string());
                        }
                    }
                }
            }
        }
    }

    // Signal 2: Plan-Phase commit trailers
    let mut done_in_git: HashSet<String> = HashSet::new();
    let grep = format!("Plan-Phase: {}/", epic.id);
    if let Ok(out) = std::process::Command::new("git")
        .args(["log", "--all", &format!("--grep={}", grep), "--format=%B"])
        .current_dir(target_dir)
        .output()
    {
        let body = String::from_utf8_lossy(&out.stdout);
        for line in body.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("Plan-Phase:") {
                let parts: Vec<&str> = rest.trim().split('/').collect();
                if parts.len() == 3 && parts[0] == epic.id {
                    done_in_git.insert(parts[2].to_string());
                }
            }
        }
    }

    let mut report = Vec::new();
    for (ticket, phases) in tickets_with_phases {
        for phase in phases {
            let in_status = done_in_status.contains(&phase.id);
            let in_git = done_in_git.contains(&phase.id);
            if !in_status && !in_git {
                continue;
            }
            report.push(ExternalPhaseStatus {
                phase_id: phase.id.clone(),
                ticket_id: ticket.id.clone(),
                title: phase.title.clone(),
                internal_status: status_str(&phase.status),
                external_done: true,
                source: match (in_status, in_git) {
                    (true, true) => "both",
                    (true, false) => "status_json",
                    _ => "git_trailer",
                }
                .to_string(),
            });
        }
    }
    Ok(report)
}
