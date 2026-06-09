import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, BarChart3, Clock } from "lucide-react";
import { useEpicStore } from "../stores/epicStore";
import { useConfigStore } from "../stores/configStore";
import { listEpics } from "../lib/tauri";
import { cn, formatRelativeTime, STATUS_COLORS, statusLabel } from "../lib/utils";
import { QuotaCost } from "../components/ui/QuotaCost";
import type { Epic } from "../types/epic";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 20 } },
};

function EpicCard({ epic }: { epic: Epic }) {
  const navigate = useNavigate();
  const progress =
    epic.total_estimated_phases > 0
      ? (epic.completed_phases / epic.total_estimated_phases) * 100
      : 0;

  return (
    <motion.div
      variants={item}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/epic/${epic.id}`)}
      className="bg-surface-1 border border-neutral-800 rounded-xl p-5 cursor-pointer hover:border-neutral-700 transition-colors group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-neutral-100 group-hover:text-emerald-300 transition-colors line-clamp-1">
          {epic.title || "Untitled Epic"}
        </h3>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            STATUS_COLORS[epic.status]
          )}
        >
          {statusLabel(epic.status)}
        </span>
      </div>

      <p className="text-sm text-neutral-400 line-clamp-2 mb-4">
        {epic.objective}
      </p>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-neutral-800 rounded-full mb-3 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            {epic.completed_phases}/{epic.total_estimated_phases} phases
          </span>
          <QuotaCost costUsd={epic.total_cost_usd} />
        </div>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(epic.updated_at)}
        </span>
      </div>
    </motion.div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const epics = useEpicStore((s) => s.epics);
  const setEpics = useEpicStore((s) => s.setEpics);
  const targetDir = useConfigStore((s) => s.targetDir);
  const claudeInstalled = useConfigStore((s) => s.claudeInstalled);

  useEffect(() => {
    if (targetDir) {
      listEpics(targetDir).then(setEpics).catch(console.error);
    }
  }, [targetDir, setEpics]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Welcome section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-neutral-100 mb-2">
          Welcome to ClaudOrchestrator
        </h2>
        <p className="text-neutral-400">
          Spec-driven development powered by Claude Code. Plan, build, and verify with AI.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 mb-8">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate("/epic/new")}
          className="flex items-center gap-4 p-5 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-xl hover:border-emerald-500/40 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Plus className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-neutral-100">Create New Epic</h3>
            <p className="text-sm text-neutral-400">
              Start planning a new feature or project
            </p>
          </div>
        </motion.button>
      </div>

      {/* Status warning */}
      {!claudeInstalled && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
        >
          Claude Code is not installed or not in PATH. Please install it to use
          ClaudOrchestrator.
        </motion.div>
      )}

      {!targetDir && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm"
        >
          No project directory selected. Click &quot;Select Project&quot; in the
          header to get started.
        </motion.div>
      )}

      {/* Epic list */}
      {epics.length > 0 ? (
        <div>
          <h3 className="text-lg font-semibold text-neutral-200 mb-4">
            Active Epics
          </h3>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {epics.map((epic) => (
              <EpicCard key={epic.id} epic={epic} />
            ))}
          </motion.div>
        </div>
      ) : targetDir ? (
        <div className="text-center py-16 text-neutral-500">
          <p className="text-lg mb-2">No epics yet</p>
          <p className="text-sm">
            Create your first epic to start orchestrating development
          </p>
        </div>
      ) : null}
    </div>
  );
}
