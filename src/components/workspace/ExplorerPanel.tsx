import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  FolderTree,
  FileText,
  ListTodo,
  Layers,
  FileCode,
  FolderOpen,
  FilePlus,
  FileEdit,
  FileX,
  CheckCircle,
  XCircle,
  Circle,
  Loader2,
  ShieldCheck,
  RotateCcw,
  LayoutDashboard,
  Pencil,
  ChevronRight,
} from "lucide-react";
import { ExplorerSection } from "./ExplorerSection";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useOptionalEpicContext } from "../../contexts/EpicContext";
import { useEpicStore } from "../../stores/epicStore";
import { useConfigStore } from "../../stores/configStore";
import { useExecutionStore } from "../../stores/executionStore";
import { cn, STATUS_COLORS, statusLabel, toQuotaUnits, formatQuotaUnits } from "../../lib/utils";
import type { FileTreeNode } from "../../types/workspace";
import type { Phase } from "../../types/epic";
import { useNavigate, useLocation } from "react-router-dom";
import { renameEpic, listDirectoryTree } from "../../lib/tauri";
import type { FileTreeEntry } from "../../lib/tauri";

const SPEC_TYPE_LABELS: Record<string, string> = {
  prd: "PRD",
  tech_spec: "Tech Spec",
  architecture: "Architecture",
  api_spec: "API Spec",
  design_spec: "Design Spec",
  custom: "Custom",
};

// Build file tree from phase plans
function buildFileTree(phases: Phase[]): FileTreeNode[] {
  const fileMap = new Map<string, { operation: "create" | "modify" | "delete"; phaseId: string }>();
  for (const phase of phases) {
    if (!phase.plan) continue;
    for (const f of phase.plan.files_to_create ?? []) {
      fileMap.set(f.path, { operation: "create", phaseId: phase.id });
    }
    for (const f of phase.plan.files_to_modify ?? []) {
      fileMap.set(f.path, { operation: "modify", phaseId: phase.id });
    }
    for (const f of phase.plan.files_to_delete ?? []) {
      fileMap.set(f, { operation: "delete", phaseId: phase.id });
    }
  }

  const tree: FileTreeNode[] = [];
  const dirMap = new Map<string, FileTreeNode>();

  const sortedPaths = [...fileMap.keys()].sort();
  for (const filePath of sortedPaths) {
    const info = fileMap.get(filePath)!;
    const normalized = filePath.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);

    let parentChildren = tree;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath += (currentPath ? "/" : "") + part;
      const isLast = i === parts.length - 1;

      if (isLast) {
        parentChildren.push({
          name: part,
          path: currentPath,
          type: "file",
          operation: info.operation,
          phaseId: info.phaseId,
          children: [],
        });
      } else {
        let dir = dirMap.get(currentPath);
        if (!dir) {
          dir = {
            name: part,
            path: currentPath,
            type: "directory",
            children: [],
          };
          dirMap.set(currentPath, dir);
          parentChildren.push(dir);
        }
        parentChildren = dir.children;
      }
    }
  }

  return tree;
}

