import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  CheckCircle2,
  BarChart3,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  Activity,
  FolderOpen,
  X,
} from "lucide-react";
import { cn, STATUS_COLORS, statusLabel, formatRelativeTime, formatDuration } from "../lib/utils";
import { QuotaCost } from "../components/ui/QuotaCost";
import { useHistoryStore } from "../stores/historyStore";
import { useConfigStore } from "../stores/configStore";
import type { RecentProject } from "../stores/configStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useEpicStore } from "../stores/epicStore";
import { useChatStore } from "../stores/chatStore";
import type { Epic, Phase } from "../types/epic";
import type { EpicFull } from "../lib/tauri";
import type { EpicStatus } from "../types/epic";

const STATUS_OPTIONS: Array<{ value: EpicStatus | "all"; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "executing", label: "Executing" },
  { value: "ready", label: "Ready" },
  { value: "planning", label: "Planning" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
];

const DATE_RANGES = [
  { value: "all" as const, label: "All Time" },
  { value: "today" as const, label: "Today" },
  { value: "week" as const, label: "Week" },
  { value: "month" as const, label: "Month" },
];

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-surface-1 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs text-neutral-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-neutral-100">{value}</p>
    </div>
  );
}

function PhaseTimeline({ detail }: { detail: EpicFull }) {
  const allPhases: (Phase & { ticketTitle: string })[] = [];
  for (const ticket of detail.tickets) {
    const phases = detail.phases_by_ticket[ticket.id] ?? [];
    for (const phase of phases) {
      allPhases.push({ ...phase, ticketTitle: ticket.title });
    }
  }
  allPhases.sort((a, b) => {
    const aTime = a.execution?.started_at ?? a.created_at;
    const bTime = b.execution?.started_at ?? b.created_at;
    return aTime.localeCompare(bTime);
  });

  if (allPhases.length === 0) {
    return (
      <p className="text-xs text-neutral-600 py-2">No phases executed yet</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {allPhases.map((phase) => (
        <div
          key={phase.id}
          className="flex items-center gap-3 px-3 py-2 bg-surface-0 rounded-lg text-xs"
        >
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full flex-shrink-0",
              phase.status === "passed"
                ? "bg-emerald-400"
                : phase.status === "failed"
                  ? "bg-red-400"
                  : phase.status === "executing"
                    ? "bg-amber-400"
                    : "bg-neutral-600"
            )}
          />
          <span className="text-neutral-300 flex-1 truncate" title={phase.title}>
            {phase.title}
          </span>
          <span className="text-neutral-600 truncate max-w-[120px]" title={phase.ticketTitle}>
            {phase.ticketTitle}
          </span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium",
              STATUS_COLORS[phase.status]
            )}
          >
            {statusLabel(phase.status)}
          </span>
          {phase.duration_ms > 0 && (
            <span className="text-neutral-500 whitespace-nowrap">
              {formatDuration(phase.duration_ms)}
            </span>
          )}
          {phase.cost_usd > 0 && (
            <QuotaCost costUsd={phase.cost_usd} iconSize="w-2.5 h-2.5" className="text-[10px]" />
          )}
          {phase.execution?.files_changed && phase.execution.files_changed.length > 0 && (
            <span className="text-neutral-600 flex items-center gap-0.5">
              <FileText className="w-2.5 h-2.5" />
              {phase.execution.files_changed.length}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function HistoryEpicCard({ epic }: { epic: Epic }) {
  const navigate = useNavigate();
  const targetDir = useConfigStore((s) => s.targetDir);
  const expandedEpicId = useHistoryStore((s) => s.expandedEpicId);
  const epicDetails = useHistoryStore((s) => s.epicDetails);
  const toggleExpand = useHistoryStore((s) => s.toggleExpand);

  const isExpanded = expandedEpicId === epic.id;
  const detail = epicDetails[epic.id];
  const progress =
    epic.total_estimated_phases > 0
      ? (epic.completed_phases / epic.total_estimated_phases) * 100
      : 0;

  return (
    <motion.div
      layout
      className="bg-surface-1 border border-neutral-800 rounded-xl overflow-hidden"
    >
      {/* Card header */}
      <button
        onClick={() => targetDir && toggleExpand(epic.id, targetDir)}
        className="w-full text-left p-4 hover:bg-surface-0/30 transition-colors"
      >
        <div className="flex items-start gap-3">
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="mt-0.5 text-neutral-500 flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-neutral-100 truncate pr-3">
                {epic.title || "Untitled Epic"}
              </h3>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
                  STATUS_COLORS[epic.status]
                )}
              >
                {statusLabel(epic.status)}
              </span>
            </div>

            <p className="text-sm text-neutral-400 line-clamp-1 mb-3">
              {epic.objective}
            </p>

            {/* Progress bar */}
            <div className="w-full h-1 bg-neutral-800 rounded-full mb-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
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
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-neutral-800/50">
              <div className="flex items-center justify-between mt-3 mb-3">
                <h4 className="text-xs font-semibold text-neutral-400">
                  Phase Execution Timeline
                </h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/epic/${epic.id}`);
                  }}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Open Epic
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {detail ? (
                <PhaseTimeline detail={detail} />
              ) : (
                <div className="flex items-center gap-2 text-xs text-neutral-500 py-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading details...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RecentProjectsSection() {
  const targetDir = useConfigStore((s) => s.targetDir);
  const recentProjects = useConfigStore((s) => s.recentProjects);
  const setTargetDir = useConfigStore((s) => s.setTargetDir);
  const addRecentProject = useConfigStore((s) => s.addRecentProject);
  const removeRecentProject = useConfigStore((s) => s.removeRecentProject);
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
  const resetEpics = useEpicStore((s) => s.resetEpics);
  const resetChat = useChatStore((s) => s.resetChat);

  if (recentProjects.length === 0) return null;

  const switchProject = (path: string) => {
    if (path === targetDir) return;
    resetWorkspace();
    resetEpics();
    resetChat();
    setTargetDir(path);
    addRecentProject(path);
  };

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-neutral-400 mb-3 flex items-center gap-2">
        <FolderOpen className="w-4 h-4" />
        Recent Projects
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {recentProjects.map((project: RecentProject) => {
          const isActive = project.path === targetDir;
          return (
            <div
              key={project.path}
              onClick={() => switchProject(project.path)}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors",
                isActive
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : "bg-surface-1 border-neutral-800 hover:border-neutral-700"
              )}
            >
              <FolderOpen
                className={cn(
                  "w-5 h-5 flex-shrink-0",
                  isActive ? "text-emerald-400" : "text-neutral-600"
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium truncate",
                    isActive ? "text-emerald-300" : "text-neutral-200"
                  )}
                >
                  {project.name}
                  {isActive && (
                    <span className="ml-2 text-[10px] font-normal text-emerald-500">
                      active
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-neutral-600 truncate">
                  {project.path}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[10px] text-neutral-600 whitespace-nowrap">
                  {formatRelativeTime(project.lastOpenedAt)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentProject(project.path);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-600 hover:text-red-400 transition-all"
                  title="Remove from recent"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HistoryPage() {
  const targetDir = useConfigStore((s) => s.targetDir);
  const {
    loading,
    stats,
    filters,
    setFilter,
    loadHistory,
    getFilteredEpics,
  } = useHistoryStore();

  useEffect(() => {
    if (targetDir) {
      loadHistory(targetDir);
    }
  }, [targetDir, loadHistory]);

  const filtered = getFilteredEpics();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8">
        <h2 className="text-2xl font-bold text-neutral-100 mb-2">History</h2>
        <p className="text-neutral-400 mb-6">
          Recent projects and execution history
        </p>

        {/* Recent Projects */}
        <RecentProjectsSection />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Total Epics"
            value={stats.totalEpics}
            icon={Activity}
            color="text-blue-400"
          />
          <StatCard
            label="Completed"
            value={stats.completedEpics}
            icon={CheckCircle2}
            color="text-emerald-400"
          />
          <StatCard
            label="Success Rate"
            value={
              stats.completedEpics + stats.failedEpics > 0
                ? `${Math.round(stats.successRate)}%`
                : "--"
            }
            icon={BarChart3}
            color="text-amber-400"
          />
          <StatCard
            label="Total Cost"
            value={`$${stats.totalCostUsd.toFixed(2)}`}
            icon={Clock}
            color="text-purple-400"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Search epics..."
              value={filters.search}
              onChange={(e) => setFilter({ search: e.target.value })}
              className="w-full bg-surface-1 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/30"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilter({ status: e.target.value as EpicStatus | "all" })
              }
              className="appearance-none bg-surface-1 border border-neutral-800 rounded-lg px-3 py-2 pr-8 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500/30 cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
          </div>

          {/* Date range */}
          <div className="flex items-center bg-surface-1 border border-neutral-800 rounded-lg p-0.5">
            {DATE_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => setFilter({ dateRange: range.value })}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  filters.dateRange === range.value
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-neutral-500 hover:text-neutral-300"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Epic list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading history...
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map((epic) => (
              <HistoryEpicCard key={epic.id} epic={epic} />
            ))}
          </div>
        ) : stats.totalEpics > 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <Search className="w-10 h-10 text-neutral-700 mb-3" />
            <p className="text-lg">No matching epics</p>
            <p className="text-sm text-neutral-600 mt-1">
              Try adjusting your filters
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Clock className="w-12 h-12 text-neutral-700 mb-4 mx-auto" />
              <p className="text-lg">No history yet</p>
              <p className="text-sm text-neutral-600 mt-1">
                Completed epics will appear here
              </p>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
