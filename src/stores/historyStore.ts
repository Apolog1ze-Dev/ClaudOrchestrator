import { create } from "zustand";
import type { Epic, EpicStatus } from "../types/epic";
import type { EpicFull } from "../lib/tauri";
import { listEpics, loadEpicFull } from "../lib/tauri";

type DateRange = "all" | "today" | "week" | "month";

interface HistoryFilters {
  status: EpicStatus | "all";
  dateRange: DateRange;
  search: string;
}

interface HistoryStats {
  totalEpics: number;
  completedEpics: number;
  failedEpics: number;
  totalCostUsd: number;
  totalPhasesCompleted: number;
  totalPhasesPlanned: number;
  successRate: number;
}

interface HistoryStore {
  epics: Epic[];
  expandedEpicId: string | null;
  epicDetails: Record<string, EpicFull>;
  filters: HistoryFilters;
  stats: HistoryStats;
  loading: boolean;

  loadHistory: (targetDir: string) => Promise<void>;
  toggleExpand: (epicId: string, targetDir: string) => Promise<void>;
  setFilter: (filters: Partial<HistoryFilters>) => void;
  getFilteredEpics: () => Epic[];
}

function computeStats(epics: Epic[]): HistoryStats {
  const completed = epics.filter((e) => e.status === "completed").length;
  const failed = epics.filter((e) => e.status === "failed").length;
  const totalPhasesDone = epics.reduce((sum, e) => sum + e.completed_phases, 0);
  const totalPhasesAll = epics.reduce((sum, e) => sum + e.total_estimated_phases, 0);
  return {
    totalEpics: epics.length,
    completedEpics: completed,
    failedEpics: failed,
    totalCostUsd: epics.reduce((sum, e) => sum + e.total_cost_usd, 0),
    totalPhasesCompleted: totalPhasesDone,
    totalPhasesPlanned: totalPhasesAll,
    successRate: completed + failed > 0 ? (completed / (completed + failed)) * 100 : 0,
  };
}

function isInDateRange(isoDate: string, range: DateRange): boolean {
  if (range === "all") return true;
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / 86400000;
  if (range === "today") return diffDays < 1;
  if (range === "week") return diffDays < 7;
  if (range === "month") return diffDays < 30;
  return true;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  epics: [],
  expandedEpicId: null,
  epicDetails: {},
  filters: { status: "all", dateRange: "all", search: "" },
  stats: {
    totalEpics: 0,
    completedEpics: 0,
    failedEpics: 0,
    totalCostUsd: 0,
    totalPhasesCompleted: 0,
    totalPhasesPlanned: 0,
    successRate: 0,
  },
  loading: false,

  loadHistory: async (targetDir) => {
    set({ loading: true });
    try {
      const epics = await listEpics(targetDir);
      set({ epics, stats: computeStats(epics), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  toggleExpand: async (epicId, targetDir) => {
    const { expandedEpicId, epicDetails } = get();
    if (expandedEpicId === epicId) {
      set({ expandedEpicId: null });
      return;
    }
    set({ expandedEpicId: epicId });
    if (!epicDetails[epicId]) {
      try {
        const detail = await loadEpicFull(epicId, targetDir);
        set((s) => ({ epicDetails: { ...s.epicDetails, [epicId]: detail } }));
      } catch {
        // keep expanded but without detail
      }
    }
  },

  setFilter: (partial) =>
    set((s) => ({ filters: { ...s.filters, ...partial } })),

  getFilteredEpics: () => {
    const { epics, filters } = get();
    return epics.filter((e) => {
      if (filters.status !== "all" && e.status !== filters.status) return false;
      if (!isInDateRange(e.updated_at, filters.dateRange)) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !e.title.toLowerCase().includes(q) &&
          !e.objective.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  },
}));
