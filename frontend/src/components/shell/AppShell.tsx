import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNavDrawer } from "./MobileNavDrawer";

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // A drawer left open across a route change is a real bug, not a nicety —
  // closing it here synchronizes UI state with the router, which is exactly
  // what an effect is for.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-canvas text-text">
      <Sidebar />
      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        {/* max-width constrains ultra-wide screens for line-length/table
            density (design spec §9) without centering the column — this is
            an asymmetric ops console, not a marketing page. */}
        <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
          <div className="max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
