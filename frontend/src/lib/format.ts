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
  const spaced = code.replace(/_/g, " ").trim().toLowerCase().replace(/\bai\b/g, "AI");
  return spaced.length === 0 ? "" : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * An amount split for typographic hierarchy: the whole-rupee figure carries
 * the weight, the paise render quieter. `main` is the integer part with
 * symbol and Indian grouping ("₹5,400"); `fraction` is ".00" (always two
 * digits — a payments screen must never silently drop paise). Falls back to
 * an em dash for a non-numeric amount.
 */
export function formatCurrencyParts(
  amount: string | number,
  currency = "INR",
): { main: string; fraction: string } {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return { main: "—", fraction: "" };

  const parts = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(value);

  const fractionIndex = parts.findIndex((part) => part.type === "decimal");
  if (fractionIndex === -1) {
    return { main: parts.map((part) => part.value).join(""), fraction: "" };
  }
  return {
    main: parts
      .slice(0, fractionIndex)
      .map((part) => part.value)
      .join(""),
    fraction: parts
      .slice(fractionIndex)
      .map((part) => part.value)
      .join(""),
  };
}

/** Full amount with paise — "₹5,400.00" — for places that need one string. */
export function formatCurrencyExact(amount: string | number, currency = "INR"): string {
  const { main, fraction } = formatCurrencyParts(amount, currency);
  return `${main}${fraction}`;
}

/**
 * Absolute, unambiguous local timestamp for forensic surfaces (tables of
 * record, audit trail): "3 Oct 2026, 14:32:09". 24-hour on purpose — no
 * am/pm to misread when reconstructing a sequence of events. Pass
 * `seconds: false` for a compact "3 Oct 2026, 14:32".
 */
export function formatDateTime(isoTimestamp: string, options: { seconds?: boolean } = {}): string {
  const { seconds = true } = options;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
  }).format(date);
}

/** Date and time as two strings, for a two-line table cell. */
export function formatDateTimeParts(isoTimestamp: string): { date: string; time: string } {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(date),
  };
}

/**
 * Elapsed time between two real timestamps, for the gaps in the Decision
 * Chain and Audit trail: "420ms", "2.1s", "3m 4s". The sub-second range
 * matters here — the live pipeline runs in well under a second per step.
 */
export function formatElapsedMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatDuration(ms / 1000);
}

/**
 * A 0–1 decimal (the backend serializes confidence / probability as a
 * Decimal string like "0.725") as a percentage with at most one decimal:
 * "72.5%", "85%". null/undefined/non-numeric render as an em dash.
 */
export function formatRatioPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const ratio = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(ratio)) return "—";
  const percent = Math.round(ratio * 1000) / 10;
  return `${percent}%`;
}
