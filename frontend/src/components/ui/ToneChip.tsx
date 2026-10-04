import { DOT_CLASSES, TONE_CLASSES, type Tone } from "../../lib/status";

/**
 * Dot + label on a tinted ground — never a bare colour (colour must not
 * carry meaning alone). StatusChip resolves a backend status string into
 * one of these; the Decision Chain uses it directly for states that aren't
 * a backend status (e.g. "Diagnosed", "Fallback").
 */
export function ToneChip({ tone, label, className = "" }: { tone: Tone; label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}
