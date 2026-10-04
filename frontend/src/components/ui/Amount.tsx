import { formatCurrencyParts } from "../../lib/format";

/**
 * An amount with typographic hierarchy: whole rupees carry the weight, the
 * paise sit quieter beside them. Never drops the paise — the figure must
 * match the ledger exactly.
 */
export function Amount({
  amount,
  currency = "INR",
  size = "md",
}: {
  amount: string | number;
  currency?: string;
  size?: "md" | "lg";
}) {
  const { main, fraction } = formatCurrencyParts(amount, currency);
  return (
    <span className={`tabular-nums ${size === "lg" ? "text-display" : ""}`}>
      <span className="font-semibold text-text">{main}</span>
      <span className={`font-normal text-text-muted ${size === "lg" ? "text-heading" : ""}`}>{fraction}</span>
    </span>
  );
}
