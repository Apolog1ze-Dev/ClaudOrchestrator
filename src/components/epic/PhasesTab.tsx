import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  ChevronRight,
  CheckCircle,
  XCircle,
  Circle,
  FileCode,
  TestTube,
  MessageSquare,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { cn, STATUS_COLORS, statusLabel } from "../../lib/utils";
import { QuotaCost } from "../ui/QuotaCost";
import type { Ticket, Phase } from "../../types/epic";

interface PhasesTabProps {
  tickets: Ticket[];
  phasesByTicket: Record<string, Phase[]>;
  onRetryPhase?: (ticketId: string, phaseId: string) => void;
}

function PhaseStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "passed": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
    case "executing": return <Circle className="w-4 h-4 text-emerald-400 animate-pulse" />;
    case "verifying": return <ShieldCheck className="w-4 h-4 text-amber-400" />;
    default: return <Circle className="w-4 h-4 text-neutral-700" />;
  }
}

export function PhasesTab({ tickets, phasesByTicket, onRetryPhase }: PhasesTabProps) {
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);

  const totalPhases = Object.values(phasesByTicket).flat().length;

  if (totalPhases === 0) {
    return (
      <div className="text-center py-16 text-neutral-500">
        <Layers className="w-8 h-8 mx-auto mb-3 text-neutral-700" />
        <p>No phases planned yet</p>
        <p className="text-sm text-neutral-600 mt-1">Phases will appear after ticket planning</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tickets.map((ticket) => {
        const phases = (phasesByTicket[ticket.id] ?? []).sort((a, b) => a.order - b.order);
        if (phases.length === 0) return null;

        return (
          <div key={ticket.id}>
            {/* Ticket header */}
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-neutral-300">{ticket.title}</h3>
              <span className={cn("px-2 py-0.5 rounded-full text-[11px]", STATUS_COLORS[ticket.status])}>
                {statusLabel(ticket.status)}
              </span>
              <span className="text-[11px] text-neutral-600">{phases.length} phases</span>
            </div>

            {/* Phase timeline */}
            <div className="space-y-0.5 ml-2">
              {phases.map((phase, i) => {
                const isExpanded = expandedPhaseId === phase.id;
                const isLast = i === phases.length - 1;

                return (
                  <div key={phase.id} className="flex gap-3">
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center w-4 flex-shrink-0">
                      <PhaseStatusIcon status={phase.status} />
                      {!isLast && <div className="w-px flex-1 bg-neutral-800 my-0.5" />}
                    </div>

                    {/* Phase content */}
                    <div className="flex-1 min-w-0 pb-3">
                      <button
                        onClick={() => setExpandedPhaseId(isExpanded ? null : phase.id)}
                        className="w-full flex items-center gap-2 text-left group"
                      >
                        <ChevronRight
                          className={cn(
                            "w-3.5 h-3.5 text-neutral-600 transition-transform flex-shrink-0",
                            isExpanded && "rotate-90"
                          )}
                        />
                        <span className="text-xs text-neutral-600 font-mono">P{phase.order}</span>
                        <span className="text-sm text-neutral-300 group-hover:text-neutral-100 truncate">
                          {phase.title}
                        </span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] ml-auto", STATUS_COLORS[phase.status])}>
                          {statusLabel(phase.status)}
                        </span>
                        {phase.verification && (
                          <span className={cn(
                            "text-[10px] font-mono",
                            phase.verification.overall_score >= 70 ? "text-emerald-400" : "text-red-400"
                          )}>
                            {phase.verification.overall_score}/100
                          </span>
                        )}
                        {phase.cost_usd > 0 && (
                          <QuotaCost costUsd={phase.cost_usd} className="text-[10px]" iconSize="w-2.5 h-2.5" />
                        )}
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div
                              className="mt-2 ml-5 space-y-3 text-xs"
                              data-chat-source-type="phase"
                              data-chat-source-id={phase.id}
                              data-chat-source-title={`Phase: ${phase.title}`}
                            >
                              {/* Objective */}
                              <div>
                                <h5 className="text-neutral-400 font-medium mb-1">Objective</h5>
                                <p className="text-neutral-500">{phase.plan.objective}</p>
                              </div>

                              {/* Steps */}
                              {phase.plan.steps.length > 0 && (
                                <div>
                                  <h5 className="text-neutral-400 font-medium mb-1">Steps</h5>
                                  <ol className="space-y-1">
                                    {phase.plan.steps.map((s) => (
                                      <li key={s.order} className="flex gap-2 text-neutral-500">
                                        <span className="text-neutral-600 font-mono">{s.order}.</span>
                                        <span>{s.description}</span>
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}

                              {/* File operations */}
                              {(phase.plan.files_to_create.length > 0 || phase.plan.files_to_modify.length > 0) && (
                                <div>
                                  <h5 className="flex items-center gap-1 text-neutral-400 font-medium mb-1">
                                    <FileCode className="w-3 h-3" /> Files
                                  </h5>
                                  {phase.plan.files_to_create.map((f, i) => (
                                    <p key={`c-${i}`} className="text-emerald-400/70 font-mono">+ {f.path}</p>
                                  ))}
                                  {phase.plan.files_to_modify.map((f, i) => (
                                    <p key={`m-${i}`} className="text-amber-400/70 font-mono">~ {f.path}</p>
                                  ))}
                                  {phase.plan.files_to_delete.map((f, i) => (
                                    <p key={`d-${i}`} className="text-red-400/70 font-mono">- {f}</p>
                                  ))}
                                </div>
                              )}

                              {/* Test strategy */}
                              {phase.plan.test_strategy && (
                                <div>
                                  <h5 className="flex items-center gap-1 text-neutral-400 font-medium mb-1">
                                    <TestTube className="w-3 h-3" /> Test Strategy
                                  </h5>
                                  <p className="text-neutral-500">{phase.plan.test_strategy}</p>
                                </div>
                              )}

                              {/* Reference Documents */}
                              {phase.plan.reference_docs && phase.plan.reference_docs.length > 0 && (
                                <div>
                                  <h5 className="flex items-center gap-1 text-neutral-400 font-medium mb-1">
                                    <FileCode className="w-3 h-3" /> Reference Docs
                                  </h5>
                                  {phase.plan.reference_docs.map((doc, i) => (
                                    <p key={`ref-${i}`} className="text-emerald-400/70 font-mono text-[11px]">📄 {doc}</p>
                                  ))}
                                </div>
                              )}

                              {/* Reasoning */}
                              {phase.plan.reasoning && (
                                <div>
                                  <h5 className="flex items-center gap-1 text-neutral-400 font-medium mb-1">
                                    <MessageSquare className="w-3 h-3" /> Reasoning
                                  </h5>
                                  <p className="text-neutral-500">{phase.plan.reasoning}</p>
                                </div>
                              )}

                              {/* Retry button for failed phases */}
                              {(phase.status === "failed") && onRetryPhase && (
                                <button
                                  onClick={() => onRetryPhase(ticket.id, phase.id)}
                                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Retry Phase
                                </button>
                              )}

                              {/* Verification Results */}
                              {phase.verification && (
                                <div className="bg-surface-0 border border-neutral-800 rounded-lg p-3 mt-2">
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="flex items-center gap-1 text-neutral-400 font-medium">
                                      <ShieldCheck className="w-3 h-3 text-amber-400" /> Verification
                                    </h5>
                                    <span className={cn(
                                      "text-sm font-mono font-bold",
                                      phase.verification.overall_score >= 70 ? "text-emerald-400" : "text-red-400"
                                    )}>
                                      {phase.verification.overall_score}/100
                                    </span>
                                  </div>
                                  {phase.verification.reasoning && (
                                    <p className="text-neutral-500 text-[11px] mb-2">{phase.verification.reasoning}</p>
                                  )}
                                  <div className="space-y-0.5">
                                    {phase.verification.checks.map((check, ci) => (
                                      <div key={ci} className="flex items-start gap-1.5 text-[11px]">
                                        {check.passed
                                          ? <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                                          : <XCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                                        }
                                        <span className={check.passed ? "text-neutral-500" : "text-red-300"}>
                                          {check.name}: {check.details}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  {phase.verification.suggested_fixes.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-neutral-800">
                                      <h6 className="text-[11px] text-amber-400 font-medium mb-1">Suggested Fixes</h6>
                                      {phase.verification.suggested_fixes.map((fix, fi) => (
                                        <p key={fi} className="text-[11px] text-neutral-500">• {fix}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
