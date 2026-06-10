import { create } from "zustand";
import {
  loadEpicFull,
  runSupervisedEpic,
  stopExecution,
  cancelExecution,
  respondToApproval,
} from "../lib/tauri";
import type { FrontendStreamEvent } from "../types/execution";
import { appendCoalesced } from "../lib/streamBridge";

export interface PhaseInfo {
  id: string;
  title: string;
  ticketId: string;
  ticketTitle: string;
  order: number;
  status: "pending" | "executing" | "verifying" | "passed" | "failed" | "remediating";
  score?: number;
  costUsd?: number;
  verificationSummary?: string;
  verificationChecks?: string[];
}

export interface TicketInfo {
  id: string;
  title: string;
  order: number;
  status: "pending" | "executing" | "done" | "failed";
}

export interface ApprovalRequest {
  requestId: string;
  command: string;
  context: string;
  phaseId: string;
}

interface ExecutionStore {
  // Core state
  isRunning: boolean;
  isStopping: boolean;
  isDone: boolean;
  currentEpicId: string | null;
  currentPhaseId: string | null;
  epicTitle: string;
  targetDir: string | null;

  // Phase/ticket tracking
  phases: PhaseInfo[];
  tickets: TicketInfo[];
  streamEvents: FrontendStreamEvent[];
  totalCostUsd: number;
  error: string | null;

  // Approval
  pendingApproval: ApprovalRequest | null;

  // Review Gate
  pendingReviewGate: {
    requestId: string;
    phaseId: string;
    phaseTitle: string;
    score: number;
    status: string;
    checks: string[];
    suggestedFixes: string[];
  } | null;

  // Actions
  initFromEpic: (epicId: string, targetDir: string) => Promise<void>;
  handleEvent: (event: FrontendStreamEvent) => void;
  start: (epicId: string, targetDir: string) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  approveCommand: (requestId: string, approved: boolean) => Promise<void>;
  respondToReviewGate: (requestId: string, decision: string) => Promise<void>;
  reset: () => void;
}

// ─── Streaming buffer for smooth token-by-token rendering ──────────────────
// Buffer events and flush via RAF — one render per frame for smooth streaming.
let _eventBuffer: FrontendStreamEvent[] = [];
let _rafId: number | null = null;

