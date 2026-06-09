import { useState, useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import mermaid from "mermaid";
import { cn } from "../../lib/utils";
import type { Spec } from "../../types/epic";

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

interface SpecsTabProps {
  specs: Spec[];
}

const SPEC_TYPE_LABELS: Record<string, string> = {
  prd: "PRD",
  tech_spec: "Tech Spec",
  architecture: "Architecture",
  api_spec: "API Spec",
  design_spec: "Design Spec",
  custom: "Custom",
};

/** Render a mermaid diagram string into an SVG */
function MermaidBlock({ code, id }: { code: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, code.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [code, id]);

  if (error) {
    return (
      <div className="bg-surface-0 border border-neutral-800 rounded-lg p-4 my-3">
        <pre className="text-xs text-neutral-500 overflow-x-auto">{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center bg-surface-0 border border-neutral-800 rounded-lg p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Render an HTML preview block in a sandboxed iframe */
function HtmlPreviewBlock({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(150);

  useEffect(() => {
    // Auto-resize iframe to content height
    const timer = setTimeout(() => {
      if (iframeRef.current?.contentDocument?.body) {
        const h = iframeRef.current.contentDocument.body.scrollHeight;
        if (h > 0) setHeight(Math.min(h + 16, 600));
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [html]);

  return (
    <div className="my-4 rounded-lg border border-neutral-700 overflow-hidden">
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

/** Parse spec content and render mermaid + html-preview blocks inline */
function SpecContent({ content, specId }: { content: string; specId: string }) {
  // Split on both mermaid and html-preview code blocks
  const parts = content.split(/(```(?:mermaid|html-preview)\n[\s\S]*?```)/g);
  let diagramCount = 0;
  let previewCount = 0;

  return (
    <div className="text-sm text-neutral-300 leading-relaxed">
      {parts.map((part, i) => {
        // Mermaid blocks
        const mermaidMatch = part.match(/^```mermaid\n([\s\S]*?)```$/);
        if (mermaidMatch) {
          diagramCount++;
          return (
            <MermaidBlock
              key={i}
              code={mermaidMatch[1]}
              id={`${specId}-${diagramCount}`}
            />
          );
        }

        // HTML preview blocks
        const htmlMatch = part.match(/^```html-preview\n([\s\S]*?)```$/);
        if (htmlMatch) {
          previewCount++;
          return <HtmlPreviewBlock key={`preview-${previewCount}`} html={htmlMatch[1]} />;
        }

        // Regular code blocks (show as styled code)
        const codeMatch = part.match(/^```(\w*)\n([\s\S]*?)```$/);
        if (codeMatch) {
          return (
            <pre key={i} className="my-3 p-3 rounded-lg bg-surface-0 border border-neutral-800 text-xs text-neutral-400 overflow-x-auto">
              <code>{codeMatch[2]}</code>
            </pre>
          );
        }

        // Render text with basic formatting
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

export function SpecsTab({ specs }: SpecsTabProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (specs.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-500">
        <FileText className="w-8 h-8 mx-auto mb-3 text-neutral-700" />
        <p>No specs generated yet</p>
        <p className="text-sm text-neutral-600 mt-1">Specs will appear here after planning</p>
      </div>
    );
  }

  const selected = specs[selectedIdx];

  return (
    <div>
      {/* Spec type tabs */}
      {specs.length > 1 && (
        <div className="flex gap-2 mb-4">
          {specs.map((spec, i) => (
            <button
              key={spec.id}
              onClick={() => setSelectedIdx(i)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                i === selectedIdx
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
              )}
            >
              {SPEC_TYPE_LABELS[spec.spec_type] ?? spec.spec_type}
            </button>
          ))}
        </div>
      )}

      {/* Spec content */}
      {selected && (
        <div className="bg-surface-1 border border-neutral-800 rounded-xl">
          <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="font-semibold text-neutral-200">{selected.title}</h3>
            <span className="text-[11px] text-neutral-600">v{selected.version}</span>
          </div>
          <div
            className="px-5 py-4 max-h-[600px] overflow-y-auto"
            data-chat-source-type={String(selected.spec_type)}
            data-chat-source-id={selected.id}
            data-chat-source-title={selected.title}
          >
            <SpecContent content={selected.content} specId={selected.id} />
          </div>

          {/* Diagrams are rendered inline by SpecContent — no stacked section needed */}
        </div>
      )}
    </div>
  );
}
