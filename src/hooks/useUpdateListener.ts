import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useExecutionStore } from "../stores/executionStore";

interface UpdateReadyPayload {
  version: string;
  body: string | null;
}

export function useUpdateListener() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const isExecuting = useExecutionStore((s) => s.isRunning);

  useEffect(() => {
    const unlisten = listen<UpdateReadyPayload>("update-ready", (event) => {
      setUpdateVersion(event.payload.version);
      setUpdateReady(true);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const restartNow = async () => {
    if (isExecuting) return;
    setInstalling(true);
    try {
      await invoke("install_update");
    } catch (e) {
      console.error("Failed to install update:", e);
      setInstalling(false);
    }
  };

  const dismissUpdate = () => {
    setUpdateReady(false);
  };

  return {
    updateReady,
    updateVersion,
    installing,
    isExecuting,
    restartNow,
    dismissUpdate,
  };
}
