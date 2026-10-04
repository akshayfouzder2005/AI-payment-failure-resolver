import { useEffect, useRef, useState } from "react";

/**
 * Copies a precise value (an ID, a URL) to the clipboard. The label feeds
 * the accessible name ("Copy payment ID") so several of these on one page
 * stay distinguishable. If the Clipboard API is unavailable or refuses
 * (insecure context, permissions) nothing is claimed: the button simply
 * doesn't flip to "Copied".
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="focus-ring shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
