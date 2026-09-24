import { NavLink } from "react-router-dom";

// oxlint-disable-next-line react/only-export-components
export const NAV_ITEMS = [
  { to: "/app", label: "Overview", end: true },
  { to: "/app/payments", label: "Payments" },
  { to: "/app/recovery-lab", label: "Recovery Lab" },
  { to: "/app/audit", label: "Audit" },
  { to: "/app/account", label: "Account" },
];

/** Shared nav list — used by the persistent desktop rail and the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `focus-ring rounded px-2 py-1.5 text-sm transition-colors duration-150 ${
              isActive
                ? "border-l-2 border-border-strong bg-accent-muted pl-[7px] text-accent"
                : "border-l-2 border-transparent pl-[7px] text-text-muted hover:text-text"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-[220px] shrink-0 border-r border-border bg-surface px-4 py-6 md:block">
      <div className="mb-8 px-2 text-[15px] font-semibold tracking-tight">
        Recover<span className="text-accent">AI</span>
      </div>
      <SidebarNav />
    </aside>
  );
}
