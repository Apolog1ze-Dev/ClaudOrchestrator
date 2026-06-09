import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

interface PopoverState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
}

export function TextSelectionPopover() {
  const [popover, setPopover] = useState<PopoverState>({
    visible: false, x: 0, y: 0, text: "", sourceType: "", sourceId: "", sourceTitle: "",
  });
  const { addContextSnippet, isOpen, setOpen } = useChatStore();

  const handleMouseUp = useCallback(() => {
    // Small delay to let selection finalize
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length < 5) {
        setPopover((p) => ({ ...p, visible: false }));
        return;
      }

      // Walk up from the selection anchor to find a data-chat-source-type element
      let node = selection?.anchorNode as HTMLElement | null;
      let sourceType = "";
      let sourceId = "";
      let sourceTitle = "";

      while (node && node !== document.body) {
        if (node.dataset?.chatSourceType) {
          sourceType = node.dataset.chatSourceType;
          sourceId = node.dataset.chatSourceId || "";
          sourceTitle = node.dataset.chatSourceTitle || sourceType;
          break;
        }
        node = node.parentElement;
      }

      if (!sourceType) {
        setPopover((p) => ({ ...p, visible: false }));
        return;
      }

      // Position the popover near the end of the selection
      const range = selection?.getRangeAt(0);
      if (!range) return;

      const rect = range.getBoundingClientRect();
      setPopover({
        visible: true,
        x: rect.right + 8,
        y: rect.top - 4,
        text,
        sourceType,
        sourceId,
        sourceTitle,
      });
    }, 10);
  }, []);

  const handleClick = useCallback(() => {
    // Dismiss popover when clicking elsewhere
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection?.toString().trim()) {
        setPopover((p) => ({ ...p, visible: false }));
      }
    }, 200);
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [handleMouseUp, handleClick]);

  const addToChat = () => {
    addContextSnippet({
      id: `snip_${Date.now()}`,
      text: popover.text.length > 500 ? popover.text.slice(0, 500) + "..." : popover.text,
      sourceType: popover.sourceType,
      sourceId: popover.sourceId,
      sourceTitle: popover.sourceTitle,
    });

    // Open agent panel if collapsed (workspace layout) or chat sidebar (simple layout)
    const { agentPanelCollapsed, setAgentPanelCollapsed } = useWorkspaceStore.getState();
    if (agentPanelCollapsed) {
      setAgentPanelCollapsed(false);
    }
    if (!isOpen) setOpen(true);

    // Clear selection and hide popover
    window.getSelection()?.removeAllRanges();
    setPopover((p) => ({ ...p, visible: false }));
  };

  return (
    <AnimatePresence>
      {popover.visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.1 }}
          onClick={addToChat}
          style={{
            position: "fixed",
            left: popover.x,
            top: popover.y,
            zIndex: 50,
          }}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium shadow-xl transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add to chat
        </motion.button>
      )}
    </AnimatePresence>
  );
}