function bufferStreamEvent(event: FrontendStreamEvent) {
  _eventBuffer.push(event);
  if (_rafId === null) {
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      const batch = _eventBuffer;
      _eventBuffer = [];
      useExecutionStore.setState((s) => ({
        // Coalesce token deltas so the list doesn't grow per streamed token
        streamEvents: appendCoalesced(s.streamEvents, batch),
      }));
    });
  }
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  isRunning: false,
  isStopping: false,
  isDone: false,
  currentEpicId: null,
  currentPhaseId: null,
  epicTitle: "",
  targetDir: null,
  phases: [],
  tickets: [],
  streamEvents: [],
  totalCostUsd: 0,
  error: null,
  pendingApproval: null,
  pendingReviewGate: null,

  initFromEpic: async (epicId, targetDir) => {
    try {
      const data = await loadEpicFull(epicId, targetDir);
      const epicTitle = data.epic.title || data.epic.objective.slice(0, 60);

      // Build phase and ticket info from persisted disk state
      const phases: PhaseInfo[] = [];
      const ticketInfos: TicketInfo[] = [];

      for (let ti = 0; ti < data.tickets.length; ti++) {
        const ticket = data.tickets[ti];
        const ticketPhases = data.phases_by_ticket[ticket.id] || [];

        ticketInfos.push({
          id: ticket.id,
          title: ticket.title,
          order: ti + 1,
          status: ticket.status === "done" ? "done" : ticket.status === "failed" ? "failed" : "pending",
        });

        for (const phase of ticketPhases) {
          phases.push({
            id: phase.id,
            title: phase.title,
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            order: phase.order,
            status: phase.status === "passed" ? "passed" : phase.status === "failed" ? "failed" : "pending",
            score: phase.verification?.overall_score,
            costUsd: phase.cost_usd,
          });
        }
      }

      const allDone = phases.length > 0 && phases.every((p) => p.status === "passed");

      set({
        currentEpicId: epicId,
        targetDir,
        epicTitle,
        phases,
        tickets: ticketInfos,
        isDone: allDone,
        // Don't clear streamEvents if we're returning to a running execution
        ...(get().currentEpicId !== epicId ? { streamEvents: [], totalCostUsd: 0, error: null } : {}),
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  handleEvent: (event) => {
    const state = get();

    switch (event.kind) {
      case "phase_started":
        set({
          currentPhaseId: event.phase_id,
          streamEvents: [], // Clear stream for new phase
          phases: state.phases.map((p) =>
            p.id === event.phase_id ? { ...p, status: "executing" as const } : p
          ),
          tickets: state.tickets.map((t) =>
            t.id === event.ticket_id ? { ...t, status: "executing" as const } : t
          ),
        });
        break;

      case "phase_completed":
        set({
          phases: state.phases.map((p) =>
            p.id === event.phase_id
              ? { ...p, status: event.status as PhaseInfo["status"], score: event.score, costUsd: event.cost_usd }
              : p
          ),
          totalCostUsd: state.totalCostUsd + event.cost_usd,
        });
        break;

      case "ticket_completed":
        set({
          tickets: state.tickets.map((t) =>
            t.id === event.ticket_id ? { ...t, status: event.status as TicketInfo["status"] } : t
          ),
        });
        break;

      case "verification_result":
        set({
          phases: state.phases.map((p) =>
            p.id === event.phase_id
              ? { ...p, status: "verifying" as const, score: event.score, verificationSummary: event.summary, verificationChecks: event.checks }
              : p
          ),
        });
        break;

      case "remediation_started":
        set({
          phases: state.phases.map((p) =>
            p.id === event.phase_id ? { ...p, status: "remediating" as const } : p
          ),
        });
        break;

      case "execution_stopped":
        set({
          isRunning: false,
          isStopping: false,
          isDone: false,
        });
        break;

      case "approval_request":
        set({
          pendingApproval: {
            requestId: event.request_id,
            command: event.command,
            context: event.context,
            phaseId: event.phase_id,
          },
        });
        break;

      case "phase_review_ready":
        set({
          pendingReviewGate: {
            requestId: event.request_id,
            phaseId: event.phase_id,
            phaseTitle: event.phase_title,
            score: event.score,
            status: event.status,
            checks: event.checks,
            suggestedFixes: event.suggested_fixes,
          },
        });
        break;

      case "cost":
        set({ totalCostUsd: state.totalCostUsd + event.usd });
        break;

      case "error":
        set({ error: event.message });
        break;

      case "complete":
        // A single phase completed (from the Claude process)
        break;

      default:
        break;
    }

    // Buffer stream event for RAF-based flush (smooth token streaming)
    bufferStreamEvent(event);
  },

  start: async (epicId, targetDir) => {
    set({
      isRunning: true,
      isStopping: false,
      isDone: false,
      error: null,
      currentEpicId: epicId,
      targetDir,
    });

    try {
      await runSupervisedEpic(epicId, targetDir, get().handleEvent);

      // Execution completed (or was stopped — the event handler sets isRunning=false for stops)
      const phases = get().phases;
      const allPassed = phases.every((p) => p.status === "passed");
      set({
        isRunning: false,
        isDone: allPassed,
      });
    } catch (e) {
      set({
        isRunning: false,
        error: String(e),
      });
    }
  },

  stop: async () => {
    set({ isStopping: true });
    await stopExecution();
  },

  cancel: async () => {
    await cancelExecution();
    set({ isRunning: false, isStopping: false });
  },

  approveCommand: async (requestId, approved) => {
    set({ pendingApproval: null });
    await respondToApproval(requestId, approved);
  },

  respondToReviewGate: async (requestId, decision) => {
    set({ pendingReviewGate: null });
    const { respondToReviewGate } = await import("../lib/tauri");
    await respondToReviewGate(requestId, decision);
  },

  reset: () =>
    set({
      isRunning: false,
      isStopping: false,
      isDone: false,
      currentEpicId: null,
      currentPhaseId: null,
      epicTitle: "",
      targetDir: null,
      phases: [],
      tickets: [],
      streamEvents: [],
      totalCostUsd: 0,
      error: null,
      pendingApproval: null,
      pendingReviewGate: null,
    }),
}));
