import { useWorkspaceStore } from "../../stores/workspaceStore";
import { SpecView } from "./views/SpecView";
import { TicketView } from "./views/TicketView";
import { PhaseView } from "./views/PhaseView";
import { WelcomeView } from "./views/WelcomeView";
import { StreamView } from "./views/StreamView";
import { FilePreview } from "./views/FilePreview";
import { SettingsPage } from "../../pages/SettingsPage";
import { HistoryPage } from "../../pages/HistoryPage";
import { NewEpicPage } from "../../pages/NewEpicPage";

export function EditorContent() {
  const openTabs = useWorkspaceStore((s) => s.openTabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);

  const activeTab = openTabs.find((t) => t.id === activeTabId);

  // No tab open — show welcome
  if (!activeTab) {
    return <WelcomeView />;
  }

  switch (activeTab.type) {
    case "spec":
      return activeTab.artifactId ? <SpecView specId={activeTab.artifactId} /> : <WelcomeView />;

    case "ticket":
      return activeTab.artifactId ? <TicketView ticketId={activeTab.artifactId} /> : <WelcomeView />;

    case "phase":
      return activeTab.artifactId ? <PhaseView phaseId={activeTab.artifactId} /> : <WelcomeView />;

    case "stream":
    case "clarifying":
      // Clarifying questions are now integrated inline in StreamView.
      // The execution tab must read the execution store's stream, not the
      // epic context's planning stream (which is empty during a build).
      return <StreamView source={activeTab.id === "stream:execution" ? "execution" : "planning"} />;

    case "file":
      return activeTab.artifactId ? <FilePreview filePath={activeTab.artifactId} /> : <WelcomeView />;

    case "settings":
      return <SettingsPage />;

    case "history":
      return <HistoryPage />;

    case "new-epic":
      return <NewEpicPage />;

    case "welcome":
    case "epic":
    default:
      return <WelcomeView />;
  }
}
