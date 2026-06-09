import { motion } from "framer-motion";
import {
  Search,
  MessageSquare,
  FileText,
  ListTodo,
  Layers,
  CheckCircle,
  Loader2,
  Circle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { PlanningStep } from "../../types/epic";

const STEPS: { id: PlanningStep; label: string; icon: typeof Search }[] = [
  { id: "scouting", label: "Scout", icon: Search },
  { id: "clarifying", label: "Clarify", icon: MessageSquare },
  { id: "specs_review", label: "Specs", icon: FileText },
  { id: "tickets_review", label: "Tickets", icon: ListTodo },
  { id: "phases_review", label: "Phases", icon: Layers },
  { id: "ready", label: "Ready", icon: CheckCircle },
];

const STEP_ORDER: PlanningStep[] = [
  "draft", "scouting", "clarifying", "generating_specs", "specs_review",
  "generating_tickets", "tickets_review", "generating_phases", "phases_review", "ready",
];

function stepIndex(step: PlanningStep): number {
  return STEP_ORDER.indexOf(step);
}

interface PlanningProgressProps {
  currentStep: PlanningStep;
  isActive: boolean; // Is a step currently processing?
}

export function PlanningProgress({ currentStep, isActive }: PlanningProgressProps) {
  const currentIdx = stepIndex(currentStep);

  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {STEPS.map((step, i) => {
        const stepIdx = stepIndex(step.id);
        const isDone = currentIdx > stepIdx;
        const isCurrent = currentStep === step.id ||
          (step.id === "specs_review" && currentStep === "generating_specs") ||
          (step.id === "tickets_review" && currentStep === "generating_tickets") ||
          (step.id === "phases_review" && currentStep === "generating_phases");
        const isProcessing = isCurrent && isActive;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            <motion.div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                isDone
                  ? "bg-emerald-500/10 text-emerald-400"
                  : isCurrent
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-neutral-600"
              )}
              animate={{ scale: isCurrent ? 1.05 : 1 }}
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isDone ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : isCurrent ? (
                <Icon className="w-3.5 h-3.5" />
              ) : (
                <Circle className="w-3.5 h-3.5" />
              )}
              {step.label}
            </motion.div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-6 h-px mx-1",
                  isDone ? "bg-emerald-500/50" : "bg-neutral-800"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
