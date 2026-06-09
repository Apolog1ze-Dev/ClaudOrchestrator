import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useConfigStore } from "../stores/configStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import {
  loadEpicFull,
  deleteEpic,
  startScouting,
  submitAnswers,
  requestMoreQuestions,
  generateSpecs,
  approveSpecs,
  decomposeTickets,
  approveTickets,
  planAllPhases,
  approvePhases,
  cancelExecution,
  reviewPhaseWork,
  reviewPlanCoherency,
  retryPhase,
  generatePlanQuestionnaire,
  submitPlanValidation,
  saveConfig,
} from "../lib/tauri";
import type { EpicFull } from "../lib/tauri";
import type { FrontendStreamEvent } from "../types/execution";
import type { ClarifyingQA, PlanningStep } from "../types/epic";
import { useChatStore } from "../stores/chatStore";
import { extractChatNarrative } from "../lib/streamBridge";

export interface EpicContextValue {
  data: EpicFull | null;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  reload: () => Promise<void>;
  isProcessing: boolean;
  streamEvents: FrontendStreamEvent[];
  step: PlanningStep;
  activeModel: string;
  agentStatusLabel: string | null;

  // Step handlers
  handleStartScouting: () => Promise<void>;
  handleSubmitAnswers: (answers: ClarifyingQA[]) => Promise<void>;
  handleRequestMoreQuestions: () => Promise<void>;
  handleGenerateSpecs: () => Promise<void>;
  handleApproveSpecs: () => Promise<void>;
  handleApproveTickets: () => void;
  startPlanning: (mode: "detailed" | "quick") => Promise<void>;
  handleApprovePhases: () => Promise<void>;
  handleReviewWork: () => Promise<void>;
  handleReviewPlan: (scope: "specs" | "tickets" | "phases", focus?: string | null) => Promise<void>;
  handleRetryPhase: (ticketId: string, phaseId: string) => Promise<void>;
  handleCancel: () => Promise<void>;
  handleDelete: () => Promise<void>;

  // Planning mode dialog
  showPlanModeDialog: boolean;
  setShowPlanModeDialog: (show: boolean) => void;

  // Plan validation
  validationQuestions: Array<{ question: string; context: string; category: string }>;
  handleValidationComplete: (allCorrect: boolean) => Promise<void>;
}

const EpicContext = createContext<EpicContextValue | null>(null);

export function useEpicContext() {
  const ctx = useContext(EpicContext);
  if (!ctx) throw new Error("useEpicContext must be used within EpicProvider");
  return ctx;
}

export function useOptionalEpicContext() {
  return useContext(EpicContext);
}

