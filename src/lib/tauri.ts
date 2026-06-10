import { invoke, Channel } from "@tauri-apps/api/core";
import type { Epic } from "../types/epic";
import type { AppConfig, ModelConfig, ClaudeModel, PlanInfo, SubscriptionPlan, UsageSummary } from "../types/config";
import type { FrontendStreamEvent } from "../types/execution";

// ─── System Commands ─────────────────────────────────────────────────────────

export async function checkClaudeInstalled(): Promise<boolean> {
  return invoke("check_claude_installed");
}

export async function getClaudeVersion(): Promise<string> {
  return invoke("get_claude_version");
}

export async function selectProjectDirectory(): Promise<string | null> {
  return invoke("select_project_directory");
}

export async function getAvailableModels(): Promise<ClaudeModel[]> {
  return invoke("get_available_models");
}

export interface AuthStatus {
  installed: boolean;
  version: string | null;
  logged_in: boolean;
  auth_method: string | null;
  email: string | null;
  subscription_type: string | null;
  token_valid: boolean;
  error: string | null;
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  return invoke("check_auth_status");
}

export async function launchAuthLogin(): Promise<void> {
  return invoke("launch_auth_login");
}

export async function detectSubscriptionPlan(): Promise<PlanInfo> {
  return invoke("detect_subscription_plan");
}

export async function getPlanInfo(plan: SubscriptionPlan): Promise<PlanInfo> {
  return invoke("get_plan_info", { plan });
}

// ─── Config Commands ─────────────────────────────────────────────────────────

export async function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
}

export async function saveConfig(config: AppConfig, targetDir: string): Promise<void> {
  return invoke("save_config", { config, targetDir });
}

export async function loadConfig(targetDir: string): Promise<AppConfig | null> {
  return invoke("load_config", { targetDir });
}

export async function getUsageSummary(targetDir: string): Promise<UsageSummary> {
  return invoke("get_usage_summary", { targetDir });
}

// ─── Provider (BYO) Commands ─────────────────────────────────────────────────

export async function getProviderProfiles(): Promise<import("../types/config").ProviderInfo[]> {
  return invoke("get_provider_profiles");
}

export async function setProviderKey(providerId: string, key: string): Promise<void> {
  return invoke("set_provider_key", { providerId, key });
}

export async function testProvider(
  providerId: string,
  model: string,
  targetDir?: string
): Promise<import("../types/config").ProviderTestResult> {
  return invoke("test_provider", { providerId, model, targetDir: targetDir ?? null });
}

export async function listProviderModels(providerId: string): Promise<string[]> {
  return invoke("list_provider_models", { providerId });
}

export async function getDefaultConfig(): Promise<AppConfig> {
  return invoke("get_default_config");
}

export async function loadGeneralConfig(): Promise<AppConfig> {
  return invoke("load_general_config");
}

export async function saveGeneralConfig(config: AppConfig): Promise<void> {
  return invoke("save_general_config", { config });
}

// ─── Epic Commands ───────────────────────────────────────────────────────────

export async function createEpic(
  objective: string,
  targetDir: string,
  modelConfig: ModelConfig
): Promise<Epic> {
  return invoke("create_epic", { objective, targetDir, modelConfig });
}

export async function getEpic(epicId: string, targetDir: string): Promise<Epic> {
  return invoke("get_epic", { epicId, targetDir });
}

export async function listEpics(targetDir: string): Promise<Epic[]> {
  return invoke("list_epics", { targetDir });
}

export async function updateEpicStatus(
  epicId: string,
  targetDir: string,
  status: string
): Promise<Epic> {
  return invoke("update_epic_status", { epicId, targetDir, status });
}

export async function deleteEpic(epicId: string, targetDir: string): Promise<void> {
  return invoke("delete_epic", { epicId, targetDir });
}

export async function renameEpic(epicId: string, targetDir: string, newTitle: string): Promise<Epic> {
  return invoke("rename_epic", { epicId, targetDir, newTitle });
}

// ─── Data Retrieval ──────────────────────────────────────────────────────────

import type { Ticket, Phase, Spec } from "../types/epic";

export interface EpicFull {
  epic: Epic;
  specs: Spec[];
  tickets: Ticket[];
  phases_by_ticket: Record<string, Phase[]>;
}

export async function loadEpicFull(epicId: string, targetDir: string): Promise<EpicFull> {
  return invoke("load_epic_full", { epicId, targetDir });
}

