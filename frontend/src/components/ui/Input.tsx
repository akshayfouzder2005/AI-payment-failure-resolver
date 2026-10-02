import { useId, type InputHTMLAttributes } from "react";

/**
 * Input system — the label/input/hint structure Login and Register each
 * hand-duplicated identically. Same classes, same markup shape as
 * before; this is an extraction, not a redesign, so existing pages don't
 * change visually by adopting it. `wrapperClassName` exists solely so a
 * form's last field can keep the extra `mb-6` breathing room before its
 * submit button that both pages already had — `className` itself stays
 * scoped to the `<input>` element, matching InputHTMLAttributes.
 *
 * Label and input are explicitly associated via htmlFor/id rather than
 * implicit wrapping, and the hint is wired up via aria-describedby
 * instead of living inside the label: nesting the hint inside an
 * implicit `<label>...</label>` wrapper makes its text part of the
 * control's computed accessible name (e.g. "Password At least 8
 * characters." instead of "Password"), which silently breaks
 * getByLabelText("Password") — caught by RegisterPage's password hint.
 */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  wrapperClassName?: string;
}

export function Input({ label, hint, wrapperClassName = "mb-3", className = "", id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className={wrapperClassName}>
      <label htmlFor={inputId} className="mb-1 block text-sm text-text-muted">
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={hintId}
        className={`focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none ${className}`}
        {...props}
      />
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-text-faint">
          {hint}
        </span>
      )}
    </div>
  );
}
