import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  FileText,
  ListTodo,
  Layers,
  Terminal,
  FileCode,
  Zap,
  MessageSquare,
  LayoutDashboard,
  Settings,
  History,
  Plus,
  Pin,
} from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { cn } from "../../lib/utils";
import type { TabType } from "../../types/workspace";

const TAB_ICONS: Record<TabType, React.ElementType> = {
  spec: FileText,
  ticket: ListTodo,
  phase: Layers,
  stream: Terminal,
  file: FileCode,
  welcome: Zap,
  clarifying: MessageSquare,
  epic: LayoutDashboard,
  settings: Settings,
  history: History,
  "new-epic": Plus,
};

interface ContextMenuState {
  x: number;
  y: number;
  tabId: string;
}

export function EditorTabs() {
  const openTabs = useWorkspaceStore((s) => s.openTabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const pinTab = useWorkspaceStore((s) => s.pinTab);
  const unpinTab = useWorkspaceStore((s) => s.unpinTab);
  const reorderTabs = useWorkspaceStore((s) => s.reorderTabs);
  const closeAllTabs = useWorkspaceStore((s) => s.closeAllTabs);
  const closeOtherTabs = useWorkspaceStore((s) => s.closeOtherTabs);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Make drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 20, 15);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex !== null && dragIndex !== index) {
      // Only allow reorder within same group (pinned with pinned, unpinned with unpinned)
      const fromTab = openTabs[dragIndex];
      const toTab = openTabs[index];
      if (fromTab && toTab && !!fromTab.pinned === !!toTab.pinned) {
        setDropIndex(index);
      }
    }
  }, [dragIndex, openTabs]);

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      const fromTab = openTabs[dragIndex];
      const toTab = openTabs[index];
      if (fromTab && toTab && !!fromTab.pinned === !!toTab.pinned) {
        reorderTabs(dragIndex, index);
      }
    }
    setDragIndex(null);
    setDropIndex(null);
  }, [dragIndex, openTabs, reorderTabs]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  if (openTabs.length === 0) return null;

  // Find the divider position between pinned and unpinned
  const lastPinnedIndex = openTabs.reduce((acc, tab, i) => tab.pinned ? i : acc, -1);

  return (
    <>
      <div className="h-9 flex-shrink-0 bg-surface-0 border-b border-neutral-800 flex items-end overflow-x-auto scrollbar-thin">
        {openTabs.map((tab, index) => {
          const Icon = TAB_ICONS[tab.type] || FileCode;
          const isActive = tab.id === activeTabId;
          const isPinned = !!tab.pinned;
          const showDivider = isPinned && index === lastPinnedIndex;
          const isDropTarget = dropIndex === index;

          return (
            <div key={tab.id} className="flex items-end flex-shrink-0">
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveTab(tab.id)}
                onContextMenu={(e) => handleContextMenu(e, tab.id)}
                className={cn(
                  "group flex items-center gap-1.5 px-3 h-8 text-xs cursor-pointer transition-colors min-w-0 flex-shrink-0",
                  isPinned ? "max-w-[120px]" : "max-w-[180px]",
                  isActive
                    ? "bg-surface-1 text-neutral-200 border-t-2 border-t-emerald-500"
                    : "bg-surface-0 text-neutral-500 hover:text-neutral-300 border-t-2 border-t-transparent",
                  isDropTarget && "border-l-2 border-l-emerald-400",
                  dragIndex === index && "opacity-50"
                )}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{tab.title}</span>
                {isPinned ? (
                  <Pin className="w-3 h-3 text-neutral-600 flex-shrink-0 rotate-45" />
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className={cn(
                      "w-4 h-4 flex items-center justify-center rounded flex-shrink-0 transition-colors",
                      isActive
                        ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
                        : "text-transparent group-hover:text-neutral-500 hover:!text-neutral-300 hover:bg-neutral-700"
                    )}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {/* Divider between pinned and unpinned */}
              {showDivider && (
                <div className="w-px h-5 bg-neutral-700 mx-0.5 self-center" />
              )}
              {/* Right border for all tabs except when followed by divider */}
              {!showDivider && <div className="w-px h-8 bg-neutral-800/50" />}
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {(() => {
            const tab = openTabs.find((t) => t.id === contextMenu.tabId);
            if (!tab) return null;
            return (
              <>
                {tab.pinned ? (
                  <button
                    onClick={() => { unpinTab(tab.id); setContextMenu(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                  >
                    <Pin className="w-3 h-3" />
                    Unpin Tab
                  </button>
                ) : (
                  <button
                    onClick={() => { pinTab(tab.id); setContextMenu(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                  >
                    <Pin className="w-3 h-3" />
                    Pin Tab
                  </button>
                )}
                <div className="h-px bg-neutral-800 my-1" />
                {!tab.pinned && (
                  <button
                    onClick={() => { closeTab(tab.id); setContextMenu(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Close
                  </button>
                )}
                <button
                  onClick={() => { closeOtherTabs(tab.id); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Close Others
                </button>
                <button
                  onClick={() => { closeAllTabs(); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Close All
                </button>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
