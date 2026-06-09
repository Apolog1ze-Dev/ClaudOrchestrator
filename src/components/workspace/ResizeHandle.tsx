import { cn } from "../../lib/utils";

interface ResizeHandleProps {
  side: "left" | "right";
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeHandle({ side, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "w-1 flex-shrink-0 cursor-col-resize hover:bg-emerald-500/30 active:bg-emerald-500/50 transition-colors relative group",
        side === "right" ? "border-r border-neutral-800" : "border-l border-neutral-800"
      )}
    >
      {/* Wider invisible hit area */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}
