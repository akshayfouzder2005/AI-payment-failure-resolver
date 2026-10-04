import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";

/** One labelled value in a <dl> — small caps label over the value. */
export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-label uppercase text-text-muted">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm text-text">{children}</dd>
    </div>
  );
}

/** A precise identifier: monospace, wraps rather than truncates, copyable. */
export function IdValue({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 break-all font-mono text-[13px] leading-5 text-text">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  );
}

/** Em dash for a value the backend did not provide. */
export function Missing() {
  return <span className="text-text-muted">—</span>;
}
