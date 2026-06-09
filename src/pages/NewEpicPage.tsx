import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { useConfigStore } from "../stores/configStore";
import { useEpicStore } from "../stores/epicStore";
import { createEpic } from "../lib/tauri";
import { cn } from "../lib/utils";

export function NewEpicPage() {
  const navigate = useNavigate();
  const targetDir = useConfigStore((s) => s.targetDir);
  const config = useConfigStore((s) => s.config);
  const addEpic = useEpicStore((s) => s.addEpic);

  const [objective, setObjective] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!targetDir || !objective.trim()) return;
    setIsCreating(true);
    try {
      const epic = await createEpic(objective.trim(), targetDir, config.models);
      addEpic(epic);
      // Navigate to the epic page — scouting will start there
      navigate(`/epic/${epic.id}`);
    } catch (err) {
      console.error("Failed to create epic:", err);
      setIsCreating(false);
    }
  }, [targetDir, objective, config.models, addEpic, navigate]);

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-3xl mx-auto p-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-neutral-100 mb-2">
          What do you want to build?
        </h2>
        <p className="text-neutral-400">
          Describe your objective. The AI will analyze your codebase, ask clarifying questions,
          and create detailed specs and plans — with your approval at each step.
        </p>
      </div>

      <div className="bg-surface-1 border border-neutral-800 rounded-xl p-6">
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g., Build a REST API for user authentication with JWT tokens, email verification, and password reset flow..."
          className="w-full h-40 bg-transparent text-neutral-100 placeholder:text-neutral-600 resize-none focus:outline-none text-lg leading-relaxed"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey && objective.trim() && targetDir) {
              handleCreate();
            }
          }}
        />

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-800">
          <p className="text-xs text-neutral-600">
            {objective.length > 0 && `${objective.length} characters`}
          </p>
          <button
            onClick={handleCreate}
            disabled={!objective.trim() || !targetDir || isCreating}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
              objective.trim() && targetDir && !isCreating
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-neutral-800 text-neutral-600 cursor-not-allowed"
            )}
          >
            {isCreating && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            Start Planning
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!targetDir && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm text-center"
        >
          Select a project directory first (click the folder icon in the status bar)
        </motion.div>
      )}
    </div>
    </div>
  );
}
