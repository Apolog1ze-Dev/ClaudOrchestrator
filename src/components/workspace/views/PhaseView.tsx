import {
  CheckCircle,
  XCircle,
  Circle,
  FileCode,
  TestTube,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { useOptionalEpicContext } from "../../../contexts/EpicContext";
import { cn, STATUS_COLORS, statusLabel } from "../../../lib/utils";
import { QuotaCost } from "../../ui/QuotaCost";

function PhaseStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "passed": return <CheckCircle className="w-5 h-5 text-emerald-400" />;
    case "failed": return <XCircle className="w-5 h-5 text-red-400" />;
    case "executing": return <Circle className="w-5 h-5 text-emerald-400 animate-pulse" />;
    case "verifying": return <ShieldCheck className="w-5 h-5 text-amber-400" />;
    default: return <Circle className="w-5 h-5 text-neutral-700" />;
  }
}

interface PhaseViewProps {
  phaseId: string;
}

export function PhaseView({ phaseId }: PhaseViewProps) {
  const epicCtx = useOptionalEpicContext();
  const allPhases = epicCtx?.data ? Object.values(epicCtx.data.phases_by_ticket).flat() : [];
  const phase = allPhases.find((p) => p.id === phaseId);
  const ticket = epicCtx?.data?.tickets.find((t) => t.id === phase?.ticket_id);

  if (!phase) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Phase not found
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="max-w-4xl mx-auto p-6 space-y-6"
        data-chat-source-type="phase"
        data-chat-source-id={phase.id}
        data-chat-source-title={`Phase: ${phase.title}`}
      >
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <PhaseStatusIcon status={phase.status} />
            <span className="text-xs text-neutral-600 font-mono">P{phase.order}</span>
            <h2 className="text-xl font-bold text-neutral-100">{phase.title}</h2>
            <span className={cn("px-2 py-0.5 rounded-full text-xs", STATUS_COLORS[phase.status])}>
              {statusLabel(phase.status)}
            </span>
          </div>
          {ticket && (
            <p className="text-xs text-neutral-500 ml-8">Ticket: {ticket.title}</p>
          )}
        </div>

        {/* Cost & verification score */}
        <div className="flex items-center gap-4">
          {phase.cost_usd > 0 && (
            <QuotaCost costUsd={phase.cost_usd} className="text-xs" />
          )}
          {phase.verification && (
            <span className={cn(
              "flex items-center gap-1 text-xs font-mono",
              phase.verification.overall_score >= 70 ? "text-emerald-400" : "text-red-400"
            )}>
              <ShieldCheck className="w-3 h-3" />
              {phase.verification.overall_score}/100
            </span>
          )}
        </div>

        {/* Objective */}
        <div>
          <h3 className="text-sm font-medium text-neutral-300 mb-2">Objective</h3>
          <p className="text-sm text-neutral-400">{phase.plan.objective}</p>
        </div>

        {/* Steps */}
        {phase.plan.steps.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-neutral-300 mb-2">Implementation Steps</h3>
            <ol className="space-y-2">
              {phase.plan.steps.map((s) => (
                <li key={s.order} className="flex gap-3 text-sm text-neutral-400">
                  <span className="text-neutral-600 font-mono flex-shrink-0">{s.order}.</span>
                  <div>
                    <p>{s.description}</p>
                    {s.file_targets.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.file_targets.map((f, i) => (
                          <span key={i} className="text-[11px] font-mono text-neutral-600">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* File operations */}
        {(phase.plan.files_to_create.length > 0 || phase.plan.files_to_modify.length > 0 || phase.plan.files_to_delete.length > 0) && (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
              <FileCode className="w-4 h-4" /> File Operations
            </h3>
            <div className="space-y-1 font-mono text-xs">
              {phase.plan.files_to_create.map((f, i) => (
                <div key={`c-${i}`} className="flex gap-2">
                  <span className="text-emerald-400">+</span>
                  <span className="text-emerald-400/70">{f.path}</span>
                  {f.description && <span className="text-neutral-600 font-sans">- {f.description}</span>}
                </div>
              ))}
              {phase.plan.files_to_modify.map((f, i) => (
                <div key={`m-${i}`} className="flex gap-2">
                  <span className="text-amber-400">~</span>
                  <span className="text-amber-400/70">{f.path}</span>
                  {f.description && <span className="text-neutral-600 font-sans">- {f.description}</span>}
                </div>
              ))}
              {phase.plan.files_to_delete.map((f, i) => (
                <div key={`d-${i}`} className="flex gap-2">
                  <span className="text-red-400">-</span>
                  <span className="text-red-400/70">{f}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test strategy */}
        {phase.plan.test_strategy && (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
              <TestTube className="w-4 h-4" /> Test Strategy
            </h3>
            <p className="text-sm text-neutral-400">{phase.plan.test_strategy}</p>
          </div>
        )}

        {/* Reference docs */}
        {phase.plan.reference_docs && phase.plan.reference_docs.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
              <FileCode className="w-4 h-4" /> Reference Documents
            </h3>
            <div className="space-y-0.5">
              {phase.plan.reference_docs.map((doc, i) => (
                <p key={i} className="text-xs font-mono text-emerald-400/70">{doc}</p>
              ))}
            </div>
          </div>
        )}

        {/* Reasoning */}
        {phase.plan.reasoning && (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
              <MessageSquare className="w-4 h-4" /> Reasoning
            </h3>
            <p className="text-sm text-neutral-400">{phase.plan.reasoning}</p>
          </div>
        )}

        {/* Verification results */}
        {phase.verification && (
          <div className="bg-surface-1 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Verification Results
              </h3>
              <span className={cn(
                "text-lg font-bold font-mono",
                phase.verification.overall_score >= 70 ? "text-emerald-400" : "text-red-400"
              )}>
                {phase.verification.overall_score}/100
              </span>
            </div>
            {phase.verification.reasoning && (
              <p className="text-xs text-neutral-400 mb-3">{phase.verification.reasoning}</p>
            )}
            <div className="space-y-1">
              {phase.verification.checks.map((check, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {check.passed ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span className={check.passed ? "text-neutral-400" : "text-red-300"}>
                    {check.name}: {check.details}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
