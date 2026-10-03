import { humanizeCode } from "./format";
import type { PaymentRead } from "../types/api";

export interface FailureReasonCount {
  label: string;
  count: number;
}

/**
 * Groups payments by gateway `failure_code`, most frequent first. A payment
 * with no failure_code groups under "Unspecified" rather than being dropped,
 * so the counts always sum to the number of payments passed in. Ties keep
 * first-seen order (Array.prototype.sort is stable), which for the
 * newest-first /payments list means the more recent reason wins a tie.
 */
export function countFailureReasons(payments: PaymentRead[]): FailureReasonCount[] {
  const counts = new Map<string, number>();
  for (const payment of payments) {
    const label = payment.failure_code ? humanizeCode(payment.failure_code) : "Unspecified";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
