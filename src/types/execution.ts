// ─── Execution Stream Types ──────────────────────────────────────────────────

export type FrontendStreamEvent =
  | { kind: "text"; content: string }
  | { kind: "thinking"; content: string }
  | { kind: "tool_use"; tool: string; input: unknown }
  | { kind: "tool_result"; tool: string; output: string }
  | { kind: "status"; message: string }
  | { kind: "cost"; usd: number }
  | { kind: "complete"; result: string; session_id: string; total_cost_usd: number }
  | { kind: "error"; message: string }
  // Planning progress events
  | { kind: "spec_saved"; spec_id: string; spec_type: string; title: string }
  // Orchestration events (supervised execution)
  | { kind: "phase_started"; phase_id: string; phase_title: string; ticket_id: string; ticket_title: string; phase_order: number; total_phases: number }
  | { kind: "phase_completed"; phase_id: string; status: string; score: number; cost_usd: number }
  | { kind: "ticket_started"; ticket_id: string; ticket_title: string; ticket_order: number; total_tickets: number }
  | { kind: "ticket_completed"; ticket_id: string; status: string }
  | { kind: "verification_result"; phase_id: string; score: number; passed: boolean; summary: string; checks: string[] }
  | { kind: "remediation_started"; phase_id: string; attempt: number; max_attempts: number }
  // Stop/Resume events
  | { kind: "execution_stopped"; reason: string; last_completed_phase_id: string | null }
  // Command Approval events
  | { kind: "approval_request"; request_id: string; command: string; context: string; phase_id: string }
  // Review Gate events
  | { kind: "phase_review_ready"; request_id: string; phase_id: string; phase_title: string; score: number; status: string; checks: string[]; suggested_fixes: string[] };
