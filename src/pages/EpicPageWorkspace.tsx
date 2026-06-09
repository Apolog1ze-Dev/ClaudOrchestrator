/**
 * EpicPageWorkspace is a "headless" component that lives alongside WorkspaceLayout.
 * It does NOT render any visible UI — EpicProvider (wrapped around it in App.tsx)
 * handles all data loading and provides it via EpicContext, which the workspace
 * components (ExplorerPanel, EditorContent, PlanningToolbar, etc.) read from.
 *
 * This component exists solely for any side effects specific to the epic workspace
 * that don't belong in the EpicProvider itself.
 */
export function EpicPageWorkspace() {
  // All logic lives in EpicProvider (contexts/EpicContext.tsx)
  // All UI lives in WorkspaceLayout and its children
  return null;
}
