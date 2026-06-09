import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Play,
  Trash2,
  FileText,
  ListTodo,
  Layers,
  BarChart3,
  Loader2,
  CheckCircle,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { useConfigStore } from "../stores/configStore";
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
  generatePlanQuestionnaire,
  submitPlanValidation,
  retryPhase,
  saveConfig,
} from "../lib/tauri";
import type { EpicFull } from "../lib/tauri";
import { cn, STATUS_COLORS, statusLabel } from "../lib/utils";
import { QuotaCost } from "../components/ui/QuotaCost";
import { PlanningProgress } from "../components/epic/PlanningProgress";
import { ClarifyingChat } from "../components/epic/ClarifyingChat";
import { SpecsTab } from "../components/epic/SpecsTab";
import { TicketsTab } from "../components/epic/TicketsTab";
import { PhasesTab } from "../components/epic/PhasesTab";
import { PlanValidation } from "../components/epic/PlanValidation";
import { StreamPanel } from "../components/execution/StreamPanel";
import type { FrontendStreamEvent } from "../types/execution";
import type { ClarifyingQA, PlanningStep } from "../types/epic";
import { ChatSidebar } from "../components/chat/ChatSidebar";
import { TextSelectionPopover } from "../components/chat/TextSelectionPopover";
import { useChatStore } from "../stores/chatStore";

type ViewTab = "specs" | "tickets" | "phases";

