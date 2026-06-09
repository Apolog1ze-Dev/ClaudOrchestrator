// ─── Epic Types ──────────────────────────────────────────────────────────────
// Mirrored from src-tauri/src/types/epic.rs

export type EpicStatus =
  | "draft"
  | "speccing"
  | "decomposing"
  | "planning"
  | "ready"
  | "executing"
  | "verifying"
  | "completed"
  | "failed"
  | "paused";

export type PlanningStep =
  | "draft"
  | "scouting"
  | "clarifying"
  | "generating_specs"
  | "specs_review"
  | "generating_tickets"
  | "tickets_review"
  | "generating_phases"
  | "phases_review"
  | "plan_validation"
  | "ready";

export interface PaletteColor {
  name: string;
  hex: string;
}

export interface QuestionOption {
  label: string;
  description: string;
  /** Single hex color code for simple color questions (e.g. "#8B5CF6") */
  color?: string;
  /** Full color palette — array of {name, hex} pairs for complete palette display */
  palette?: PaletteColor[];
}

export interface ClarifyingQA {
  question: string;
  answer: string;
  asked_at: string;
  context: string;
  options: QuestionOption[];
  multi_select: boolean;
}

export interface Epic {
  id: string;
  title: string;
  objective: string;
  status: EpicStatus;
  planning_step: PlanningStep;
  clarifying_questions: ClarifyingQA[];
  spec_ids: string[];
  ticket_ids: string[];
  model_config: import("./config").ModelConfig;
  created_at: string;
  updated_at: string;
  target_dir: string;
  total_estimated_phases: number;
  completed_phases: number;
  total_cost_usd: number;
}

// ─── Ticket Types ────────────────────────────────────────────────────────────

export type TicketStatus =
  | "todo"
  | "planning"
  | "ready"
  | "in_progress"
  | "verifying"
  | "done"
  | "failed"
  | "blocked";

export type Complexity = "trivial" | "small" | "medium" | "large" | "epic";

export interface TicketScope {
  primary_files: string[];
  reference_files: string[];
  directories: string[];
  technologies: string[];
}

export interface Ticket {
  id: string;
  epic_id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  status: TicketStatus;
  priority: number;
  dependencies: string[];
  scope: TicketScope;
  phase_ids: string[];
  estimated_complexity: Complexity;
  cost_usd: number;
  created_at: string;
  updated_at: string;
}

// ─── Phase Types ─────────────────────────────────────────────────────────────

export type PhaseStatus =
  | "planned"
  | "executing"
  | "verifying"
  | "passed"
  | "failed"
  | "remediating";

export interface PlanStep {
  order: number;
  description: string;
  file_targets: string[];
  tool: string;
}

export interface FileOperation {
  path: string;
  description: string;
  references: string[];
}

export interface PhasePlan {
  objective: string;
  steps: PlanStep[];
  files_to_create: FileOperation[];
  files_to_modify: FileOperation[];
  files_to_delete: string[];
  test_strategy: string;
  rollback_strategy: string;
  context_files: string[];
  reasoning: string;
  mermaid_diagram?: string;
  /** Spec file paths the implementer should read for full details */
  reference_docs?: string[];
}

export interface PhaseExecution {
  session_id?: string;
  started_at: string;
  completed_at?: string;
  result: "success" | "error" | "interrupted";
  cost_usd: number;
  files_changed: string[];
  git_diff?: string;
  error_message?: string;
}

export interface Phase {
  id: string;
  ticket_id: string;
  epic_id: string;
  order: number;
  title: string;
  description: string;
  plan: PhasePlan;
  status: PhaseStatus;
  execution?: PhaseExecution;
  verification?: PhaseVerification;
  remediation_attempts: number;
  max_remediation_attempts: number;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
  updated_at: string;
}

// ─── Spec Types ──────────────────────────────────────────────────────────────

export type SpecType =
  | "prd"
  | "tech_spec"
  | "architecture"
  | "api_spec"
  | "design_spec"
  | "custom";

export interface MermaidDiagram {
  id: string;
  title: string;
  diagram_type: string;
  content: string;
}

export interface Spec {
  id: string;
  epic_id: string;
  spec_type: SpecType;
  title: string;
  content: string;
  mermaid_diagrams: MermaidDiagram[];
  version: number;
  created_at: string;
  updated_at: string;
}

// ─── Verification Types ──────────────────────────────────────────────────────

export type VerificationStatus = "passed" | "failed" | "partial";

export type CheckType =
  | "spec_compliance"
  | "test"
  | "lint"
  | "typecheck"
  | "diff_review"
  | "acceptance_criteria";

export type Severity = "error" | "warning" | "info";

export interface VerificationCheck {
  name: string;
  check_type: CheckType;
  passed: boolean;
  details: string;
  severity: Severity;
}

export interface PhaseVerification {
  status: VerificationStatus;
  checks: VerificationCheck[];
  overall_score: number;
  reasoning: string;
  suggested_fixes: string[];
  verified_at: string;
}
