import { useEffect, useRef } from "react";
import { SidebarNav } from "./Sidebar";

/**
 * Below the desktop breakpoint the persistent Sidebar is hidden entirely, so
 * this is the only way to navigate — a real drawer, not a decoration.
 * Lightweight dialog semantics: focus moves in on open, Escape and backdrop
 * click close it, and it unmounts on close so it never sits in the tab order.
 */
export function MobileNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        className="focus-ring animate-drawer-in absolute inset-y-0 left-0 flex w-[240px] flex-col border-r border-border bg-surface px-4 py-6"
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <span className="text-[15px] font-semibold tracking-tight">
            Recover<span className="text-accent">AI</span>
          </span>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="focus-ring rounded text-label uppercase text-text-muted hover:text-text"
          >
            Close
          </button>
        </div>
        <SidebarNav onNavigate={onClose} />
      </div>
    </div>
  );
}
