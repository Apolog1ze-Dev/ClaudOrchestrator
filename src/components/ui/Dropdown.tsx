import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";

/** Close-on-outside-click helper shared by both controls */
function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);
  return ref;
}

// ─── StyledSelect ────────────────────────────────────────────────────────────
// A native-select replacement matching the app's model-picker styling.

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export function StyledSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)} style={{ zIndex: open ? 60 : 1 }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-neutral-700 bg-surface-2 hover:border-neutral-600 transition-colors text-sm"
      >
        <span className="text-neutral-200 truncate">{current?.label ?? value}</span>
        <ChevronDown className={cn("w-4 h-4 text-neutral-500 transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl max-h-[280px] overflow-y-auto" style={{ zIndex: 9999 }}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors",
                  isSelected ? "bg-neutral-700/50 text-neutral-100" : "text-neutral-300 hover:bg-neutral-800/50"
                )}
              >
                <span className="truncate">
                  {option.label}
                  {option.hint && <span className="ml-2 text-[10px] text-neutral-500">{option.hint}</span>}
                </span>
                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── StyledCombo ─────────────────────────────────────────────────────────────
// Free-text input + suggestion panel (replaces native <datalist>), with
// optional async refresh for dynamic suggestion sources.

export function StyledCombo({
  value,
  onChange,
  options,
  placeholder,
  loading = false,
  error = null,
  onOpen,
  onRefresh,
  emptyText = "No suggestions",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
  error?: string | null;
  /** Called when the panel opens (lazy-load suggestions) */
  onOpen?: () => void;
  onRefresh?: () => void;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  // Filter by typed text — but when the current value IS a picked option,
  // show the full list so reopening lets the user switch freely.
  const query = value.trim().toLowerCase();
  const filtered =
    query.length === 0 || options.some((o) => o.toLowerCase() === query)
      ? options
      : options.filter((o) => o.toLowerCase().includes(query));

  const openPanel = () => {
    if (!open) {
      setOpen(true);
      onOpen?.();
    }
  };

  return (
    <div ref={ref} className={cn("relative", className)} style={{ zIndex: open ? 60 : 1 }}>
      <div className="flex">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={openPanel}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-l-lg border border-r-0 border-neutral-700 bg-surface-2 text-sm text-neutral-200 font-mono focus:outline-none focus:border-neutral-500"
        />
        <button
          onClick={() => (open ? setOpen(false) : openPanel())}
          className="px-2.5 rounded-r-lg border border-neutral-700 bg-surface-2 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600 transition-colors"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl max-h-[260px] overflow-y-auto" style={{ zIndex: 9999 }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800 sticky top-0 bg-neutral-900">
            <span className="text-[10px] uppercase tracking-wider text-neutral-600 font-medium">
              {loading ? "Discovering…" : `${filtered.length} available`}
            </span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                title="Refresh"
                className="text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              </button>
            )}
          </div>

          {error && (
            <div className="px-3 py-2.5 text-[11px] text-red-400/90 break-words">{error}</div>
          )}
          {!error && !loading && filtered.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-neutral-600">{emptyText}</div>
          )}
          {filtered.map((option) => {
            const isSelected = option === value;
            return (
              <button
                key={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-mono transition-colors",
                  isSelected ? "bg-neutral-700/50 text-neutral-100" : "text-neutral-300 hover:bg-neutral-800/50"
                )}
              >
                <span className="truncate">{option}</span>
                {isSelected && <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
