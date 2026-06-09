import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  AlertTriangle,
  PenLine,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface ValidationQuestion {
  question: string;
  context: string;
  category: string;
}

type Answer = "correct" | "needs_changes" | string; // string = custom answer

interface PlanValidationProps {
  questions: ValidationQuestion[];
  onComplete: (allCorrect: boolean, answers: Record<number, Answer>) => void;
  isProcessing: boolean;
}

const categoryLabels: Record<string, string> = {
  feature_completeness: "Features",
  technical: "Technical",
  design: "Design",
  performance: "Performance",
  security: "Security",
  edge_cases: "Edge Cases",
  deployment: "Deployment",
  priority: "Priority",
};

const categoryColors: Record<string, string> = {
  feature_completeness: "text-emerald-400 bg-emerald-500/10",
  technical: "text-blue-400 bg-blue-500/10",
  design: "text-pink-400 bg-pink-500/10",
  performance: "text-amber-400 bg-amber-500/10",
  security: "text-red-400 bg-red-500/10",
  edge_cases: "text-orange-400 bg-orange-500/10",
  deployment: "text-emerald-400 bg-emerald-500/10",
  priority: "text-cyan-400 bg-cyan-500/10",
};

export function PlanValidation({ questions, onComplete, isProcessing }: PlanValidationProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const q = questions[activeIndex];
  const allAnswered = questions.every((_, i) => answers[i] !== undefined);
  const hasChanges = Object.values(answers).some((a) => a !== "correct");

  const submitAnswer = (answer: Answer) => {
    const newAnswers = { ...answers, [activeIndex]: answer };
    setAnswers(newAnswers);
    setShowCustom(false);
    setCustomInput("");

    // Auto-advance to next unanswered
    if (activeIndex < questions.length - 1) {
      const nextUnanswered = questions.findIndex((_, i) => i > activeIndex && !newAnswers[i]);
      if (nextUnanswered >= 0) {
        setActiveIndex(nextUnanswered);
      } else {
        setActiveIndex(activeIndex + 1);
      }
    }
  };

  if (!q) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <Sparkles className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-neutral-100">Plan Validation</h3>
        <p className="text-sm text-neutral-500 mt-1">
          Review your epic plan to ensure it matches your vision
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-neutral-500">
          Question {activeIndex + 1} of {questions.length}
        </span>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveIndex(i); setShowCustom(false); setCustomInput(""); }}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                i === activeIndex
                  ? "bg-emerald-400"
                  : answers[i] === "correct"
                  ? "bg-emerald-400/50"
                  : answers[i]
                  ? "bg-amber-400/50"
                  : "bg-neutral-700"
              )}
            />
          ))}
        </div>
      </div>

      {/* Question card */}
      <motion.div
        key={activeIndex}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="bg-surface-1 border border-neutral-800 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              categoryColors[q.category] || "text-neutral-400 bg-neutral-800"
            )}>
              {categoryLabels[q.category] || q.category}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-neutral-200 mb-2">{q.question}</h4>
          <p className="text-xs text-neutral-500 leading-relaxed">{q.context}</p>
        </div>

        {/* Answer options */}
        <div className="space-y-2 mb-4">
          <button
            onClick={() => submitAnswer("correct")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
              answers[activeIndex] === "correct"
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-surface-1 border-neutral-800 hover:border-neutral-700"
            )}
          >
            <CheckCircle className={cn(
              "w-5 h-5 flex-shrink-0",
              answers[activeIndex] === "correct" ? "text-emerald-400" : "text-neutral-600"
            )} />
            <div>
              <p className="text-sm font-medium text-neutral-200">Correct as planned</p>
              <p className="text-[11px] text-neutral-500">This aspect of the plan matches my expectations</p>
            </div>
          </button>

          <button
            onClick={() => submitAnswer("needs_changes")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
              answers[activeIndex] === "needs_changes"
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-surface-1 border-neutral-800 hover:border-neutral-700"
            )}
          >
            <AlertTriangle className={cn(
              "w-5 h-5 flex-shrink-0",
              answers[activeIndex] === "needs_changes" ? "text-amber-400" : "text-neutral-600"
            )} />
            <div>
              <p className="text-sm font-medium text-neutral-200">Needs changes</p>
              <p className="text-[11px] text-neutral-500">This needs revision — I'll explain in the custom answer</p>
            </div>
          </button>

          {/* Custom answer */}
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-neutral-800 hover:border-neutral-600 text-neutral-500 hover:text-neutral-300 transition-colors text-left"
            >
              <PenLine className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Custom feedback</p>
                <p className="text-[11px]">Provide specific details about what needs to change</p>
              </div>
            </button>
          ) : (
            <div className="bg-surface-1 border border-emerald-500/30 rounded-xl p-4">
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Describe what needs to change..."
                className="w-full bg-transparent text-sm text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none min-h-[60px]"
                autoFocus
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => {
                    if (customInput.trim()) submitAnswer(customInput.trim());
                  }}
                  disabled={!customInput.trim()}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    customInput.trim()
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                  )}
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Already answered indicator */}
        {answers[activeIndex] && answers[activeIndex] !== "correct" && answers[activeIndex] !== "needs_changes" && (
          <div className="mb-4 px-4 py-2 bg-amber-500/5 border border-amber-500/10 rounded-lg text-xs text-amber-400">
            Your feedback: {answers[activeIndex]}
          </div>
        )}
      </motion.div>

      {/* Bottom actions */}
      {allAnswered && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between"
        >
          {hasChanges ? (
            <>
              <p className="text-xs text-amber-400">
                Some items need changes — you can revise the plan or proceed anyway
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onComplete(false, answers)}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 transition-colors"
                >
                  Revise Plan
                </button>
                <button
                  onClick={() => onComplete(true, answers)}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                >
                  Proceed Anyway
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => onComplete(true, answers)}
              disabled={isProcessing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors ml-auto"
            >
              Plan Validated — Ready to Build
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