function FileTreeItem({ node, depth = 0 }: { node: FileTreeNode; depth?: number }) {
  const openTab = useWorkspaceStore((s) => s.openTab);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const isActive = activeTabId === `file:${node.path}`;
  const [isExpanded, setIsExpanded] = useState(true);

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800/50 transition-colors"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <ChevronRight className={cn("w-3 h-3 text-neutral-500 flex-shrink-0 transition-transform", isExpanded && "rotate-90")} />
          <FolderOpen className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children.map((child) => (
          <FileTreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const opIcon =
    node.operation === "create" ? <FilePlus className="w-3 h-3 text-neutral-500" /> :
    node.operation === "modify" ? <FileEdit className="w-3 h-3 text-amber-400" /> :
    node.operation === "delete" ? <FileX className="w-3 h-3 text-red-400" /> :
    <FileCode className="w-3 h-3 text-neutral-300" />;

  return (
    <button
      onClick={() =>
        openTab({
          id: `file:${node.path}`,
          type: "file",
          title: node.name,
          icon: "FileCode",
          artifactId: node.path,
        })
      }
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-0.5 text-xs hover:bg-neutral-800/50 transition-colors",
        isActive && "bg-emerald-500/10 text-emerald-300",
        node.operation === "create" && !isActive && "text-neutral-500",
        node.operation === "modify" && !isActive && "text-amber-400/70",
        node.operation === "delete" && !isActive && "text-red-400/70 line-through",
        !node.operation && !isActive && "text-neutral-200"
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      {opIcon}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function WorkspaceFileItem({
  entry,
  depth,
  expandedDirs,
  onToggleDir,
  openTab,
  activeTabId,
  targetDir,
}: {
  entry: FileTreeEntry;
  depth: number;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  openTab: (tab: import("../../types/workspace").Tab) => void;
  activeTabId: string | null;
  targetDir: string;
}) {
  const isExpanded = expandedDirs.has(entry.path);

  if (entry.type === "directory") {
    return (
      <div>
        <button
          onClick={() => onToggleDir(entry.path)}
          className="w-full flex items-center gap-1.5 px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800/50 transition-colors"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <ChevronRight className={cn("w-3 h-3 text-neutral-500 flex-shrink-0 transition-transform", isExpanded && "rotate-90")} />
          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-neutral-500" />
          <span className="truncate">{entry.name}</span>
          {entry.children.length > 0 && (
            <span className="ml-auto text-[10px] text-neutral-600">{entry.children.length}</span>
          )}
        </button>
        {isExpanded &&
          entry.children.map((child) => (
            <WorkspaceFileItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              openTab={openTab}
              activeTabId={activeTabId}
              targetDir={targetDir}
            />
          ))}
      </div>
    );
  }

  const isActive = activeTabId === `file:${entry.path}`;

  return (
    <button
      onClick={() =>
        openTab({
          id: `file:${entry.path}`,
          type: "file",
          title: entry.name,
          icon: "FileCode",
          artifactId: entry.path,
        })
      }
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-0.5 text-xs hover:bg-neutral-800/50 transition-colors",
        isActive ? "bg-emerald-500/10 text-emerald-300" : "text-neutral-300"
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <FileCode className="w-3 h-3 text-neutral-500 flex-shrink-0" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function ExplorerPanel() {
  const epicCtx = useOptionalEpicContext();
  const openTab = useWorkspaceStore((s) => s.openTab);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const epics = useEpicStore((s) => s.epics);
  const updateEpic = useEpicStore((s) => s.updateEpic);
  const targetDir = useConfigStore((s) => s.targetDir);
  const location = useLocation();
  const navigate = useNavigate();
  const executionRunning = useExecutionStore((s) => s.isRunning);
  const executionPhases = useExecutionStore((s) => s.phases);
  const executionCost = useExecutionStore((s) => s.totalCostUsd);

  // Epic rename state
  const [renamingEpicId, setRenamingEpicId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleStartRename = (epicId: string, currentTitle: string) => {
    setRenamingEpicId(epicId);
    setRenameValue(currentTitle || "");
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleConfirmRename = async () => {
    if (!renamingEpicId || !targetDir || !renameValue.trim()) {
      setRenamingEpicId(null);
      return;
    }
    try {
      const updated = await renameEpic(renamingEpicId, targetDir, renameValue.trim());
      updateEpic(updated);
    } catch (e) {
      console.error("Failed to rename epic:", e);
    }
    setRenamingEpicId(null);
  };

  // Workspace file tree from disk
  const [workspaceFiles, setWorkspaceFiles] = useState<FileTreeEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const loadWorkspaceFiles = useCallback(async () => {
    if (!targetDir) { setWorkspaceFiles([]); return; }
    try {
      const tree = await listDirectoryTree(targetDir, 4);
      setWorkspaceFiles(tree);
    } catch (e) {
      console.error("Failed to load workspace files:", e);
      setWorkspaceFiles([]);
    }
  }, [targetDir]);

  useEffect(() => {
    loadWorkspaceFiles();
  }, [loadWorkspaceFiles]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const data = epicCtx?.data;
  const step = epicCtx?.step;
  const isProcessing = epicCtx?.isProcessing ?? false;

  const specs = data?.specs ?? [];
  const tickets = data?.tickets ?? [];
  const allPhases = data ? Object.values(data.phases_by_ticket).flat() : [];

  // Build file tree from phases
  const fileTree = useMemo(() => buildFileTree(allPhases), [allPhases]);

  // Determine loading states based on planning step
  const isSpecsLoading = step === "generating_specs" && isProcessing;
  const isTicketsLoading = step === "generating_tickets" && isProcessing;
  const isPhasesLoading = step === "generating_phases" && isProcessing;

  const specsGenerated = specs.length > 0 || (step && ["specs_review", "generating_tickets", "tickets_review", "generating_phases", "phases_review", "ready"].includes(step));
  const ticketsGenerated = tickets.length > 0 || (step && ["tickets_review", "generating_phases", "phases_review", "ready"].includes(step));
  const phasesGenerated = allPhases.length > 0 || (step && ["phases_review", "ready"].includes(step));

  // Data-driven: show sections based on loaded data, not route
  const hasEpicData = !!data;

  return (
    <div className="h-full flex flex-col bg-surface-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-800 flex-shrink-0">
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          Explorer
        </span>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Epics section — always visible when targetDir is set */}
        {targetDir && (
          <ExplorerSection
            id="epics"
            title="Epics"
            icon={LayoutDashboard}
            count={epics.length}
            emptyMessage="No epics yet"
          >
            {epics.map((epic) => (
              <div
                key={epic.id}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-800/50 transition-colors group",
                  location.pathname === `/epic/${epic.id}` && "bg-emerald-500/10 text-emerald-300"
                )}
              >
                {renamingEpicId === epic.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleConfirmRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmRename();
                      if (e.key === "Escape") setRenamingEpicId(null);
                    }}
                    className="flex-1 bg-surface-2 text-neutral-200 text-xs px-1.5 py-0.5 rounded border border-emerald-500/30 focus:outline-none focus:border-emerald-500/60 min-w-0"
                  />
                ) : (
                  <>
                    <button
                      onClick={() => navigate(`/epic/${epic.id}`)}
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", STATUS_COLORS[epic.status]?.split(" ")[0] ?? "bg-neutral-600")} />
                      <span className="truncate text-neutral-300">{epic.title || "Untitled"}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(epic.id, epic.title); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-neutral-700 rounded transition-opacity flex-shrink-0"
                      title="Rename epic"
                    >
                      <Pencil className="w-3 h-3 text-neutral-500" />
                    </button>
                    <span className="text-[10px] text-neutral-600 flex-shrink-0">{statusLabel(epic.status)}</span>
                  </>
                )}
              </div>
            ))}
          </ExplorerSection>
        )}

        {/* Artifact sections — visible when an epic is loaded */}
        {hasEpicData && (
          <>
            {/* Specs */}
            <ExplorerSection
              id="specs"
              title="Specs"
              icon={FileText}
              count={specs.length}
              isLoading={isSpecsLoading}
              emptyMessage={specsGenerated ? "No specs" : "Specs will be generated after clarifying"}
            >
              {specs.map((spec) => {
                const isActive = activeTabId === `spec:${spec.id}`;
                return (
                  <button
                    key={spec.id}
                    onClick={() =>
                      openTab({
                        id: `spec:${spec.id}`,
                        type: "spec",
                        title: SPEC_TYPE_LABELS[spec.spec_type] ?? spec.title,
                        icon: "FileText",
                        epicId: data?.epic.id,
                        artifactId: spec.id,
                      })
                    }
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-800/50 transition-colors",
                      isActive ? "bg-emerald-500/10 text-emerald-300" : "text-neutral-400"
                    )}
                  >
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{SPEC_TYPE_LABELS[spec.spec_type] ?? spec.title}</span>
                  </button>
                );
              })}
            </ExplorerSection>

            {/* Tickets */}
            <ExplorerSection
              id="tickets"
              title="Tickets"
              icon={ListTodo}
              count={tickets.length}
              isLoading={isTicketsLoading}
              emptyMessage={ticketsGenerated ? "No tickets" : "Tickets generated after specs approval"}
            >
              {[...tickets]
                .sort((a, b) => a.priority - b.priority)
                .map((ticket, index) => {
                  const isActive = activeTabId === `ticket:${ticket.id}`;
                  const displayNum = index + 1;
                  return (
                    <button
                      key={ticket.id}
                      onClick={() =>
                        openTab({
                          id: `ticket:${ticket.id}`,
                          type: "ticket",
                          title: ticket.title,
                          icon: "ListTodo",
                          epicId: data?.epic.id,
                          artifactId: ticket.id,
                        })
                      }
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-neutral-800/50 transition-colors",
                        isActive ? "bg-emerald-500/10 text-emerald-300" : "text-neutral-400"
                      )}
                    >
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full flex-shrink-0",
                        ticket.status === "done" ? "bg-emerald-400" :
                        ticket.status === "failed" ? "bg-red-400" :
                        ticket.status === "in_progress" ? "bg-emerald-400" :
                        "bg-neutral-600"
                      )} />
                      <span className="text-neutral-600 font-mono flex-shrink-0 w-4 text-right">{displayNum}</span>
                      <span className="truncate">{ticket.title}</span>
                    </button>
                  );
                })}
            </ExplorerSection>

            {/* Phases */}
            <ExplorerSection
              id="phases"
              title="Phases"
              icon={Layers}
              count={allPhases.length}
              isLoading={isPhasesLoading}
              emptyMessage={phasesGenerated ? "No phases" : "Phases planned after ticket approval"}
            >
              {tickets.map((ticket) => {
                const ticketPhases = data?.phases_by_ticket[ticket.id] ?? [];
                if (ticketPhases.length === 0) return null;
                return (
                  <div key={ticket.id}>
                    <div className="px-3 py-1 text-[10px] font-medium text-neutral-500 truncate">
                      {ticket.title}
                    </div>
                    {ticketPhases.map((phase) => {
                      const isActive = activeTabId === `phase:${phase.id}`;
                      const StatusIcon =
                        phase.status === "passed" ? CheckCircle :
                        phase.status === "failed" ? XCircle :
                        phase.status === "executing" ? Loader2 :
                        phase.status === "verifying" ? ShieldCheck :
                        phase.status === "remediating" ? RotateCcw :
                        Circle;
                      const statusColor =
                        phase.status === "passed" ? "text-emerald-400" :
                        phase.status === "failed" ? "text-red-400" :
                        phase.status === "executing" ? "text-emerald-400" :
                        phase.status === "verifying" ? "text-amber-400" :
                        phase.status === "remediating" ? "text-orange-400" :
                        "text-neutral-700";

                      return (
                        <button
                          key={phase.id}
                          onClick={() =>
                            openTab({
                              id: `phase:${phase.id}`,
                              type: "phase",
                              title: phase.title,
                              icon: "Layers",
                              epicId: data?.epic.id,
                              artifactId: phase.id,
                            })
                          }
                          className={cn(
                            "w-full flex items-center gap-1.5 px-3 pl-5 py-0.5 text-xs hover:bg-neutral-800/50 transition-colors",
                            isActive ? "bg-emerald-500/10 text-emerald-300" : "text-neutral-400"
                          )}
                        >
                          <StatusIcon className={cn("w-3 h-3 flex-shrink-0", statusColor, phase.status === "executing" && "animate-spin")} />
                          <span className="truncate">{phase.title}</span>
                          {phase.verification?.overall_score != null && (
                            <span className={cn(
                              "ml-auto text-[10px] font-mono",
                              phase.verification.overall_score >= 70 ? "text-emerald-400" : "text-red-400"
                            )}>
                              {phase.verification.overall_score}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </ExplorerSection>

            {/* Planned Changes */}
            <ExplorerSection
              id="project-files"
              title="Planned Changes"
              icon={FileEdit}
              count={fileTree.length > 0 ? [...new Set(allPhases.flatMap(p => [
                ...(p.plan?.files_to_create?.map(f => f.path) ?? []),
                ...(p.plan?.files_to_modify?.map(f => f.path) ?? []),
                ...(p.plan?.files_to_delete ?? []),
              ]))].length : 0}
              emptyMessage="File operations will appear after planning"
            >
              {fileTree.map((node) => (
                <FileTreeItem key={node.path} node={node} />
              ))}
            </ExplorerSection>
          </>
        )}

        {/* Workspace Files — always visible when targetDir is set */}
        {targetDir && (
          <ExplorerSection
            id="workspace-files"
            title="Workspace Files"
            icon={FolderTree}
            count={workspaceFiles.length}
            emptyMessage="No files in workspace"
          >
            {workspaceFiles.map((entry) => (
              <WorkspaceFileItem
                key={entry.path}
                entry={entry}
                depth={0}
                expandedDirs={expandedDirs}
                onToggleDir={toggleDir}
                openTab={openTab}
                activeTabId={activeTabId}
                targetDir={targetDir}
              />
            ))}
          </ExplorerSection>
        )}
      </div>

      {/* Execution progress summary — fixed at bottom */}
      {executionRunning && executionPhases.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2.5 border-t border-neutral-800 bg-surface-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Progress</span>
            <span className="text-[10px] text-neutral-500 font-mono">{formatQuotaUnits(toQuotaUnits(executionCost, useConfigStore.getState().planInfo?.usage_multiplier ?? 1))}</span>
          </div>
          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-500"
              style={{
                width: `${executionPhases.length > 0
                  ? (executionPhases.filter((p) => p.status === "passed" || p.status === "failed").length / executionPhases.length) * 100
                  : 0}%`,
              }}
            />
          </div>
          <div className="text-[10px] text-neutral-500">
            {executionPhases.filter((p) => p.status === "passed").length}/{executionPhases.length} completed
            {executionPhases.find((p) => p.status === "executing") && (
              <span className="text-emerald-400 ml-1.5">
                • {executionPhases.find((p) => p.status === "executing")?.title}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
