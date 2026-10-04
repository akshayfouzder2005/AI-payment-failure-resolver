/**
 * Validation of the address a customer notification will be sent to.
 *
 * The backend's SEND_NOTIFICATION action emails whatever address is on the
 * payment's customer record, through Brevo when the notifications provider
 * is live. An address that merely LOOKS valid but cannot receive mail
 * (example.com, .test, localhost…) would "send" successfully from the
 * provider's side and reach nobody — so when real delivery is on, those are
 * rejected up front instead of producing a green result for a dead address.
 *
 * When notifications are mocked nothing is delivered, so only syntax is
 * checked and a blank address is allowed (the backend supplies its own
 * placeholder).
 */
import type { HealthResponse } from "../types/api";

// Domains reserved by RFC 2606 / RFC 6761 and friends: syntactically fine,
// never deliverable.
const UNDELIVERABLE_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "example",
  "test",
  "invalid",
  "localhost",
  "local",
];

const LOCAL_PART = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** Syntax only: one @, a sane local part, dot-separated domain labels, an alphabetic TLD of 2+ letters. */
export function isSyntacticEmail(email: string): boolean {
  if (email.length > 254) return false;
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return false;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART.test(local)) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;

  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return false;
  return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1]);
}

export function isUndeliverableDomain(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return UNDELIVERABLE_DOMAINS.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`));
}

/** An error message, or null when the address is acceptable for the given delivery mode. */
export function validateRecipientEmail(email: string, options: { deliverable: boolean }): string | null {
  const value = email.trim();
  if (value === "") {
    return options.deliverable ? "Enter the email address that should receive the customer notification." : null;
  }
  if (!isSyntacticEmail(value)) return "That doesn't look like a valid email address.";
  if (options.deliverable && isUndeliverableDomain(value)) {
    const domain = value.slice(value.lastIndexOf("@") + 1);
    return `${domain} can't receive real mail. Use an address you control to see the notification arrive.`;
  }
  return null;
}

export interface NotificationMode {
  /** true when the backend's notification provider actually sends */
  live: boolean;
  /** the provider name the backend reports, e.g. "brevo" — null if unknown */
  provider: string | null;
}

/** What /health says about notification delivery. Unknown health is treated as not live. */
export function notificationMode(health: HealthResponse | null): NotificationMode {
  const provider = health?.providers.notifications ?? null;
  return { live: provider !== null && provider !== "mock", provider };
}
