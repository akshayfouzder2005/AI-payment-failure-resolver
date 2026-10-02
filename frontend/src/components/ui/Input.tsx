import type { InputHTMLAttributes } from "react";

/**
 * Input system — the label/input/hint structure Login and Register each
 * hand-duplicated identically. Same classes, same markup shape as
 * before; this is an extraction, not a redesign, so existing pages don't
 * change visually by adopting it. `wrapperClassName` exists solely so a
 * form's last field can keep the extra `mb-6` breathing room before its
 * submit button that both pages already had — `className` itself stays
 * scoped to the `<input>` element, matching InputHTMLAttributes.
 */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  wrapperClassName?: string;
}

export function Input({ label, hint, wrapperClassName = "mb-3", className = "", id, ...props }: InputProps) {
  return (
    <label className={`block text-sm ${wrapperClassName}`}>
      <span className="mb-1 block text-text-muted">{label}</span>
      <input
        id={id}
        className={`focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none ${className}`}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-text-faint">{hint}</span>}
    </label>
  );
}
