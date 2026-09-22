import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/app", label: "Overview", end: true },
  { to: "/app/payments", label: "Payments" },
  { to: "/app/recovery-lab", label: "Recovery Lab" },
  { to: "/app/audit", label: "Audit" },
  { to: "/app/account", label: "Account" },
];

export function Sidebar() {
  return (
    <aside className="hidden w-[220px] shrink-0 border-r border-border bg-surface px-4 py-6 md:block">
      <div className="mb-8 px-2 text-[15px] font-semibold tracking-tight">
        Recover<span className="text-accent">AI</span>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `focus-ring rounded px-2 py-1.5 text-sm transition-colors duration-150 ${
                isActive
                  ? "border-l-2 border-accent bg-accent-muted pl-[7px] text-accent"
                  : "border-l-2 border-transparent pl-[7px] text-text-muted hover:text-text"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
