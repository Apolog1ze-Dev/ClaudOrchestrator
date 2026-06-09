// ─── Workspace Types ─────────────────────────────────────────────────────────

export type TabType =
  | "spec"
  | "ticket"
  | "phase"
  | "stream"
  | "file"
  | "welcome"
  | "clarifying"
  | "epic"
  | "settings"
  | "history"
  | "new-epic";

export interface Tab {
  id: string; // format: "type:artifactId" e.g. "spec:abc123"
  type: TabType;
  title: string;
  icon: string; // lucide icon name
  epicId?: string;
  artifactId?: string;
  pinned?: boolean;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  /** Planned operation from phase plans */
  operation?: "create" | "modify" | "delete";
  /** Which phase references this file */
  phaseId?: string;
  children: FileTreeNode[];
}

export type ExplorerSection = "files" | "specs" | "tickets" | "phases" | "epics";
