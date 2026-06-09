import {
  FileCode,
  GitBranch,
  CheckSquare,
  Tag,
  ArrowUp,
} from "lucide-react";
import { useOptionalEpicContext } from "../../../contexts/EpicContext";
import { cn, STATUS_COLORS, statusLabel } from "../../../lib/utils";

const COMPLEXITY_COLORS: Record<string, string> = {
  trivial: "text-neutral-400 bg-neutral-400/10",
  small: "text-emerald-400 bg-emerald-400/10",
  medium: "text-blue-400 bg-blue-400/10",
  large: "text-amber-400 bg-amber-400/10",
  epic: "text-red-400 bg-red-400/10",
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "text-red-400 bg-red-400/10",
  2: "text-amber-400 bg-amber-400/10",
  3: "text-blue-400 bg-blue-400/10",
};
const DEFAULT_PRIORITY_COLOR = "text-neutral-400 bg-neutral-400/10";

interface TicketViewProps {
  ticketId: string;
}

export function TicketView({ ticketId }: TicketViewProps) {
  const epicCtx = useOptionalEpicContext();
  const ticket = epicCtx?.data?.tickets.find((t) => t.id === ticketId);

  // Compute sequential display number from sorted ticket list
  const sortedTickets = [...(epicCtx?.data?.tickets ?? [])].sort((a, b) => a.priority - b.priority);
  const displayNum = sortedTickets.findIndex((t) => t.id === ticketId) + 1;

  if (!ticket) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Ticket not found
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="max-w-4xl mx-auto p-6 space-y-6"
        data-chat-source-type="ticket"
        data-chat-source-id={ticket.id}
        data-chat-source-title={`Ticket: ${ticket.title}`}
      >
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-neutral-600 font-mono">#{displayNum || "?"}</span>
            <h2 className="text-xl font-bold text-neutral-100">{ticket.title}</h2>
            <span className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium",
              PRIORITY_COLORS[ticket.priority] ?? DEFAULT_PRIORITY_COLOR
            )} title={`Priority ${ticket.priority}`}>
              <ArrowUp className="w-3 h-3" />
              P{ticket.priority}
            </span>
            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[ticket.status])}>
              {statusLabel(ticket.status)}
            </span>
            <span className={cn("px-2 py-0.5 rounded-full text-xs", COMPLEXITY_COLORS[ticket.estimated_complexity] ?? "text-neutral-500")}>
              {ticket.estimated_complexity}
            </span>
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </p>
        </div>

        {/* Acceptance criteria */}
        {ticket.acceptance_criteria.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-3">
              <CheckSquare className="w-4 h-4" />
              Acceptance Criteria
            </h3>
            <ul className="space-y-2">
              {ticket.acceptance_criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-400">
                  <span className="text-neutral-600 mt-0.5">-</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Scope */}
        <div className="grid grid-cols-2 gap-6">
          {ticket.scope.primary_files.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
                <FileCode className="w-4 h-4" />
                Primary Files
              </h3>
              <div className="space-y-1">
                {ticket.scope.primary_files.map((f, i) => (
                  <p key={i} className="text-xs font-mono text-neutral-500">{f}</p>
                ))}
              </div>
            </div>
          )}
          {ticket.scope.reference_files.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
                <FileCode className="w-4 h-4" />
                Reference Files
              </h3>
              <div className="space-y-1">
                {ticket.scope.reference_files.map((f, i) => (
                  <p key={i} className="text-xs font-mono text-neutral-500">{f}</p>
                ))}
              </div>
            </div>
          )}
          {ticket.scope.technologies.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
                <Tag className="w-4 h-4" />
                Technologies
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {ticket.scope.technologies.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-neutral-800 text-xs text-neutral-400">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dependencies */}
        {ticket.dependencies.length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-300 mb-2">
              <GitBranch className="w-4 h-4" />
              Dependencies
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {ticket.dependencies.map((d, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-neutral-800 text-xs font-mono text-neutral-500">{d}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
