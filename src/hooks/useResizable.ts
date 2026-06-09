import { useCallback, useRef } from "react";

interface UseResizableOptions {
  direction: "horizontal";
  /** Whether to resize from the left edge (agent panel) or right edge (explorer) */
  side: "left" | "right";
  min: number;
  max: number;
  onResize: (size: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

export function useResizable(options: UseResizableOptions) {
  const { direction: _direction, side, min, max, onResize, onResizeStart, onResizeEnd } = options;
  const startXRef = useRef(0);
  const startSizeRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, currentSize: number) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startSizeRef.current = currentSize;

      onResizeStart?.();
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        // For the explorer (right edge), dragging right = grow
        // For the agent panel (left edge), dragging left = grow
        const newSize =
          side === "right"
            ? startSizeRef.current + delta
            : startSizeRef.current - delta;

        onResize(Math.max(min, Math.min(max, newSize)));
      };

      const handleMouseUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        onResizeEnd?.();
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [side, min, max, onResize, onResizeStart, onResizeEnd]
  );

  return { handleMouseDown };
}
