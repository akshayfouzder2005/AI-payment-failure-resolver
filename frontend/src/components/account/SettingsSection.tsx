import type { ReactNode } from "react";

/** A ruled settings group: heading + description on the left on wide screens, rows on the right. */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid grid-cols-1 gap-x-10 gap-y-4 border-t border-border py-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <div>
        <h2 id={`${id}-title`} className="text-subhead text-text">
          {title}
        </h2>
        <p className="mt-1 text-body-small text-text-muted">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** One row inside a section: label (+ optional hint) and a value or control. */
export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-border py-3 first:pt-0 last:border-b-0">
      <div className="min-w-0 sm:w-48">
        <div className="text-sm text-text">{label}</div>
        {hint && <div className="mt-0.5 text-body-small text-text-muted">{hint}</div>}
      </div>
      <div className="min-w-0 flex-1 text-sm text-text sm:text-right">{children}</div>
    </div>
  );
}

/** Segmented single-choice control (theme, rows per page). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`focus-ring rounded-md px-3 py-1 text-sm tabular-nums transition-colors duration-150 ${
              active ? "bg-surface-raised font-medium text-text shadow-sm" : "text-text-muted hover:text-text"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
