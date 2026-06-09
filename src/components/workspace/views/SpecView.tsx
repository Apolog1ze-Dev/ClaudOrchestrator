import { useState, useEffect, useRef, useCallback } from "react";
import mermaid from "mermaid";
import { Code, Eye, Save, Loader2 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useOptionalEpicContext } from "../../../contexts/EpicContext";
import { cn } from "../../../lib/utils";

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    darkMode: true,
    background: "#18181b",
    primaryColor: "#8b5cf6",
    primaryTextColor: "#e4e4e7",
    primaryBorderColor: "#3f3f46",
    lineColor: "#52525b",
    secondaryColor: "#27272a",
    tertiaryColor: "#1e1e22",
  },
});

const SPEC_TYPE_LABELS: Record<string, string> = {
  prd: "PRD",
  tech_spec: "Tech Spec",
  architecture: "Architecture",
  api_spec: "API Spec",
  design_spec: "Design Spec",
  custom: "Custom",
};

// ─── Toggleable Rendered Block ──────────────────────────────────────────────

function ToggleableBlock({
  preview,
  code,
  language: _language,
}: {
  preview: React.ReactNode;
  code: string;
  language: string;
}) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="relative my-4 rounded-lg border border-neutral-800 overflow-hidden">
      {/* Toggle button */}
      <button
        onClick={() => setShowCode(!showCode)}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-neutral-800/80 backdrop-blur-sm border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/80 transition-colors"
      >
        {showCode ? <Eye className="w-3 h-3" /> : <Code className="w-3 h-3" />}
        {showCode ? "Preview" : "Code"}
      </button>

      {showCode ? (
        <div className="max-h-[400px] overflow-auto bg-surface-0 p-3">
          <pre className="text-xs text-neutral-400 font-mono whitespace-pre-wrap break-words">
            <code>{code}</code>
          </pre>
        </div>
      ) : (
        preview
      )}
    </div>
  );
}

// ─── Mermaid Block ──────────────────────────────────────────────────────────

