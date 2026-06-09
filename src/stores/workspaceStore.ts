import { create } from "zustand";
import type { Tab, ExplorerSection } from "../types/workspace";

interface WorkspaceStore {
  // Tab management
  openTabs: Tab[];
  activeTabId: string | null;

  // Panel visibility and sizing
  explorerCollapsed: boolean;
  agentPanelCollapsed: boolean;
  explorerWidth: number;
  agentPanelWidth: number;

  // Explorer state
  activeExplorerSection: ExplorerSection;
  collapsedSections: Set<string>;

  // Resize state
  isResizingExplorer: boolean;
  isResizingAgentPanel: boolean;

  // Tab actions
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  // Panel actions
  toggleExplorer: () => void;
  toggleAgentPanel: () => void;
  setExplorerCollapsed: (collapsed: boolean) => void;
  setAgentPanelCollapsed: (collapsed: boolean) => void;
  setExplorerWidth: (width: number) => void;
  setAgentPanelWidth: (width: number) => void;

  // Explorer actions
  setActiveExplorerSection: (section: ExplorerSection) => void;
  toggleSection: (sectionId: string) => void;
  isSectionCollapsed: (sectionId: string) => boolean;

  // Resize actions
  setResizingExplorer: (resizing: boolean) => void;
  setResizingAgentPanel: (resizing: boolean) => void;

  // Workspace reset
  resetWorkspace: () => void;
}

const EXPLORER_MIN = 200;
const EXPLORER_MAX = 400;
const AGENT_MIN = 300;
const AGENT_MAX = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Sort tabs so pinned tabs come first, maintaining relative order within each group */
function sortTabs(tabs: Tab[]): Tab[] {
  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);
  return [...pinned, ...unpinned];
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // Initial state
  openTabs: [],
  activeTabId: null,

  explorerCollapsed: false,
  agentPanelCollapsed: true, // collapsed by default (Cursor-style)
  explorerWidth: 260,
  agentPanelWidth: 380,

  activeExplorerSection: "files",
  collapsedSections: new Set<string>(),

  isResizingExplorer: false,
  isResizingAgentPanel: false,

  // Tab actions
  openTab: (tab) =>
    set((state) => {
      const existing = state.openTabs.find((t) => t.id === tab.id);
      if (existing) {
        return { activeTabId: tab.id };
      }
      return {
        openTabs: sortTabs([...state.openTabs, tab]),
        activeTabId: tab.id,
      };
    }),

  closeTab: (tabId) =>
    set((state) => {
      const tab = state.openTabs.find((t) => t.id === tabId);
      // Don't close pinned tabs via close button
      if (tab?.pinned) return state;

      const idx = state.openTabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return state;

      const newTabs = state.openTabs.filter((t) => t.id !== tabId);
      let newActiveId = state.activeTabId;

      if (state.activeTabId === tabId) {
        if (newTabs.length === 0) {
          newActiveId = null;
        } else if (idx >= newTabs.length) {
          newActiveId = newTabs[newTabs.length - 1].id;
        } else {
          newActiveId = newTabs[idx].id;
        }
      }

      return { openTabs: newTabs, activeTabId: newActiveId };
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeAllTabs: () =>
    set((state) => {
      // Keep pinned tabs
      const pinned = state.openTabs.filter((t) => t.pinned);
      return {
        openTabs: pinned,
        activeTabId: pinned.length > 0 ? pinned[0].id : null,
      };
    }),

  closeOtherTabs: (tabId) =>
    set((state) => ({
      openTabs: state.openTabs.filter((t) => t.id === tabId || t.pinned),
      activeTabId: tabId,
    })),

  pinTab: (tabId) =>
    set((state) => {
      const newTabs = state.openTabs.map((t) =>
        t.id === tabId ? { ...t, pinned: true } : t
      );
      return { openTabs: sortTabs(newTabs) };
    }),

  unpinTab: (tabId) =>
    set((state) => {
      const newTabs = state.openTabs.map((t) =>
        t.id === tabId ? { ...t, pinned: false } : t
      );
      return { openTabs: sortTabs(newTabs) };
    }),

  reorderTabs: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex === toIndex) return state;
      const newTabs = [...state.openTabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { openTabs: newTabs };
    }),

  // Panel actions
  toggleExplorer: () =>
    set((state) => ({ explorerCollapsed: !state.explorerCollapsed })),

  toggleAgentPanel: () =>
    set((state) => ({ agentPanelCollapsed: !state.agentPanelCollapsed })),

  setExplorerCollapsed: (collapsed) => set({ explorerCollapsed: collapsed }),
  setAgentPanelCollapsed: (collapsed) => set({ agentPanelCollapsed: collapsed }),

  setExplorerWidth: (width) =>
    set({ explorerWidth: clamp(width, EXPLORER_MIN, EXPLORER_MAX) }),

  setAgentPanelWidth: (width) =>
    set({ agentPanelWidth: clamp(width, AGENT_MIN, AGENT_MAX) }),

  // Explorer actions
  setActiveExplorerSection: (section) =>
    set({ activeExplorerSection: section }),

  toggleSection: (sectionId) =>
    set((state) => {
      const next = new Set(state.collapsedSections);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return { collapsedSections: next };
    }),

  isSectionCollapsed: (sectionId) => get().collapsedSections.has(sectionId),

  // Resize actions
  setResizingExplorer: (resizing) => set({ isResizingExplorer: resizing }),
  setResizingAgentPanel: (resizing) => set({ isResizingAgentPanel: resizing }),

  // Workspace reset
  resetWorkspace: () =>
    set({
      openTabs: [],
      activeTabId: null,
      collapsedSections: new Set<string>(),
    }),
}));
