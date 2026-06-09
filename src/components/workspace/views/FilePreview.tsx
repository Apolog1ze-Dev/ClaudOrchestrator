import { useState, useEffect, useCallback, useRef } from "react";
import { FileCode, FilePlus, FileEdit, FileX, Save, Loader2 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useOptionalEpicContext } from "../../../contexts/EpicContext";
import { useConfigStore } from "../../../stores/configStore";
import { cn } from "../../../lib/utils";

// Map file extensions to Monaco language IDs
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    rs: "rust", py: "python", go: "go", java: "java", kt: "kotlin",
    rb: "ruby", php: "php", cs: "csharp", cpp: "cpp", c: "c", h: "c",
    html: "html", css: "css", scss: "scss", less: "less",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    xml: "xml", svg: "xml", md: "markdown", mdx: "markdown",
    sql: "sql", sh: "shell", bash: "shell", zsh: "shell",
    dockerfile: "dockerfile", graphql: "graphql", gql: "graphql",
    vue: "html", svelte: "html", astro: "html",
  };
  return map[ext] || "plaintext";
}

interface FilePreviewProps {
  filePath: string;
}

export function FilePreview({ filePath }: FilePreviewProps) {
  const epicCtx = useOptionalEpicContext();
  const targetDir = useConfigStore((s) => s.targetDir);
  const allPhases = epicCtx?.data ? Object.values(epicCtx.data.phases_by_ticket).flat() : [];
  const tickets = epicCtx?.data?.tickets ?? [];

  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find file operation info from phases
  let operation: "create" | "modify" | "delete" | null = null;
  let description = "";
  let phaseTitle = "";
  let ticketTitle = "";

  for (const phase of allPhases) {
    if (!phase.plan) continue;
    const createOp = phase.plan.files_to_create?.find((f) => f.path === filePath);
    if (createOp) {
      operation = "create";
      description = createOp.description;
      phaseTitle = phase.title;
      // Find ticket
      for (const t of tickets) {
        const ticketPhases = epicCtx?.data?.phases_by_ticket[t.id] ?? [];
        if (ticketPhases.some((p) => p.id === phase.id)) {
          ticketTitle = t.title;
          break;
        }
      }
      break;
    }
    const modifyOp = phase.plan.files_to_modify?.find((f) => f.path === filePath);
    if (modifyOp) {
      operation = "modify";
      description = modifyOp.description;
      phaseTitle = phase.title;
      for (const t of tickets) {
        const ticketPhases = epicCtx?.data?.phases_by_ticket[t.id] ?? [];
        if (ticketPhases.some((p) => p.id === phase.id)) {
          ticketTitle = t.title;
          break;
        }
      }
      break;
    }
    if (phase.plan.files_to_delete?.includes(filePath)) {
      operation = "delete";
      phaseTitle = phase.title;
      for (const t of tickets) {
        const ticketPhases = epicCtx?.data?.phases_by_ticket[t.id] ?? [];
        if (ticketPhases.some((p) => p.id === phase.id)) {
          ticketTitle = t.title;
          break;
        }
      }
      break;
    }
  }

  const opColor =
    operation === "create" ? "text-neutral-500" :
    operation === "modify" ? "text-amber-400" :
    operation === "delete" ? "text-red-400" :
    "text-neutral-300";

  const OpIcon =
    operation === "create" ? FilePlus :
    operation === "modify" ? FileEdit :
    operation === "delete" ? FileX :
    FileCode;

  const opLabel =
    operation === "create" ? "New File" :
    operation === "modify" ? "Modified" :
    operation === "delete" ? "To Delete" :
    "File";

  const opBadgeClasses =
    operation === "create" ? "text-neutral-500 bg-neutral-800/50 border-neutral-700" :
    operation === "modify" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
    operation === "delete" ? "text-red-400 bg-red-500/10 border-red-500/20" :
    "text-neutral-400 bg-neutral-800/50 border-neutral-700";

  const isReadOnly = operation === "delete";

  // Load file content — ALWAYS try disk first, fallback to placeholder for "create" operations
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        if (targetDir) {
          // Always try to read from disk first — file may have been created by execution
          const { invoke } = await import("@tauri-apps/api/core");
          const fullPath = targetDir.replace(/\\/g, "/") + "/" + filePath;
          const fileContent = await invoke<string>("read_file_text", { path: fullPath });
          if (!cancelled) {
            setContent(fileContent);
            setOriginalContent(fileContent);
          }
        } else if (operation === "create") {
          // No targetDir — show placeholder
          const commentPrefix = filePath.endsWith(".py") || filePath.endsWith(".rb") ? "#" :
            filePath.endsWith(".html") || filePath.endsWith(".xml") || filePath.endsWith(".svg") ? "<!--" : "//";
          const commentSuffix = commentPrefix === "<!--" ? " -->" : "";
          const placeholder = description
            ? `${commentPrefix} ${description}${commentSuffix}\n`
            : "";
          if (!cancelled) {
            setContent(placeholder);
            setOriginalContent(placeholder);
          }
        }
      } catch (e) {
        // File doesn't exist on disk — fall back to placeholder for "create" operations
        if (!cancelled) {
          if (operation === "create") {
            const commentPrefix = filePath.endsWith(".py") || filePath.endsWith(".rb") ? "#" :
              filePath.endsWith(".html") || filePath.endsWith(".xml") || filePath.endsWith(".svg") ? "<!--" : "//";
            const commentSuffix = commentPrefix === "<!--" ? " -->" : "";
            const placeholder = description
              ? `${commentPrefix} ${description}${commentSuffix}\n`
              : "";
            setContent(placeholder);
            setOriginalContent(placeholder);
          } else {
            setError(String(e));
            setContent("");
            setOriginalContent("");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [filePath, targetDir, operation, description]);

  // Save file to disk
  const saveFile = useCallback(async () => {
    if (!targetDir || isReadOnly) return;
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const fullPath = targetDir.replace(/\\/g, "/") + "/" + filePath;
      await invoke("write_file_text", { path: fullPath, content });
      setOriginalContent(content);
      setHasUnsavedChanges(false);
    } catch (e) {
      console.error("Failed to save file:", e);
    } finally {
      setSaving(false);
    }
  }, [targetDir, filePath, content, isReadOnly]);

  // Handle content changes
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    setContent(value);
    setHasUnsavedChanges(value !== originalContent);

    // Debounced auto-save (2 seconds)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (value !== originalContent && targetDir && !isReadOnly) {
        // Trigger save
        (async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const fullPath = targetDir.replace(/\\/g, "/") + "/" + filePath;
            await invoke("write_file_text", { path: fullPath, content: value });
            setOriginalContent(value);
            setHasUnsavedChanges(false);
          } catch (e) {
            console.error("Auto-save failed:", e);
          }
        })();
      }
    }, 2000);
  }, [originalContent, targetDir, filePath, isReadOnly]);

  // Ctrl+S to save immediately
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  const language = getLanguageFromPath(filePath);

  return (
    <div className={cn("h-full flex flex-col", operation === "delete" && "border-t-2 border-t-red-500/30")}>
      {/* File header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-800 bg-surface-1 flex-shrink-0">
        <OpIcon className={`w-4 h-4 ${opColor}`} />
        <span className="text-sm font-mono text-neutral-300 truncate flex-1">{filePath}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded border ${opBadgeClasses}`}>
          {opLabel}
        </span>
        {hasUnsavedChanges && (
          <button
            onClick={saveFile}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        )}
        {!hasUnsavedChanges && !loading && (
          <span className="text-[10px] text-neutral-600">Saved</span>
        )}
      </div>

      {/* Phase/ticket info */}
      {(phaseTitle || ticketTitle) && (
        <div className="px-4 py-1.5 border-b border-neutral-800/50 bg-surface-0 flex-shrink-0">
          <span className="text-[10px] text-neutral-600">
            {phaseTitle && <>Phase: <span className="text-neutral-500">{phaseTitle}</span></>}
            {phaseTitle && ticketTitle && <span className="mx-1.5">·</span>}
            {ticketTitle && <>Ticket: <span className="text-neutral-500">{ticketTitle}</span></>}
          </span>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <OpIcon className={`w-10 h-10 mx-auto mb-3 ${opColor} opacity-40`} />
              <p className="text-sm text-neutral-400 mb-2">
                {operation === "create"
                  ? "This file will be created during execution"
                  : "Could not read file from disk"}
              </p>
              {description && (
                <p className="text-xs text-neutral-600">{description}</p>
              )}
              {error && operation !== "create" && (
                <p className="text-xs text-red-400/60 mt-2 font-mono">{error}</p>
              )}
            </div>
          </div>
        ) : (
          <Editor
            height="100%"
            language={language}
            value={content}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              readOnly: isReadOnly,
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              renderWhitespace: "selection",
              smoothScrolling: true,
              cursorBlinking: "smooth",
              padding: { top: 12, bottom: 12 },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              renderLineHighlight: "line",
              lineNumbers: "on",
              glyphMargin: false,
              folding: true,
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