export async function loadTicketsForEpic(epicId: string, targetDir: string): Promise<Ticket[]> {
  return invoke("load_tickets_for_epic", { epicId, targetDir });
}

export async function loadPhasesForTicket(epicId: string, ticketId: string, targetDir: string): Promise<Phase[]> {
  return invoke("load_phases_for_ticket", { epicId, ticketId, targetDir });
}

export async function loadSpecsForEpic(epicId: string, targetDir: string): Promise<Spec[]> {
  return invoke("load_specs_for_epic", { epicId, targetDir });
}

// ─── Filesystem Commands ────────────────────────────────────────────────────

export interface FileTreeEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  children: FileTreeEntry[];
}

export async function listDirectoryTree(path: string, maxDepth: number = 4): Promise<FileTreeEntry[]> {
  return invoke("list_directory_tree", { path, maxDepth });
}

// ─── Planning Commands (Interactive Steps) ──────────────────────────────────

export function createStreamChannel(
  onEvent: (event: FrontendStreamEvent) => void
): Channel<FrontendStreamEvent> {
  const channel = new Channel<FrontendStreamEvent>();
  channel.onmessage = onEvent;
  return channel;
}

import type { ClarifyingQA } from "../types/epic";

// Step 1: Scout codebase + generate questions
export async function startScouting(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("start_scouting", { epicId, targetDir, channel });
}

// Step 2: Submit answers
export async function submitAnswers(
  epicId: string,
  targetDir: string,
  answers: ClarifyingQA[]
): Promise<Epic> {
  return invoke("submit_answers", { epicId, targetDir, answers });
}

// Step 2b: Request more questions
export async function requestMoreQuestions(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("request_more_questions", { epicId, targetDir, channel });
}

// Step 2c: One conversational clarify turn — persists answers, then the
// model produces the next 1-2 questions or signals it has enough.
export async function continueClarification(
  epicId: string,
  targetDir: string,
  answers: ClarifyingQA[],
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("continue_clarification", { epicId, targetDir, answers, channel });
}

// Step 3: Generate specs
export async function generateSpecs(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("generate_specs", { epicId, targetDir, channel });
}

// Step 3b: Regenerate a spec with feedback
export async function regenerateSpec(
  epicId: string,
  targetDir: string,
  specType: string,
  feedback: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("regenerate_spec", { epicId, targetDir, specType, feedback, channel });
}

// Step 3c: Approve specs
export async function approveSpecs(epicId: string, targetDir: string): Promise<Epic> {
  return invoke("approve_specs", { epicId, targetDir });
}

// Step 4: Decompose tickets
export async function decomposeTickets(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("decompose_tickets", { epicId, targetDir, channel });
}

export async function planPhases(
  epicId: string,
  ticketId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("plan_phases", { epicId, ticketId, targetDir, channel });
}

// Step 4b: Approve tickets
export async function approveTickets(epicId: string, targetDir: string): Promise<Epic> {
  return invoke("approve_tickets", { epicId, targetDir });
}

// Step 5: Plan all phases
export async function planAllPhases(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("plan_all_phases", { epicId, targetDir, channel });
}

// Step 5b: Approve phases (mark ready)
export async function approvePhases(epicId: string, targetDir: string): Promise<Epic> {
  return invoke("approve_phases", { epicId, targetDir });
}

// ─── Execution Commands (Streaming) ──────────────────────────────────────────

export async function executePhase(
  epicId: string,
  ticketId: string,
  phaseId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("execute_phase", {
    epicId,
    ticketId,
    phaseId,
    targetDir,
    channel,
  });
}

export async function executeTicket(
  epicId: string,
  ticketId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("execute_ticket", { epicId, ticketId, targetDir, channel });
}

export async function executeEpic(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("execute_epic", { epicId, targetDir, channel });
}

export async function stopExecution(): Promise<void> {
  return invoke("stop_execution");
}

export async function cancelExecution(): Promise<void> {
  return invoke("cancel_execution");
}

export async function respondToApproval(requestId: string, approved: boolean): Promise<void> {
  return invoke("respond_to_approval", { requestId, approved });
}

export async function reviewPhaseWork(
  epicId: string,
  ticketId: string,
  phaseId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("review_phase_work", { epicId, ticketId, phaseId, targetDir, channel });
}

export async function runSupervisedEpic(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("run_supervised_epic", { epicId, targetDir, channel });
}

// ─── Hand-off Commands ───────────────────────────────────────────────────────

