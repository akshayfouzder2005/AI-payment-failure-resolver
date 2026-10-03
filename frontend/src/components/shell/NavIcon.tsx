export type NavIconName = "overview" | "payments" | "lab" | "audit" | "account";

/**
 * Sixteen-pixel geometric line icons drawn inline — no icon library, in
 * keeping with the system's "no decorative iconography" rule: these only
 * exist to give the nav a scannable left edge, so they stay plain strokes
 * on currentColor and are hidden from assistive tech (the label carries
 * the meaning).
 */
export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {name === "overview" && (
        <>
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
        </>
      )}
      {name === "payments" && (
        <>
          <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
          <path d="M2 6.75h12" />
        </>
      )}
      {name === "lab" && <path d="M6 2.5h4M7 2.5v4L3.6 12.6a1 1 0 0 0 .9 1.4h7a1 1 0 0 0 .9-1.4L9 6.5v-4" />}
      {name === "audit" && (
        <>
          <circle cx="3.5" cy="4" r="0.75" />
          <circle cx="3.5" cy="8" r="0.75" />
          <circle cx="3.5" cy="12" r="0.75" />
          <path d="M6.5 4H14M6.5 8H14M6.5 12H14" />
        </>
      )}
      {name === "account" && (
        <>
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5c.7-2.4 2.6-3.5 5-3.5s4.3 1.1 5 3.5" />
        </>
      )}
    </svg>
  );
}
