import { useNavigate, useLocation } from "react-router-dom";
import {
  FolderTree,
  LayoutDashboard,
  Settings,
  History,
  Plus,
} from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { cn } from "../../lib/utils";

type NavAction =
  | { kind: "toggle-explorer" }
  | { kind: "navigate"; path: string }
  | { kind: "open-tab"; tabId: string; type: "settings" | "history" | "new-epic"; title: string; icon: string };

const NAV_ITEMS: { id: string; icon: typeof FolderTree; action: NavAction }[] = [
  { id: "explorer", icon: FolderTree, action: { kind: "toggle-explorer" } },
  { id: "dashboard", icon: LayoutDashboard, action: { kind: "navigate", path: "/" } },
  { id: "new-epic", icon: Plus, action: { kind: "open-tab", tabId: "new-epic:main", type: "new-epic", title: "New Epic", icon: "Plus" } },
  { id: "settings", icon: Settings, action: { kind: "open-tab", tabId: "settings:main", type: "settings", title: "Settings", icon: "Settings" } },
  { id: "history", icon: History, action: { kind: "open-tab", tabId: "history:main", type: "history", title: "History", icon: "History" } },
];

export function ActivityBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const explorerCollapsed = useWorkspaceStore((s) => s.explorerCollapsed);
  const toggleExplorer = useWorkspaceStore((s) => s.toggleExplorer);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const openTab = useWorkspaceStore((s) => s.openTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);

  return (
    <div className="w-12 flex-shrink-0 bg-surface-1 border-r border-neutral-800 flex flex-col h-full">
      {/* Nav icons */}
      <div className="flex flex-col items-center py-2 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          // Determine active state
          let isActive = false;
          if (item.action.kind === "toggle-explorer") {
            isActive = !explorerCollapsed;
          } else if (item.action.kind === "navigate") {
            isActive = location.pathname === item.action.path && !activeTabId;
          } else if (item.action.kind === "open-tab") {
            isActive = activeTabId === item.action.tabId;
          }

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.action.kind === "toggle-explorer") {
                  toggleExplorer();
                } else if (item.action.kind === "navigate") {
                  navigate(item.action.path);
                  // Deselect active tab so WelcomeView shows
                  setActiveTab(null);
                } else if (item.action.kind === "open-tab") {
                  openTab({
                    id: item.action.tabId,
                    type: item.action.type,
                    title: item.action.title,
                    icon: item.action.icon,
                  });
                }
              }}
              className={cn(
                "relative w-11 h-11 flex items-center justify-center rounded-lg transition-colors",
                isActive
                  ? "text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50"
              )}
              title={item.id.charAt(0).toUpperCase() + item.id.slice(1).replace("-", " ")}
            >
              <Icon className="w-[22px] h-[22px]" />
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-500 rounded-r" />
              )}
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}
