import { NavLink } from "react-router-dom";
import { NavIcon, type NavIconName } from "./NavIcon";
import { WorkspaceBlock } from "./WorkspaceBlock";

interface NavItem {
  to: string;
  label: string;
  icon: NavIconName;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Route set is unchanged from the previous shell — five real destinations,
// regrouped under quiet labels so the rail reads as monitor / recovery /
// settings rather than one flat list.
// oxlint-disable-next-line react/only-export-components
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Monitor",
    items: [
      { to: "/app", label: "Overview", icon: "overview", end: true },
      { to: "/app/payments", label: "Payments", icon: "payments" },
    ],
  },
  {
    label: "Recovery",
    items: [
      { to: "/app/recovery-lab", label: "Recovery Lab", icon: "lab" },
      { to: "/app/audit", label: "Audit", icon: "audit" },
    ],
  },
  {
    label: "Settings",
    items: [{ to: "/app/account", label: "Account", icon: "account" }],
  },
];

const LINK_BASE =
  "focus-ring group relative flex items-center gap-2.5 rounded border px-2.5 py-1.5 text-sm transition-colors duration-150";

// Selected = soft raised fill + hairline border + strong text + a short
// accent rail. Inactive stays flat until hovered, then takes the faintest
// surface tint — restrained on purpose, color only on the selected item.
const LINK_ACTIVE =
  "border-border bg-surface-raised font-medium text-text before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent";
const LINK_INACTIVE = "border-transparent text-text-muted hover:bg-surface hover:text-text";

/** Shared nav list — used by the persistent desktop rail and the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col gap-6" aria-label="Primary">
      {NAV_GROUPS.map((group, index) => (
        // The last group (Settings / Account) is pinned to the bottom of
        // the rail, the way account-level controls sit in a console.
        <div key={group.label} className={index === NAV_GROUPS.length - 1 ? "mt-auto" : undefined}>
          <div className="mb-1.5 px-2.5 text-label uppercase text-text-muted" aria-hidden="true">
            {group.label}
          </div>
          <ul className="space-y-0.5" aria-label={group.label}>
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) => `${LINK_BASE} ${isActive ? LINK_ACTIVE : LINK_INACTIVE}`}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`transition-colors duration-150 ${
                          isActive ? "text-accent" : "text-text-muted group-hover:text-text"
                        }`}
                      >
                        <NavIcon name={item.icon} />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Brand() {
  return (
    <div className="px-2.5 text-[15px] font-semibold tracking-tight">
      Recover<span className="text-accent">AI</span>
    </div>
  );
}

export function Sidebar({ workspaceName }: { workspaceName?: string }) {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border bg-canvas px-3 py-5 md:flex">
      <Brand />
      <div className="mt-5">
        <WorkspaceBlock name={workspaceName} />
      </div>
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <SidebarNav />
      </div>
    </aside>
  );
}