export interface BundleSummary {
  bundle_dir: string;
  files_written: number;
  tickets: number;
  phases: number;
}

export interface TargetAvailability {
  id: string;
  label: string;
  available: boolean;
}

export interface ExternalPhaseStatus {
  phase_id: string;
  ticket_id: string;
  title: string;
  internal_status: string;
  external_done: boolean;
  source: string;
}

export async function generateHandoffBundle(
  epicId: string,
  targetDir: string
): Promise<BundleSummary> {
  return invoke("generate_handoff_bundle", { epicId, targetDir });
}

export async function detectHandoffTargets(): Promise<TargetAvailability[]> {
  return invoke("detect_handoff_targets");
}

export async function launchHandoffTarget(target: string, targetDir: string): Promise<void> {
  return invoke("launch_handoff_target", { target, targetDir });
}

export async function buildHandoffPhasePrompt(
  epicId: string,
  ticketId: string,
  phaseId: string,
  targetDir: string
): Promise<string> {
  return invoke("build_handoff_phase_prompt", { epicId, ticketId, phaseId, targetDir });
}

export async function syncHandoffStatus(
  epicId: string,
  targetDir: string
): Promise<ExternalPhaseStatus[]> {
  return invoke("sync_handoff_status", { epicId, targetDir });
}

// ─── Verification Commands (Streaming) ───────────────────────────────────────

export async function verifyPhase(
  epicId: string,
  ticketId: string,
  phaseId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("verify_phase", {
    epicId,
    ticketId,
    phaseId,
    targetDir,
    channel,
  });
}

export async function respondToReviewGate(requestId: string, decision: string): Promise<void> {
  return invoke("respond_to_review_gate", { requestId, decision });
}

export async function retryPhase(
  epicId: string,
  ticketId: string,
  phaseId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("retry_phase", { epicId, ticketId, phaseId, targetDir, channel });
}

export async function generatePlanQuestionnaire(
  epicId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<{ questions: Array<{ question: string; context: string; category: string }> }> {
  const channel = createStreamChannel(onEvent);
  return invoke("generate_plan_questionnaire", { epicId, targetDir, channel });
}

export async function submitPlanValidation(
  epicId: string,
  targetDir: string,
  allCorrect: boolean,
): Promise<void> {
  return invoke("submit_plan_validation", { epicId, targetDir, allCorrect });
}

export async function reviewPlanCoherency(
  epicId: string,
  targetDir: string,
  scope: "specs" | "tickets" | "phases",
  focus: string | null,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("review_plan_coherency", { epicId, targetDir, scope, focus, channel });
}

export async function verifyTicket(
  epicId: string,
  ticketId: string,
  targetDir: string,
  onEvent: (event: FrontendStreamEvent) => void
): Promise<void> {
  const channel = createStreamChannel(onEvent);
  return invoke("verify_ticket", { epicId, ticketId, targetDir, channel });
}

// ─── Chat Commands ──────────────────────────────────────────────────────────

import type { ContextSnippet, ImpactAnalysis, ChatHistoryEntry } from "../types/chat";

export async function chatAsk(
  epicId: string,
  targetDir: string,
  message: string,
  contextSnippets: ContextSnippet[],
  conversationHistory: ChatHistoryEntry[],
  onEvent: (event: FrontendStreamEvent) => void
): Promise<string> {
  const channel = createStreamChannel(onEvent);
  return invoke("chat_ask", {
    epicId, targetDir, message, contextSnippets, conversationHistory, channel,
  });
}

export async function chatRefineCheck(
  epicId: string,
  targetDir: string,
  message: string,
  contextSnippets: ContextSnippet[],
  conversationHistory: ChatHistoryEntry[],
  onEvent: (event: FrontendStreamEvent) => void
): Promise<ImpactAnalysis> {
  const channel = createStreamChannel(onEvent);
  return invoke("chat_refine_check", {
    epicId, targetDir, message, contextSnippets, conversationHistory, channel,
  });
}

export async function chatRefineApply(
  epicId: string,
  targetDir: string,
  message: string,
  contextSnippets: ContextSnippet[],
  impactAnalysis: ImpactAnalysis,
  conversationHistory: ChatHistoryEntry[],
  onEvent: (event: FrontendStreamEvent) => void
): Promise<string> {
  const channel = createStreamChannel(onEvent);
  return invoke("chat_refine_apply", {
    epicId, targetDir, message, contextSnippets, impactAnalysis,
    conversationHistory, channel,
  });
}
