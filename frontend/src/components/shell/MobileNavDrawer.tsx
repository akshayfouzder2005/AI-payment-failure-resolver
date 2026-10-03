import { useEffect, useRef } from "react";
import { Brand, SidebarNav } from "./Sidebar";
import { WorkspaceBlock } from "./WorkspaceBlock";

/**
 * Below the desktop breakpoint the persistent Sidebar is hidden entirely, so
 * this is the only way to navigate — a real drawer, not a decoration.
 * Lightweight dialog semantics: focus moves in on open, Escape and backdrop
 * click close it, and it unmounts on close so it never sits in the tab order.
 */
export function MobileNavDrawer({
  open,
  onClose,
  workspaceName,
}: {
  open: boolean;
  onClose: () => void;
  workspaceName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-canvas/80" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="focus-ring animate-drawer-in absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-border bg-canvas px-3 py-5 shadow-overlay"
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="focus-ring rounded px-2 py-1 text-label uppercase text-text-muted transition-colors duration-150 hover:text-text"
          >
            Close
          </button>
        </div>
        <div className="mt-5">
          <WorkspaceBlock name={workspaceName} />
        </div>
        <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
          <SidebarNav onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