export function EpicProvider({ children }: { children: React.ReactNode }) {
  const { epicId } = useParams<{ epicId: string }>();
  const navigate = useNavigate();
  const targetDir = useConfigStore((s) => s.targetDir);

  const [data, setData] = useState<EpicFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<FrontendStreamEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPlanModeDialog, setShowPlanModeDialog] = useState(false);
  const [validationQuestions, setValidationQuestions] = useState<Array<{ question: string; context: string; category: string }>>([]);
  const [agentStatusLabel, setAgentStatusLabel] = useState<string | null>(null);

  // ─── Streaming buffer ─────────────────────────────────────────────
  // Events arrive faster than React can render. Buffer in a ref and
  // schedule a single RAF to flush — gives ~60fps smooth streaming.
  const eventBufferRef = useRef<FrontendStreamEvent[]>([]);
  const allEventsRef = useRef<FrontendStreamEvent[]>([]);
  const rafRef = useRef<number | null>(null);

  const reload = useCallback(async () => {
    if (!epicId || !targetDir) return;
    try {
      const d = await loadEpicFull(epicId, targetDir);
      setData(d);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [epicId, targetDir]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  // Force agent panel open + load chat sessions when epic loads
  useEffect(() => {
    if (data?.epic.id && targetDir) {
      useWorkspaceStore.getState().setAgentPanelCollapsed(false);
      // Load persisted chat sessions
      useChatStore.getState().loadSessions(targetDir, data.epic.id).then(() => {
        const chatState = useChatStore.getState();
        // Only inject objective on initial epic creation (no prior sessions on disk)
        if (data.epic.objective && chatState.sessions.length === 0 && chatState.messages.length === 0) {
          chatState.injectObjective(data.epic.objective);
        }
      });
    }
  }, [data?.epic.id, targetDir]);

  // Auto-start scouting when epic is in "draft" state
  useEffect(() => {
    if (data?.epic.planning_step === "draft" && !isProcessing && targetDir && epicId) {
      handleStartScouting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.epic.planning_step]);

  // Poll for updates during phase planning
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const step = data?.epic.planning_step;
    if (step === "generating_phases" && isProcessing) {
      pollRef.current = setInterval(() => {
        reload();
      }, 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data?.epic.planning_step, isProcessing, reload]);

  // Populate workspace tabs when data changes
  const { openTab, setActiveTab } = useWorkspaceStore();
  useEffect(() => {
    if (!data) return;
    const step = data.epic.planning_step as PlanningStep;

    // Always keep a stream tab open during processing — force-activate it
    if (
      (step === "scouting" || step === "generating_specs" || step === "generating_tickets" || step === "generating_phases") &&
      isProcessing
    ) {
      const streamTitle =
        step === "scouting" ? "Scanning Codebase" :
        step === "generating_specs" ? "Generating Specs" :
        step === "generating_tickets" ? "Decomposing Tickets" :
        "Planning Phases";
      openTab({
        id: "stream:current",
        type: "stream",
        title: streamTitle,
        icon: "Terminal",
        epicId: data.epic.id,
      });
      // Only force-activate stream tab if agent panel is collapsed
      if (useWorkspaceStore.getState().agentPanelCollapsed) {
        setActiveTab("stream:current");
      }
    }

    // Clarifying step: also use the stream tab (questions render inline in StreamView)
    if (step === "clarifying" && !isProcessing) {
      openTab({
        id: "stream:current",
        type: "stream",
        title: "Agent Output",
        icon: "Terminal",
        epicId: data.epic.id,
      });
      if (useWorkspaceStore.getState().agentPanelCollapsed) {
        setActiveTab("stream:current");
      }
    }

    // Auto-open first spec during specs_review
    if (step === "specs_review" && data.specs.length > 0) {
      const firstSpec = data.specs[0];
      openTab({
        id: `spec:${firstSpec.id}`,
        type: "spec",
        title: firstSpec.title,
        icon: "FileText",
        epicId: data.epic.id,
        artifactId: firstSpec.id,
      });
    }

    // Open stream tab on initial load if there's an active step
    if (step === "draft" && !isProcessing) {
      openTab({
        id: "stream:current",
        type: "stream",
        title: "Agent Output",
        icon: "Terminal",
        epicId: data.epic.id,
      });
      setActiveTab("stream:current");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.epic.planning_step, isProcessing]);

  // Each event pushes to buffer. If no RAF is pending, schedule one.
  // When RAF fires, flush all buffered events to state in one render.
  const addEvent = useCallback((event: FrontendStreamEvent) => {
    eventBufferRef.current.push(event);
    allEventsRef.current.push(event);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const batch = eventBufferRef.current;
        eventBufferRef.current = [];
        setStreamEvents((prev) => [...prev, ...batch]);
      });
    }
  }, []);

  const clearStreamEvents = useCallback(() => {
    eventBufferRef.current = [];
    allEventsRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setStreamEvents([]);
  }, []);

  // ─── Step handlers ─────────────────────────────────────────────────

  const handleStartScouting = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setAgentStatusLabel("Scanning codebase...");
    clearStreamEvents();
    const chat = useChatStore.getState();
    chat.injectNarrative("Let me start by scanning your codebase to understand the project structure, tech stack, existing patterns, and dependencies. This will help me tailor everything to your project.");
    chat.setAgentWorking(true);

    try {
      await startScouting(epicId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setAgentStatusLabel(null);
      const c = useChatStore.getState();
      c.setAgentWorking(false);
      c.injectProgress("Codebase scanned", "scouting", "complete");
      const summary = extractChatNarrative(allEventsRef.current);
      if (summary) c.injectNarrative(summary);
      c.injectNarrative("I now have a good understanding of your project. Next, I'll ask you a few clarifying questions about design preferences, technical constraints, and implementation details so the plan is exactly what you need.");
    }
  };

  const prevAnswersRef = useRef<Set<string>>(new Set());

  const handleSubmitAnswers = async (answers: ClarifyingQA[]) => {
    if (!epicId || !targetDir) return;
    try {
      await submitAnswers(epicId, targetDir, answers);

      // Only inject NEWLY answered questions into chat (avoid duplicates)
      for (const qa of answers) {
        if (qa.answer.trim() && !prevAnswersRef.current.has(qa.question)) {
          useChatStore.getState().injectClarifyingQA(qa.question, qa.answer);
          prevAnswersRef.current.add(qa.question);
        }
      }

      const answeredCount = answers.filter((a) => a.answer.trim()).length;
      const totalQuestions = answers.length;

      if (answeredCount === 1 && totalQuestions === 1) {
        useChatStore.getState().injectNarrative("Thanks! Let me generate a few more targeted questions based on your answer.");
        setIsProcessing(true);
        setAgentStatusLabel("Generating follow-up questions...");
        useChatStore.getState().setAgentWorking(true);
        await requestMoreQuestions(epicId, targetDir, addEvent);
        // Reload BEFORE setting isProcessing false so ClarifyingChat remounts with fresh data
        await reload();
        setIsProcessing(false);
        setAgentStatusLabel(null);
        useChatStore.getState().setAgentWorking(false);
        return;
      }

      if (answeredCount === totalQuestions && totalQuestions > 1 && totalQuestions <= 8) {
        useChatStore.getState().injectNarrative("Got it. Let me see if there's anything else I need to clarify before moving forward.");
        setIsProcessing(true);
        setAgentStatusLabel("Generating follow-up questions...");
        useChatStore.getState().setAgentWorking(true);
        await requestMoreQuestions(epicId, targetDir, addEvent);
        await reload();
        setIsProcessing(false);
        setAgentStatusLabel(null);
        useChatStore.getState().setAgentWorking(false);
        return;
      }

      await reload();
    } catch (e) {
      setError(String(e));
      setIsProcessing(false);
    }
  };

  const handleRequestMoreQuestions = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setAgentStatusLabel("Generating follow-up questions...");
    useChatStore.getState().setAgentWorking(true);
    try {
      await requestMoreQuestions(epicId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setAgentStatusLabel(null);
      useChatStore.getState().setAgentWorking(false);
    }
  };

  const handleGenerateSpecs = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setAgentStatusLabel("Generating PRD...");
    clearStreamEvents();
    const chat = useChatStore.getState();
    chat.injectNarrative("Great, I have everything I need. I'll now generate detailed technical specifications — including a PRD, technical spec, and architecture overview — based on your objective and answers. These will serve as the blueprint for the implementation.");
    chat.setAgentWorking(true);

    // Wrap addEvent to intercept spec_saved and status events for incremental updates
    const specAddEvent = (event: FrontendStreamEvent) => {
      addEvent(event);
      if (event.kind === "spec_saved") {
        // Reload data so the new spec appears in the explorer immediately
        reload();
      }
      if (event.kind === "status") {
        // Update agent status label with the backend's status messages
        setAgentStatusLabel(event.message);
      }
    };

    try {
      await generateSpecs(epicId, targetDir, specAddEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setAgentStatusLabel(null);
      const c = useChatStore.getState();
      c.setAgentWorking(false);
      c.injectProgress("Specs generated", "generating_specs", "complete");
      const summary = extractChatNarrative(allEventsRef.current);
      if (summary) c.injectNarrative(summary);
      c.injectNarrative("The specs are ready for your review. Take a look at each document — you can use the **Refine** mode to request changes, or approve them to move on to ticket decomposition.");
    }
  };

  const handleApproveSpecs = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setAgentStatusLabel("Decomposing tickets...");
    clearStreamEvents();
    const chat = useChatStore.getState();
    chat.injectNarrative("Specs approved! Now I'll decompose the work into individual implementation tickets. Each ticket will be a focused, independently buildable unit with clear acceptance criteria and dependency tracking.");
    chat.setAgentWorking(true);

    try {
      await approveSpecs(epicId, targetDir);
      await reload();
      await decomposeTickets(epicId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setAgentStatusLabel(null);
      const c = useChatStore.getState();
      c.setAgentWorking(false);
      c.injectProgress("Tickets decomposed", "generating_tickets", "complete");
      const summary = extractChatNarrative(allEventsRef.current);
      if (summary) c.injectNarrative(summary);
      c.injectNarrative("The tickets are ready for review. Check the priorities, dependencies, and scope. Once you're happy, approve them and I'll plan the detailed execution phases for each ticket.");
    }
  };

  const handleApproveTickets = () => {
    setShowPlanModeDialog(true);
  };

  const startPlanning = async (mode: "detailed" | "quick") => {
    setShowPlanModeDialog(false);
    if (!epicId || !targetDir) return;

    const config = useConfigStore.getState().config;
    const setConfig = useConfigStore.getState().setConfig;
    setConfig({ ...config, planning_detail: mode });
    try {
      await saveConfig({ ...config, planning_detail: mode }, targetDir);
    } catch (_) { /* non-critical */ }

    setIsProcessing(true);
    setAgentStatusLabel("Planning phases...");
    clearStreamEvents();
    const chat = useChatStore.getState();
    chat.injectNarrative("Tickets approved! Now I'll plan the detailed execution phases for each ticket — defining the exact file operations, implementation steps, test strategies, and rollback plans. This is the final planning step before execution.");
    chat.setAgentWorking(true);

    try {
      await approveTickets(epicId, targetDir);
      await reload();
      await planAllPhases(epicId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setAgentStatusLabel(null);
      const c = useChatStore.getState();
      c.setAgentWorking(false);
      c.injectProgress("Phases planned", "generating_phases", "complete");
      const summary = extractChatNarrative(allEventsRef.current);
      if (summary) c.injectNarrative(summary);
      c.injectNarrative("All phases are planned. Review the execution plan — each phase lists the files to create or modify, the implementation steps, and verification criteria. Approve to move to execution, or use **Review** mode to run a coherency check.");
    }
  };

  const handleApprovePhases = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setAgentStatusLabel("Validating plan...");
    clearStreamEvents();
    const chat = useChatStore.getState();
    chat.injectNarrative("Before we start executing, let me run a quick validation to make sure the plan is solid. I'll generate a few sanity-check questions to confirm everything looks right.");
    chat.setAgentWorking(true);
    try {
      // Generate validation questionnaire instead of going directly to ready
      const result = await generatePlanQuestionnaire(epicId, targetDir, addEvent);
      setValidationQuestions(result.questions || []);
      await reload(); // step is now "plan_validation"
    } catch (e) {
      // If questionnaire fails, fall back to direct approval
      console.warn("Questionnaire generation failed, approving directly:", e);
      await approvePhases(epicId, targetDir);
      await reload();
    } finally {
      setIsProcessing(false);
      setAgentStatusLabel(null);
      useChatStore.getState().setAgentWorking(false);
    }
  };

  const handleReviewWork = async () => {
    if (!epicId || !targetDir || !data) return;
    setIsProcessing(true);
    clearStreamEvents();
    try {
      for (const ticket of data.tickets) {
        const ticketPhases = data.phases_by_ticket[ticket.id] ?? [];
        for (const phase of ticketPhases) {
          if (phase.status === "passed" || phase.execution) {
            await reviewPhaseWork(epicId, ticket.id, phase.id, targetDir, addEvent);
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReviewPlan = async (scope: "specs" | "tickets" | "phases", focus?: string | null) => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setAgentStatusLabel("Reviewing plan coherency...");
    clearStreamEvents();

    const chat = useChatStore.getState();
    const scopeLabel = scope === "specs" ? "specifications" : scope === "tickets" ? "tickets" : "full plan";
    chat.injectNarrative(`Running a coherency review on the ${scopeLabel}. I'll check for inconsistencies, missing cross-references, conflicting technical decisions, and gaps in acceptance criteria.`);
    chat.setAgentWorking(true);

    // Open a stream tab for detailed view (only activate if agent panel is closed)
    const title = scope === "specs" ? "Reviewing Specs" : scope === "tickets" ? "Reviewing Tickets" : "Reviewing Coherency";
    openTab({
      id: "stream:current",
      type: "stream",
      title,
      icon: "Terminal",
      epicId,
    });
    if (useWorkspaceStore.getState().agentPanelCollapsed) {
      setActiveTab("stream:current");
    }

    try {
      await reviewPlanCoherency(epicId, targetDir, scope, focus ?? null, addEvent);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setAgentStatusLabel(null);
      const c = useChatStore.getState();
      c.setAgentWorking(false);
      c.injectProgress("Review complete", "review", "complete");
      const summary = extractChatNarrative(allEventsRef.current);
      if (summary) c.injectNarrative(summary);
    }
  };

  const handleRetryPhase = async (ticketId: string, phaseId: string) => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    clearStreamEvents();
    try {
      await retryPhase(epicId, ticketId, phaseId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleValidationComplete = async (allCorrect: boolean) => {
    if (!epicId || !targetDir) return;
    const chat = useChatStore.getState();
    if (allCorrect) {
      chat.injectNarrative("Validation passed! The plan is locked and ready for execution. You can now run the epic — I'll execute each phase, verify the results, and report back as I go.");
    } else {
      chat.injectNarrative("Some items need attention. I'll adjust the plan based on the validation feedback before we proceed.");
    }
    try {
      await submitPlanValidation(epicId, targetDir, allCorrect);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCancel = async () => {
    await cancelExecution();
    setIsProcessing(false);
  };

  const handleDelete = async () => {
    if (!epicId || !targetDir) return;
    await deleteEpic(epicId, targetDir);
    navigate("/");
  };

  const step = (data?.epic.planning_step ?? "draft") as PlanningStep;
  const activeModel =
    step === "scouting" || step === "draft"
      ? data?.epic.model_config.scout.model_id ?? ""
      : data?.epic.model_config.orchestrator.model_id ?? "";

  return (
    <EpicContext.Provider
      value={{
        data,
        loading,
        error,
        setError,
        reload,
        isProcessing,
        streamEvents,
        step,
        activeModel,
        agentStatusLabel,
        handleStartScouting,
        handleSubmitAnswers,
        handleRequestMoreQuestions,
        handleGenerateSpecs,
        handleApproveSpecs,
        handleApproveTickets,
        startPlanning,
        handleApprovePhases,
        handleReviewWork,
        handleReviewPlan,
        handleRetryPhase,
        handleCancel,
        handleDelete,
        showPlanModeDialog,
        setShowPlanModeDialog,
        validationQuestions,
        handleValidationComplete,
      }}
    >
      {children}
    </EpicContext.Provider>
  );
}
