import { Routes, Route } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AppProvider } from "./components/providers/AppProvider";
import { WorkspaceLayout } from "./components/workspace/WorkspaceLayout";
import { EpicProvider } from "./contexts/EpicContext";
import { EpicPageWorkspace } from "./pages/EpicPageWorkspace";
import { ExecutionPageWorkspace } from "./pages/ExecutionPageWorkspace";
import { useUpdateListener } from "./hooks/useUpdateListener";
import { UpdateToast } from "./components/ui/UpdateToast";

function DashboardWorkspace() {
  return <WorkspaceLayout />;
}

function EpicWorkspace() {
  return (
    <EpicProvider>
      <WorkspaceLayout />
      <EpicPageWorkspace />
    </EpicProvider>
  );
}

function ExecutionWorkspace() {
  return (
    <EpicProvider>
      <WorkspaceLayout />
      <ExecutionPageWorkspace />
    </EpicProvider>
  );
}

export default function App() {
  const { updateReady, updateVersion, installing, isExecuting, restartNow, dismissUpdate } =
    useUpdateListener();

  return (
    <AppProvider>
      <AnimatePresence mode="wait">
        <Routes>
          {/* All routes use unified WorkspaceLayout */}
          <Route path="/" element={<DashboardWorkspace />} />
          <Route path="/epic/:epicId" element={<EpicWorkspace />} />
          <Route path="/execute/:epicId" element={<ExecutionWorkspace />} />
        </Routes>
      </AnimatePresence>

      <UpdateToast
        visible={updateReady}
        version={updateVersion}
        installing={installing}
        isExecuting={isExecuting}
        onRestart={restartNow}
        onDismiss={dismissUpdate}
      />
    </AppProvider>
  );
}
