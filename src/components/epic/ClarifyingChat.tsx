import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Check,
  MessageSquare,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { ClarifyingQA } from "../../types/epic";

interface ClarifyingChatProps {
  questions: ClarifyingQA[];
  onSubmitAnswers: (answers: ClarifyingQA[]) => void;
  onRequestMore: () => void;
  onDone: () => void;
  isGenerating: boolean;
}

export function ClarifyingChat({
  questions,
  onSubmitAnswers,
  onRequestMore,
  onDone,
  isGenerating,
}: ClarifyingChatProps) {
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    questions.forEach((q, i) => {
      if (q.answer) initial[i] = q.answer;
    });
    return initial;
  });
  const [activeIndex, setActiveIndex] = useState<number | null>(() => {
    const first = questions.findIndex((q) => !q.answer);
    return first >= 0 ? first : null;
  });
  const [selectedOptions, setSelectedOptions] = useState<Record<number, Set<string>>>({});
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  // Stable identity key for the questions array — changes when questions are added or answers are persisted
  const questionsKey = questions.map((q) => q.question + "|" + (q.answer || "")).join("\n");

  // Re-sync answers state when questions prop changes (e.g., after requestMoreQuestions reload)
  useEffect(() => {
    setAnswers((prev) => {
      const synced: Record<number, string> = {};
      questions.forEach((q, i) => {
        // Keep existing local answer if present, otherwise pick up persisted q.answer
        synced[i] = prev[i] || q.answer || "";
      });
      return synced;
    });
    // Reset activeIndex to first unanswered question using synced answers
    setActiveIndex((prev) => {
      const firstUnanswered = questions.findIndex((q) => !q.answer);
      if (firstUnanswered >= 0) return firstUnanswered;
      if (prev !== null && prev < questions.length) return prev;
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsKey]);

  const allAnswered = questions.every((q, i) => answers[i]?.trim() || q.answer?.trim());

  const toggleOption = (idx: number, label: string, multiSelect: boolean) => {
    setSelectedOptions((prev) => {
      const current = new Set(prev[idx] ?? []);
      if (multiSelect) {
        if (current.has(label)) current.delete(label);
        else current.add(label);
      } else {
        current.clear();
        current.add(label);
      }
      return { ...prev, [idx]: current };
    });
    setShowCustom(false);
    setCustomInput("");
  };

  const confirmAnswer = (idx: number) => {
    const selections = selectedOptions[idx] ?? new Set();
    let answer: string;
    if (showCustom && customInput.trim()) {
      answer = customInput.trim();
    } else if (selections.size > 0) {
      answer = Array.from(selections).join(", ");
    } else {
      return;
    }

    const newAnswers = { ...answers, [idx]: answer };
    setAnswers(newAnswers);

    const updated = questions.map((q, i) => ({
      ...q,
      answer: newAnswers[i] ?? q.answer,
    }));
    onSubmitAnswers(updated);

    // Move to next unanswered
    const nextUnanswered = questions.findIndex((_q, i) => i > idx && !newAnswers[i]);
    setActiveIndex(nextUnanswered >= 0 ? nextUnanswered : null);
    setShowCustom(false);
    setCustomInput("");
  };

  // Only show unanswered questions (skip already-answered ones)
  const unansweredQuestions = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => (!answers[i]?.trim() && !q.answer?.trim()) || activeIndex === i);

  // Check if there's a color/palette question among the options
  const hasColorOptions = (q: ClarifyingQA) =>
    q.options.some((opt) => opt.color || (opt.palette && opt.palette.length > 0));

  return (
    <div className="space-y-2">
      {unansweredQuestions.map(({ q, i }) => {
        const isActive = activeIndex === i;
        const isColor = hasColorOptions(q);

        // Active question — show options
        if (isActive) {
          const currentSelections = selectedOptions[i] ?? new Set();
          const hasSelection = currentSelections.size > 0 || (showCustom && customInput.trim());

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-emerald-500/20 bg-surface-1 overflow-hidden"
            >
              {/* Question */}
              <div className="px-3 py-2.5">
                <p className="text-sm font-medium text-neutral-200">{q.question}</p>
                {q.context && (
                  <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">{q.context}</p>
                )}
                {q.multi_select && (
                  <p className="text-[10px] text-emerald-400 mt-1">Select all that apply</p>
                )}
              </div>

              {/* Options */}
              <div className={cn("px-3 pb-2", isColor ? "space-y-2" : "space-y-1")}>
                {q.options.map((opt) => {
                  const isSelected = currentSelections.has(opt.label);
                  const hasPalette = opt.palette && opt.palette.length > 0;

                  return (
                    <button
                      key={opt.label}
                      onClick={() => toggleOption(i, opt.label, q.multi_select)}
                      className={cn(
                        "w-full text-left rounded-lg border text-xs transition-all",
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-surface-0 border-neutral-800 hover:border-neutral-700",
                        hasPalette ? "px-3 py-3" : "px-3 py-2 flex items-center gap-2"
                      )}
                    >
                      {/* Color swatch option */}
                      {opt.color && !hasPalette ? (
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex-shrink-0 border-2 transition-colors",
                              isSelected ? "border-emerald-500" : "border-neutral-700"
                            )}
                            style={{ backgroundColor: opt.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className={cn("font-medium", isSelected ? "text-emerald-300" : "text-neutral-300")}>
                              {opt.label}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-500 ml-2">{opt.color}</span>
                          </div>
                          <div className={cn(
                            "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors",
                            isSelected ? "bg-emerald-500 border-emerald-500" : "border-neutral-600"
                          )}>
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                        </div>
                      ) : hasPalette ? (
                        /* Full palette option */
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className={cn(
                              "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors",
                              q.multi_select ? "rounded" : "rounded-full",
                              isSelected ? "bg-emerald-500 border-emerald-500" : "border-neutral-600"
                            )}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <span className={cn("font-medium", isSelected ? "text-emerald-300" : "text-neutral-300")}>
                              {opt.label}
                            </span>
                          </div>
                          {opt.description && (
                            <p className="text-[11px] text-neutral-500 mb-2 ml-6">{opt.description}</p>
                          )}
                          <div className="flex gap-1.5 ml-6 flex-wrap">
                            {opt.palette!.map((c, ci) => (
                              <div key={ci} className="flex flex-col items-center gap-0.5">
                                <div
                                  className={cn(
                                    "w-8 h-8 rounded-lg border-2 transition-colors",
                                    isSelected ? "border-emerald-500/50" : "border-neutral-700/50"
                                  )}
                                  style={{ backgroundColor: c.hex }}
                                  title={`${c.name}: ${c.hex}`}
                                />
                                <span className="text-[8px] text-neutral-500 font-mono">{c.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Standard text option */
                        <>
                          <div className={cn(
                            "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors",
                            q.multi_select ? "rounded" : "rounded-full",
                            isSelected ? "bg-emerald-500 border-emerald-500" : "border-neutral-600"
                          )}>
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={cn(isSelected ? "text-emerald-300" : "text-neutral-300")}>
                              {opt.label}
                            </span>
                            {opt.description && (
                              <p className="text-[10px] text-neutral-500 mt-0.5">{opt.description}</p>
                            )}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}

                {/* Custom answer */}
                {!showCustom ? (
                  <button
                    onClick={() => {
                      setShowCustom(true);
                      setSelectedOptions((prev) => ({ ...prev, [i]: new Set() }));
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-neutral-800 hover:border-neutral-600 text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-2 text-xs"
                  >
                    Custom answer
                  </button>
                ) : (
                  <div className="border border-emerald-500/30 rounded-lg p-2">
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="Type your answer..."
                      className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none min-h-[40px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && customInput.trim()) {
                          e.preventDefault();
                          confirmAnswer(i);
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="px-3 py-2 border-t border-neutral-800/50 flex items-center justify-end">
                <button
                  onClick={() => confirmAnswer(i)}
                  disabled={!hasSelection}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    hasSelection
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                  )}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          );
        }

        // Unanswered but not active — show as pending clickable
        return (
          <button
            key={i}
            onClick={() => { setActiveIndex(i); setShowCustom(false); setCustomInput(""); }}
            className="w-full flex items-start gap-2 py-1.5 px-3 rounded-lg hover:bg-surface-1 transition-colors text-left"
          >
            <MessageSquare className="w-3.5 h-3.5 text-neutral-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-neutral-500">{q.question}</p>
          </button>
        );
      })}

      {/* Bottom actions — only when all answered */}
      {allAnswered && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between pt-3 border-t border-neutral-800/50"
        >
          <button
            onClick={onRequestMore}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-neutral-400 border border-neutral-800 hover:text-neutral-200 hover:border-neutral-700 transition-colors"
          >
            {isGenerating && <Loader2 className="w-3 h-3 animate-spin" />}
            Ask more
          </button>
          <button
            onClick={onDone}
            disabled={isGenerating}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
              !isGenerating
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
            )}
          >
            {isGenerating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Generate Specs
          </button>
        </motion.div>
      )}
    </div>
  );
}
