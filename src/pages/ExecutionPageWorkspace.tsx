import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useConfigStore } from "../stores/configStore";
import { useExecutionStore } from "../stores/executionStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

/**
 * ExecutionPageWorkspace is a "headless" component that initializes the execution
 * store for the current epic and auto-opens a stream tab in the workspace.
 * All visible UI is rendered by WorkspaceLayout components.
 */
export function ExecutionPageWorkspace() {
  const { epicId } = useParams<{ epicId: string }>();
  const targetDir = useConfigStore((s) => s.targetDir);
  const { initFromEpic } = useExecutionStore();
  useExecutionStore((s) => s.isRunning); // Subscribe to re-render on running state changes
  const openTab = useWorkspaceStore((s) => s.openTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);

  // Initialize execution store from disk
  useEffect(() => {
    if (!epicId || !targetDir) return;
    const currentEpicId = useExecutionStore.getState().currentEpicId;
    if (currentEpicId !== epicId) {
      initFromEpic(epicId, targetDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicId, targetDir]);

  // Auto-open and force-activate stream tab when on execution page
  useEffect(() => {
    openTab({
      id: "stream:execution",
      type: "stream",
      title: "Execution Output",
      icon: "Terminal",
      epicId: epicId,
    });
    setActiveTab("stream:execution");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epicId]);

  return null;
}
