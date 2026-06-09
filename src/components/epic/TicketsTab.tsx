import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ListTodo,
  ChevronRight,
  FileCode,
  GitBranch,
  CheckSquare,
  Tag,
  ArrowUp,
} from "lucide-react";
import { cn, STATUS_COLORS, statusLabel } from "../../lib/utils";
import type { Ticket } from "../../types/epic";

const PRIORITY_COLORS: Record<number, string> = {
  1: "text-red-400 bg-red-400/10",
  2: "text-amber-400 bg-amber-400/10",
  3: "text-blue-400 bg-blue-400/10",
};
const DEFAULT_PRIORITY_COLOR = "text-neutral-400 bg-neutral-400/10";

interface TicketsTabProps {
  tickets: Ticket[];
}

const COMPLEXITY_COLORS: Record<string, string> = {
  trivial: "text-neutral-400 bg-neutral-400/10",
  small: "text-emerald-400 bg-emerald-400/10",
  medium: "text-blue-400 bg-blue-400/10",
  large: "text-amber-400 bg-amber-400/10",
  epic: "text-red-400 bg-red-400/10",
};

export function TicketsTab({ tickets }: TicketsTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (tickets.length === 0) {
    return (
      <div className="text-center py-16 text-neutral-500">
        <ListTodo className="w-8 h-8 mx-auto mb-3 text-neutral-700" />
        <p>No tickets yet</p>
        <p className="text-sm text-neutral-600 mt-1">Tickets will appear after decomposition</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {[...tickets]
        .sort((a, b) => a.priority - b.priority)
        .map((ticket, index) => {
          const isExpanded = expandedId === ticket.id;
          const displayNum = index + 1;
          return (
            <div
              key={ticket.id}
              className="bg-surface-1 border border-neutral-800 rounded-xl overflow-hidden"
            >
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-800/30 transition-colors"
              >
                <ChevronRight
                  className={cn(
                    "w-4 h-4 text-neutral-500 transition-transform flex-shrink-0",
                    isExpanded && "rotate-90"
                  )}
                />
                <span className="text-xs text-neutral-600 font-mono w-6">#{displayNum}</span>
                <span className="text-sm font-medium text-neutral-200 flex-1 truncate">
                  {ticket.title}
                </span>
                <span className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium",
                  PRIORITY_COLORS[ticket.priority] ?? DEFAULT_PRIORITY_COLOR
                )} title={`Priority ${ticket.priority}`}>
                  <ArrowUp className="w-2.5 h-2.5" />
                  P{ticket.priority}
                </span>
                <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", STATUS_COLORS[ticket.status])}>
                  {statusLabel(ticket.status)}
                </span>
                <span className={cn("px-2 py-0.5 rounded-full text-[11px]", COMPLEXITY_COLORS[ticket.estimated_complexity] ?? "text-neutral-500")}>
                  {ticket.estimated_complexity}
                </span>
                <span className="text-[11px] text-neutral-600">
                  {ticket.acceptance_criteria.length} criteria
                </span>
              </button>

              {/* Expanded content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-5 pb-4 pt-1 border-t border-neutral-800 space-y-4"
                      data-chat-source-type="ticket"
                      data-chat-source-id={ticket.id}
                      data-chat-source-title={`Ticket: ${ticket.title}`}
                    >
                      {/* Description */}
                      <div>
                        <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
                          {ticket.description}
                        </p>
                      </div>

                      {/* Acceptance criteria */}
                      {ticket.acceptance_criteria.length > 0 && (
                        <div>
                          <h4 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 mb-2">
                            <CheckSquare className="w-3.5 h-3.5" />
                            Acceptance Criteria
                          </h4>
                          <ul className="space-y-1.5">
                            {ticket.acceptance_criteria.map((c, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-neutral-400">
                                <span className="text-neutral-600 mt-0.5">-</span>
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Scope */}
                      <div className="grid grid-cols-2 gap-3">
                        {ticket.scope.primary_files.length > 0 && (
                          <div>
                            <h4 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 mb-1.5">
                              <FileCode className="w-3.5 h-3.5" />
                              Primary Files
                            </h4>
                            <div className="space-y-0.5">
                              {ticket.scope.primary_files.map((f, i) => (
                                <p key={i} className="text-[11px] font-mono text-neutral-500">{f}</p>
                              ))}
                            </div>
                          </div>
                        )}
                        {ticket.scope.technologies.length > 0 && (
                          <div>
                            <h4 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 mb-1.5">
                              <Tag className="w-3.5 h-3.5" />
                              Technologies
                            </h4>
                            <div className="flex flex-wrap gap-1">
                              {ticket.scope.technologies.map((t, i) => (
                                <span key={i} className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] text-neutral-400">{t}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Dependencies */}
                      {ticket.dependencies.length > 0 && (
                        <div>
                          <h4 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 mb-1.5">
                            <GitBranch className="w-3.5 h-3.5" />
                            Depends on
                          </h4>
                          <div className="flex flex-wrap gap-1">
                            {ticket.dependencies.map((d, i) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] font-mono text-neutral-500">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
    </div>
  );
}
