import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { cn } from "../../lib/utils";

interface ExplorerSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  count?: number;
  emptyMessage?: string;
  isLoading?: boolean;
  children: ReactNode;
}

export function ExplorerSection({
  id,
  title,
  icon: Icon,
  count,
  emptyMessage = "Not yet generated",
  isLoading = false,
  children,
}: ExplorerSectionProps) {
  const collapsed = useWorkspaceStore((s) => s.collapsedSections.has(id));
  const toggleSection = useWorkspaceStore((s) => s.toggleSection);

  return (
    <div className="border-b border-neutral-800/50">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider hover:bg-neutral-800/30 transition-colors"
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 transition-transform flex-shrink-0",
            !collapsed && "rotate-90"
          )}
        />
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">{title}</span>
        {count != null && count > 0 && (
          <span className="px-1.5 py-0 rounded text-[10px] bg-neutral-800 text-neutral-500 font-mono">
            {count}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {isLoading ? (
              <div className="px-3 py-2 space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 bg-neutral-800/50 rounded animate-pulse" />
                ))}
              </div>
            ) : count === 0 || !children ? (
              <div className="px-3 py-2 text-[11px] text-neutral-600 italic">
                {emptyMessage}
              </div>
            ) : (
              <div className="py-0.5">{children}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
