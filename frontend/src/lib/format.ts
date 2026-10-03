/**
 * Formatting helpers shared across every screen that renders money, a rate,
 * or a timestamp. Centralized so the Indian Rupee grouping rule (design
 * spec §4 — "₹1,24,500", not "₹124,500") and relative-time phrasing are
 * defined exactly once.
 */

/**
 * Formats a decimal amount (the backend always serializes Decimal as a
 * string — see PaymentRead.amount, MetricsSummary.revenue_*) as Indian
 * Rupees with Indian digit grouping. `en-IN` gives the correct grouping
 * for any currency code, but this product's data is INR-only today (see
 * Payment.currency default in the backend model), so the symbol is
 * effectively always ₹.
 */
export function formatCurrency(amount: string | number, currency = "INR"): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** A rate field from MetricsSummary (0.0–1.0) as a whole-number percentage. */
export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 0 }).format(rate);
}

/** Plain integer counts (payments analyzed, recovered, etc.) with Indian grouping. */
export function formatCount(count: number): string {
  return new Intl.NumberFormat("en-IN").format(count);
}

/**
 * Short relative-time label for table rows and activity lists — "2m ago",
 * "3h ago", "5d ago". Falls back to a plain date once it's more than a
 * week old, since "47d ago" stops being a useful unit of measure.
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "—";

  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 5) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(isoTimestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * A duration in seconds as the two most significant units — "45s", "12m",
 * "3h 20m", "2d 4h". Used for MetricsSummary.average_recovery_time_seconds,
 * which is null until at least one payment has actually been recovered; null
 * renders as an em dash rather than a misleading "0s".
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";

  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/**
 * Gateway failure codes arrive as SCREAMING_SNAKE (e.g. CARD_DECLINED).
 * That's an identifier, not copy — render it as plain sentence case for
 * people, without inventing any wording the backend didn't send.
 */
export function humanizeCode(code: string): string {
  const spaced = code.replace(/_/g, " ").trim().toLowerCase();
  return spaced.length === 0 ? "" : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
