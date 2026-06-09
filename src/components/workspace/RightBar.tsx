import { MessageSquare } from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { cn } from "../../lib/utils";

export function RightBar() {
  const agentPanelCollapsed = useWorkspaceStore((s) => s.agentPanelCollapsed);
  const toggleAgentPanel = useWorkspaceStore((s) => s.toggleAgentPanel);
  return (
    <div className="w-9 flex-shrink-0 bg-surface-1 border-l border-neutral-800 flex flex-col h-full">
      {/* Top: Agent panel toggle */}
      <div className="flex flex-col items-center py-2 gap-0.5">
        <button
          onClick={toggleAgentPanel}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-md transition-colors",
            !agentPanelCollapsed
              ? "text-emerald-400 bg-emerald-500/10"
              : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50"
          )}
          title="Toggle Agent Panel (Ctrl+J)"
        >
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

    </div>
  );
}
