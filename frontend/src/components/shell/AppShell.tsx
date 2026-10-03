import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNavDrawer } from "./MobileNavDrawer";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  // A drawer left open across a route change is a real bug, not a nicety —
  // closing it here synchronizes UI state with the router, which is exactly
  // what an effect is for.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setNavOpen(false);
  }, [location.pathname]);

  return (
    // Two planes: the chrome (sidebar) sits on `canvas`, the workspace
    // (top bar + content) on `surface` — in light mode that makes the work
    // area the lighter plane, in dark mode the slightly raised one.
    // h-dvh, not h-screen: on mobile browsers 100vh includes the collapsing
    // URL bar and pushes the page bottom off-screen.
    <div className="flex h-dvh bg-canvas text-text">
      <Sidebar workspaceName={user?.merchant_name} />
      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} workspaceName={user?.merchant_name} />
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        {/* Wide, left-aligned workspace: the max-width only stops ultra-wide
            screens from stretching table rows into unreadable lengths — it
            deliberately does not center the column (this is a console, not
            a marketing page). Gutters step up with the viewport. */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          <div className="max-w-[1360px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