export function EpicPage() {
  const { epicId } = useParams<{ epicId: string }>();
  const navigate = useNavigate();
  const targetDir = useConfigStore((s) => s.targetDir);

  const [data, setData] = useState<EpicFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<FrontendStreamEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>("specs");
  const [showPlanModeDialog, setShowPlanModeDialog] = useState(false);
  const [reviewFocus, setReviewFocus] = useState("");
  const [showReviewFocus, setShowReviewFocus] = useState(false);
  const [validationQuestions, setValidationQuestions] = useState<Array<{ question: string; context: string; category: string }>>([]);

  // Load/reload epic data
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

  // Auto-start scouting when epic is in "draft" state
  useEffect(() => {
    if (data?.epic.planning_step === "draft" && !isProcessing && targetDir && epicId) {
      handleStartScouting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.epic.planning_step]);

  // Poll for updates during phase planning so user can see completed phases in real-time
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

  const addEvent = useCallback((event: FrontendStreamEvent) => {
    setStreamEvents((prev) => [...prev, event]);
  }, []);

  // ─── Step handlers ─────────────────────────────────────────────────

  const handleStartScouting = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setStreamEvents([]);
    try {
      await startScouting(epicId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitAnswers = async (answers: ClarifyingQA[]) => {
    if (!epicId || !targetDir) return;
    try {
      await submitAnswers(epicId, targetDir, answers);

      const answeredCount = answers.filter((a) => a.answer.trim()).length;
      const totalQuestions = answers.length;

      // After Round 1 (experience question answered), auto-trigger Round 2 (concept/features)
      if (answeredCount === 1 && totalQuestions === 1) {
        setIsProcessing(true);
        await requestMoreQuestions(epicId, targetDir, addEvent); // Round 2
        await reload();
        setIsProcessing(false);
        return;
      }

      // After all Round 2 questions answered, auto-trigger Round 3 (design)
      // Round 2 generates ~4-6 questions, so total would be ~5-7 after Round 1
      if (answeredCount === totalQuestions && totalQuestions > 1 && totalQuestions <= 8) {
        setIsProcessing(true);
        await requestMoreQuestions(epicId, targetDir, addEvent); // Round 3
        await reload();
        setIsProcessing(false);
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
    try {
      await requestMoreQuestions(epicId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateSpecs = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setStreamEvents([]);
    try {
      await generateSpecs(epicId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveSpecs = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setStreamEvents([]);
    try {
      // Step 1: approve → step moves to "generating_tickets"
      await approveSpecs(epicId, targetDir);
      await reload(); // UI updates indicator to Tickets phase
      // Step 2: decompose tickets
      await decomposeTickets(epicId, targetDir, addEvent);
      await reload(); // UI updates indicator to tickets_review
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  // Show the planning mode dialog instead of immediately planning
  const handleApproveTickets = () => {
    setShowPlanModeDialog(true);
  };

  // Actually start planning after user picks quick/detailed
  const startPlanning = async (mode: "detailed" | "quick") => {
    setShowPlanModeDialog(false);
    if (!epicId || !targetDir) return;

    // Save mode to config
    const config = useConfigStore.getState().config;
    const setConfig = useConfigStore.getState().setConfig;
    setConfig({ ...config, planning_detail: mode });
    try {
      await saveConfig({ ...config, planning_detail: mode }, targetDir);
    } catch (_) { /* non-critical */ }

    setIsProcessing(true);
    setStreamEvents([]);
    try {
      // Step 1: approve → step moves to "generating_phases"
      await approveTickets(epicId, targetDir);
      await reload(); // UI updates indicator to Phases phase
      // Step 2: plan all phases (uses the planning_detail from config)
      await planAllPhases(epicId, targetDir, addEvent);
      await reload(); // UI updates indicator to phases_review
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprovePhases = async () => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setStreamEvents([]);
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
    }
  };

  const handleValidationComplete = async (allCorrect: boolean) => {
    if (!epicId || !targetDir) return;
    try {
      await submitPlanValidation(epicId, targetDir, allCorrect);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleReviewWork = async () => {
    if (!epicId || !targetDir || !data) return;

    // Reload fresh data from disk first (phases may have been updated by execution)
    let freshData = data;
    try {
      freshData = await loadEpicFull(epicId, targetDir);
      setData(freshData);
    } catch (_) { /* use current data as fallback */ }

    // Collect all reviewable phases
    const reviewablePhases: { ticketId: string; phaseId: string; title: string }[] = [];
    for (const ticket of freshData.tickets) {
      const ticketPhases = freshData.phases_by_ticket[ticket.id] ?? [];
      for (const phase of ticketPhases) {
        if (phase.status === "passed" || phase.status === "failed" || phase.execution) {
          reviewablePhases.push({ ticketId: ticket.id, phaseId: phase.id, title: phase.title });
        }
      }
    }

    if (reviewablePhases.length === 0) {
      setError("No completed phases to review. Build the epic first.");
      return;
    }

    setIsProcessing(true);
    setStreamEvents([]);
    try {
      for (const { ticketId, phaseId, title } of reviewablePhases) {
        addEvent({ kind: "status", message: `Reviewing phase: ${title}` });
        await reviewPhaseWork(epicId, ticketId, phaseId, targetDir, addEvent);
      }
      addEvent({ kind: "status", message: `Review complete — ${reviewablePhases.length} phases reviewed.` });
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReviewPlan = async (scope: "specs" | "tickets" | "phases") => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setStreamEvents([]);
    try {
      await reviewPlanCoherency(
        epicId, targetDir, scope,
        reviewFocus.trim() || null,
        addEvent,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setReviewFocus("");
      setShowReviewFocus(false);
    }
  };

  const handleRetryPhase = async (ticketId: string, phaseId: string) => {
    if (!epicId || !targetDir) return;
    setIsProcessing(true);
    setStreamEvents([]);
    try {
      await retryPhase(epicId, ticketId, phaseId, targetDir, addEvent);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
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

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-neutral-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading epic...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-400">{error}</p>
        <button onClick={() => navigate("/")} className="text-sm text-neutral-400 hover:text-neutral-200">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { epic, specs, tickets, phases_by_ticket } = data;
  const step = epic.planning_step as PlanningStep;
  const totalPhases = Object.values(phases_by_ticket).flat().length;
  const completedPhases = Object.values(phases_by_ticket).flat().filter((p) => p.status === "passed").length;
  const progress = totalPhases > 0 ? (completedPhases / totalPhases) * 100 : 0;
  const isReady = step === "ready";
  const isPlanning = !isReady;

  // Which model is active for the current step
  const activeModel = step === "scouting" || step === "draft"
    ? epic.model_config.scout.model_id
    : epic.model_config.orchestrator.model_id;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Planning Mode Dialog */}
      {showPlanModeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-1 border border-neutral-700 rounded-2xl p-8 max-w-lg mx-4 shadow-2xl"
          >
            <h3 className="text-xl font-bold text-neutral-100 mb-2">How should we plan?</h3>
            <p className="text-sm text-neutral-400 mb-6">Choose how detailed the phase planning should be for this epic.</p>
            <div className="space-y-3">
              <button
                onClick={() => startPlanning("detailed")}
                className="w-full text-left px-5 py-4 rounded-xl border border-neutral-700 hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-neutral-200 group-hover:text-emerald-300">Detailed</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Full per-ticket phase breakdown. Plans each ticket individually with complete implementation steps. Best for complex projects.</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => startPlanning("quick")}
                className="w-full text-left px-5 py-4 rounded-xl border border-neutral-700 hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-neutral-200 group-hover:text-emerald-300">Quick</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Consolidated plan covering all tickets. Groups related work by dependency. Faster and uses fewer tokens.</p>
                  </div>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowPlanModeDialog(false)}
              className="mt-4 w-full text-center text-xs text-neutral-500 hover:text-neutral-300 transition-colors py-2"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold text-neutral-100">
              {epic.title || epic.objective.slice(0, 80)}
            </h2>
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[epic.status])}>
              {statusLabel(epic.status)}
            </span>
          </div>
          {epic.title && (
            <p className="text-sm text-neutral-500 max-w-2xl">{epic.objective}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Chat button — available during review steps and ready state */}
          {(isReady || step === "specs_review" || step === "tickets_review" || step === "phases_review") && (
            <button
              onClick={() => useChatStore.getState().toggleOpen()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors",
                useChatStore.getState().isOpen
                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-800"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
          )}
          {isReady && (
            <>
              <button
                onClick={handleReviewWork}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Review
              </button>
              <button
                onClick={() => navigate(`/execute/${epic.id}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Play className="w-4 h-4" />
                Build
              </button>
            </>
          )}
          {isProcessing && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleDelete}
            className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Planning progress bar */}
      {isPlanning && (
        <PlanningProgress currentStep={step} isActive={isProcessing} />
      )}

      {/* Ready state: progress bar */}
      {isReady && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5">
            <span className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              {completedPhases}/{totalPhases} phases
            </span>
            <QuotaCost costUsd={epic.total_cost_usd} />
          </div>
          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs text-neutral-400 hover:text-neutral-200">Dismiss</button>
        </div>
      )}

      {/* ─── Planning Step Content ────────────────────────────────── */}

      {/* Scouting / generating — with resume for interrupted states */}
      {(step === "draft" || step === "scouting" || step === "generating_specs" || step === "generating_tickets" || step === "generating_phases") && (
        <div>
          {isProcessing ? (
            <>
              <StreamPanel
                events={streamEvents} modelName={activeModel}
                maxHeight={400}
                title={
                  step === "scouting" ? "Scanning Codebase" :
                  step === "generating_specs" ? "Generating Specs" :
                  step === "generating_tickets" ? "Decomposing Tickets" :
                  step === "generating_phases" ? "Planning Phases" :
                  "Processing"
                }
              />
              {/* Show already-planned phases while generating more */}
              {step === "generating_phases" && tickets.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-neutral-400 mb-2">Planned phases so far:</h3>
                  <PhasesTab tickets={tickets} phasesByTicket={phases_by_ticket} onRetryPhase={handleRetryPhase} />
                </div>
              )}
            </>
          ) : (
            /* Stuck/interrupted state — show resume options */
            <div className="bg-surface-1 border border-amber-500/20 rounded-xl p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-neutral-200 mb-2">
                {step === "draft" ? "Ready to start" :
                 step === "scouting" ? "Scouting was interrupted" :
                 step === "generating_specs" ? "Spec generation was interrupted" :
                 step === "generating_tickets" ? "Ticket decomposition was interrupted" :
                 "Phase planning was interrupted"}
              </h3>
              <p className="text-sm text-neutral-400 mb-4">
                {step === "draft"
                  ? "Click below to start analyzing your codebase"
                  : "The process was interrupted. You can resume from where it stopped."}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    if (step === "draft" || step === "scouting") handleStartScouting();
                    else if (step === "generating_specs") handleGenerateSpecs();
                    else if (step === "generating_tickets" && epicId && targetDir) {
                      setIsProcessing(true);
                      setStreamEvents([]);
                      decomposeTickets(epicId, targetDir, addEvent)
                        .then(() => reload())
                        .catch((e) => setError(String(e)))
                        .finally(() => setIsProcessing(false));
                    }
                    else if (step === "generating_phases" && epicId && targetDir) {
                      setIsProcessing(true);
                      setStreamEvents([]);
                      planAllPhases(epicId, targetDir, addEvent)
                        .then(() => reload())
                        .catch((e) => setError(String(e)))
                        .finally(() => setIsProcessing(false));
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  {step === "draft" ? "Start" : "Resume"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clarifying Q&A */}
      {step === "clarifying" && !isProcessing && (
        <ClarifyingChat
          questions={epic.clarifying_questions}
          onSubmitAnswers={handleSubmitAnswers}
          onRequestMore={handleRequestMoreQuestions}
          onDone={handleGenerateSpecs}
          isGenerating={isProcessing}
        />
      )}

      {/* Show progress when generating specs from clarifying step */}
      {step === "clarifying" && isProcessing && (
        <div>
          <StreamPanel
            events={streamEvents} modelName={activeModel}
            maxHeight={400}
            title="Generating Specs"
          />
        </div>
      )}

      {/* Specs Review */}
      {step === "specs_review" && (
        <div>
          <SpecsTab specs={specs} />
          {/* Review focus input */}
          {showReviewFocus && (
            <div className="mt-4 bg-surface-1 border border-neutral-800 rounded-xl p-3">
              <textarea
                value={reviewFocus}
                onChange={(e) => setReviewFocus(e.target.value)}
                placeholder="Focus the review on... (e.g. visual consistency, API design, security)"
                className="w-full bg-transparent text-sm text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none min-h-[40px]"
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleReviewPlan("specs")}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                {reviewFocus.trim() ? "Review with Focus" : "Review Specs"}
              </button>
              <button
                onClick={() => setShowReviewFocus(!showReviewFocus)}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {showReviewFocus ? "Hide focus" : "Guide review"}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  useChatStore.getState().setMode("refine");
                  useChatStore.getState().setOpen(true);
                }}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                Refine
              </button>
              <button
                onClick={handleApproveSpecs}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve & Decompose Tickets
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          {isProcessing && streamEvents.length > 0 && (
            <div className="mt-4">
              <StreamPanel events={streamEvents} modelName={activeModel} maxHeight={400} title="Agent Output" />
            </div>
          )}
        </div>
      )}

      {/* Tickets Review */}
      {step === "tickets_review" && (
        <div>
          <TicketsTab tickets={tickets} />
          {/* Review focus input */}
          {showReviewFocus && (
            <div className="mt-4 bg-surface-1 border border-neutral-800 rounded-xl p-3">
              <textarea
                value={reviewFocus}
                onChange={(e) => setReviewFocus(e.target.value)}
                placeholder="Focus the review on... (e.g. missing tickets for auth, incomplete acceptance criteria)"
                className="w-full bg-transparent text-sm text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none min-h-[40px]"
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleReviewPlan("tickets")}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                {reviewFocus.trim() ? "Review with Focus" : "Review Tickets"}
              </button>
              <button
                onClick={() => setShowReviewFocus(!showReviewFocus)}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                {showReviewFocus ? "Hide focus" : "Guide review"}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  useChatStore.getState().setMode("refine");
                  useChatStore.getState().setOpen(true);
                }}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                Refine
              </button>
              <button
                onClick={handleApproveTickets}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve & Plan Phases
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          {isProcessing && streamEvents.length > 0 && (
            <div className="mt-4">
              <StreamPanel events={streamEvents} modelName={activeModel} maxHeight={400} title="Agent Output" />
            </div>
          )}
        </div>
      )}

      {/* Phases Review */}
      {step === "phases_review" && (
        <div>
          <PhasesTab tickets={tickets} phasesByTicket={phases_by_ticket} onRetryPhase={handleRetryPhase} />
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => handleReviewPlan("phases")}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              Review Coherency
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  useChatStore.getState().setMode("refine");
                  useChatStore.getState().setOpen(true);
                }}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                Refine
              </button>
              <button
                onClick={handleApprovePhases}
                disabled={isProcessing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Finalize — Ready to Build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Validation Questionnaire */}
      {step === "plan_validation" && validationQuestions.length > 0 && (
        <PlanValidation
          questions={validationQuestions}
          onComplete={(allCorrect) => handleValidationComplete(allCorrect)}
          isProcessing={isProcessing}
        />
      )}

      {/* Review stream (shown when review is running in any state) */}
      {isProcessing && streamEvents.length > 0 && (step === "ready" || step === "phases_review") && (
        <div className="mb-4">
          <StreamPanel
            events={streamEvents} modelName={epic.model_config.verifier.model_id}
            maxHeight={400}
            title="Review (Verifier Model)"
          />
        </div>
      )}

      {/* Ready: Show tabs with full overview */}
      {isReady && (
        <div>
          <div className="flex items-center gap-1 mb-6 border-b border-neutral-800">
            {([
              { id: "specs" as ViewTab, label: "Specs", icon: FileText, count: specs.length },
              { id: "tickets" as ViewTab, label: "Tickets", icon: ListTodo, count: tickets.length },
              { id: "phases" as ViewTab, label: "Phases", icon: Layers, count: totalPhases },
            ]).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                    isActive ? "border-emerald-500 text-emerald-400" : "border-transparent text-neutral-500 hover:text-neutral-300"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span className={cn("px-1.5 py-0.5 rounded text-[11px]", isActive ? "bg-emerald-500/20" : "bg-neutral-800 text-neutral-500")}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
          {activeTab === "specs" && <SpecsTab specs={specs} />}
          {activeTab === "tickets" && <TicketsTab tickets={tickets} />}
          {activeTab === "phases" && <PhasesTab tickets={tickets} phasesByTicket={phases_by_ticket} onRetryPhase={handleRetryPhase} />}
        </div>
      )}

      {/* Chat Sidebar + Text Selection Popover */}
      {epicId && targetDir && (
        <>
          <ChatSidebar epicId={epicId} targetDir={targetDir} onPlanUpdated={reload} />
          <TextSelectionPopover />
        </>
      )}
    </div>
  );
}