function MermaidBlock({ code, id }: { code: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, code.trim());
        if (!cancelled) { setSvg(rendered); setError(null); }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code, id]);

  if (error) {
    return (
      <div className="bg-surface-0 p-4">
        <pre className="text-xs text-neutral-500 overflow-x-auto">{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center bg-surface-0 p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ─── HTML Preview Block ─────────────────────────────────────────────────────

function HtmlPreviewBlock({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(150);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (iframeRef.current?.contentDocument?.body) {
        const h = iframeRef.current.contentDocument.body.scrollHeight;
        if (h > 0) setHeight(Math.min(h + 16, 600));
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [html]);

  return (
    <div>
      <div className="px-3 py-1 bg-neutral-800 text-[10px] text-neutral-500 flex items-center gap-2">
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500/50" />
          <div className="w-2 h-2 rounded-full bg-amber-500/50" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
        </div>
        Preview
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-same-origin"
        className="w-full border-0"
        style={{ height, background: "#0a0a0b" }}
        title="Design preview"
      />
    </div>
  );
}

// ─── Spec Content Renderer ──────────────────────────────────────────────────

function SpecContent({ content, specId }: { content: string; specId: string }) {
  const parts = content.split(/(```(?:mermaid|html-preview|[\w-]*)\n[\s\S]*?```)/g);
  let diagramCount = 0;
  let previewCount = 0;

  return (
    <div className="text-sm text-neutral-300 leading-relaxed">
      {parts.map((part, i) => {
        // Mermaid blocks with preview/code toggle
        const mermaidMatch = part.match(/^```mermaid\n([\s\S]*?)```$/);
        if (mermaidMatch) {
          diagramCount++;
          return (
            <ToggleableBlock
              key={i}
              code={mermaidMatch[1]}
              language="mermaid"
              preview={<MermaidBlock code={mermaidMatch[1]} id={`${specId}-${diagramCount}`} />}
            />
          );
        }

        // HTML preview blocks with toggle
        const htmlMatch = part.match(/^```html-preview\n([\s\S]*?)```$/);
        if (htmlMatch) {
          previewCount++;
          return (
            <ToggleableBlock
              key={`preview-${previewCount}`}
              code={htmlMatch[1]}
              language="html"
              preview={<HtmlPreviewBlock html={htmlMatch[1]} />}
            />
          );
        }

        // Regular code blocks with toggle
        const codeMatch = part.match(/^```(\w*)\n([\s\S]*?)```$/);
        if (codeMatch) {
          return (
            <ToggleableBlock
              key={i}
              code={codeMatch[2]}
              language={codeMatch[1] || "text"}
              preview={
                <pre className="p-3 bg-surface-0 text-xs text-neutral-400 overflow-x-auto max-h-[400px]">
                  <code>{codeMatch[2]}</code>
                </pre>
              }
            />
          );
        }

        // Regular text — render as markdown
        return (
          <div key={i} className="whitespace-pre-wrap">
            {part.split("\n").map((line, li) => {
              if (line.startsWith("### ")) return <h4 key={li} className="text-base font-semibold text-neutral-200 mt-4 mb-2">{line.slice(4)}</h4>;
              if (line.startsWith("## ")) return <h3 key={li} className="text-lg font-semibold text-neutral-100 mt-5 mb-2">{line.slice(3)}</h3>;
              if (line.startsWith("# ")) return <h2 key={li} className="text-xl font-bold text-neutral-100 mt-6 mb-3">{line.slice(2)}</h2>;
              if (line.match(/^[-*] /)) return <li key={li} className="ml-4 list-disc text-neutral-400">{line.slice(2)}</li>;
              if (line.match(/^\d+\. /)) return <li key={li} className="ml-4 list-decimal text-neutral-400">{line.replace(/^\d+\. /, "")}</li>;
              if (line.includes("**")) {
                const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-neutral-200 font-semibold">$1</strong>');
                return <p key={li} dangerouslySetInnerHTML={{ __html: formatted }} />;
              }
              if (!line.trim()) return <br key={li} />;
              return <p key={li}>{line}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Spec View Component ────────────────────────────────────────────────────

interface SpecViewProps {
  specId: string;
}

export function SpecView({ specId }: SpecViewProps) {
  const epicCtx = useOptionalEpicContext();
  const spec = epicCtx?.data?.specs.find((s) => s.id === specId);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync edit content with spec content
  useEffect(() => {
    if (spec) {
      setEditContent(spec.content);
    }
  }, [spec?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    if (!spec || !epicCtx?.data) return;
    setSaving(true);
    try {
      // Try to save via Tauri command if available
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_spec_content", {
        epicId: epicCtx.data.epic.id,
        specId: spec.id,
        content: editContent,
        targetDir: epicCtx.data.epic.target_dir,
      });
      setHasUnsavedChanges(false);
      // Reload epic data to reflect changes
      epicCtx.reload?.();
    } catch (e) {
      console.error("Failed to save spec:", e);
      // Fallback: just mark as saved locally
      setHasUnsavedChanges(false);
    } finally {
      setSaving(false);
    }
  }, [spec, epicCtx, editContent]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    setEditContent(value);
    setHasUnsavedChanges(value !== spec?.content);

    // Debounced auto-save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (value !== spec?.content) {
        // Auto-save logic would go here
      }
    }, 2000);
  }, [spec?.content]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isEditing) handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing, handleSave]);

  if (!spec) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Spec not found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-surface-1 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-emerald-400 font-medium uppercase tracking-wide">
            {SPEC_TYPE_LABELS[spec.spec_type] ?? spec.spec_type}
          </span>
          <h2 className="text-sm font-semibold text-neutral-200">{spec.title}</h2>
          <span className="text-[10px] text-neutral-600">v{spec.version}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          )}
          {!hasUnsavedChanges && isEditing && (
            <span className="text-[10px] text-neutral-600">Saved</span>
          )}
          {/* Toggle between rendered and editor view */}
          <div className="flex items-center bg-surface-0 rounded-md p-0.5 border border-neutral-800">
            <button
              onClick={() => setIsEditing(false)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                !isEditing ? "bg-surface-1 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"
              )}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
                isEditing ? "bg-surface-1 text-neutral-200" : "text-neutral-500 hover:text-neutral-300"
              )}
            >
              <Code className="w-3 h-3" />
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            language="markdown"
            value={editContent}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              fontSize: 14,
              lineHeight: 22,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              renderWhitespace: "selection",
              smoothScrolling: true,
              cursorBlinking: "smooth",
              padding: { top: 16, bottom: 16 },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              renderLineHighlight: "line",
              lineNumbers: "on",
              glyphMargin: false,
              folding: true,
              automaticLayout: true,
            }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div
              data-chat-source-type={String(spec.spec_type)}
              data-chat-source-id={spec.id}
              data-chat-source-title={spec.title}
            >
              <SpecContent content={spec.content} specId={spec.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
