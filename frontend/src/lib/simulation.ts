/**
 * Scenario definitions for the Recovery Lab. Everything here is INPUT to the
 * real POST /simulate/failed-payment endpoint — nothing in this file decides
 * or predicts an outcome. What the AI recommends, what policy rules, and
 * what the executor does all come back from the backend.
 *
 * The failure types are written to the backend mock adapter's own shapes
 * (app/integrations/payment_provider/mock_adapter.py): a Razorpay-style
 * error code plus a message. With AI_PROVIDER=mock the classifier keys on
 * keywords in that message ("insufficient", "expired", "declined") and on
 * the GATEWAY_ERROR code, so each type below lands in a distinct branch. With
 * a live LLM the same inputs are still sent verbatim; only the model's
 * answer can vary.
 */
import type { SimulateFailedPaymentRequest } from "../types/api";
import { validateRecipientEmail } from "./recipient";

export interface FailureType {
  id: string;
  label: string;
  hint: string;
  failure_code: string;
  failure_message: string;
}

export const FAILURE_TYPES: FailureType[] = [
  {
    id: "insufficient_funds",
    label: "Insufficient funds",
    hint: "Often clears on retry",
    failure_code: "BAD_REQUEST_ERROR",
    failure_message: "Insufficient funds in the customer's account",
  },
  {
    id: "card_declined",
    label: "Card declined",
    hint: "Issuer said no",
    failure_code: "GATEWAY_ERROR",
    failure_message: "The card was declined by the issuing bank",
  },
  {
    id: "card_expired",
    label: "Card expired",
    hint: "Needs new card details",
    failure_code: "BAD_REQUEST_ERROR",
    failure_message: "The card has expired",
  },
  {
    id: "gateway_timeout",
    label: "Gateway timeout",
    hint: "Transient network fault",
    failure_code: "GATEWAY_ERROR",
    failure_message: "Gateway timed out while processing the payment",
  },
  {
    id: "unknown",
    label: "Unclassified failure",
    hint: "Usually a customer email",
    failure_code: "BAD_REQUEST_ERROR",
    failure_message: "The payment could not be completed",
  },
];

export interface ScenarioForm {
  failureTypeId: string;
  amount: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export const DEFAULT_FORM: ScenarioForm = {
  failureTypeId: "insufficient_funds",
  amount: "1499",
  customerName: "Ananya Rao",
  customerEmail: "ananya.rao@example.com",
  customerPhone: "+919800000001",
};

export const AMOUNT_PRESETS = [
  { label: "₹999", value: "999" },
  { label: "₹4,999", value: "4999" },
  // The backend's default high-risk threshold is ₹50,000 (MerchantSettings);
  // this preset sits above it so the policy gate's high-value rule can fire.
  { label: "₹72,000", value: "72000" },
];

export type FormErrors = Partial<Record<"amount" | "customerEmail" | "customerPhone", string>>;

/** Client-side checks only for things the API would otherwise accept and mangle; the backend stays authoritative. */
export function validateForm(form: ScenarioForm, options: { deliverableEmail?: boolean } = {}): FormErrors {
  const errors: FormErrors = {};

  const amount = form.amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    errors.amount = "Enter a positive amount with at most two decimals.";
  } else if (Number(amount) > 10_000_000) {
    errors.amount = "Amount is above the ₹1,00,00,000 simulator limit.";
  }

  // With live notifications the address must be able to receive mail (and
  // must be given); with mocked ones only its syntax matters. See lib/recipient.ts.
  const emailError = validateRecipientEmail(form.customerEmail, { deliverable: options.deliverableEmail ?? false });
  if (emailError) errors.customerEmail = emailError;

  const phone = form.customerPhone.trim();
  if (phone !== "" && !/^\+?[0-9 ()-]{7,16}$/.test(phone)) {
    errors.customerPhone = "Use digits with an optional leading +.";
  }

  return errors;
}

export function failureTypeById(id: string): FailureType {
  return FAILURE_TYPES.find((type) => type.id === id) ?? FAILURE_TYPES[0];
}

/**
 * The exact JSON body that will be POSTed. Blank optional fields are omitted
 * (the backend then generates its own default, so a blank is never sent as
 * an empty string). merchant_id attributes the payment to this workspace so
 * it shows up in this merchant's Payments and metrics.
 */
export function buildRequest(form: ScenarioForm, merchantId: string | null): SimulateFailedPaymentRequest {
  const type = failureTypeById(form.failureTypeId);
  const request: SimulateFailedPaymentRequest = {
    amount: Number(form.amount.trim()).toFixed(2),
    failure_code: type.failure_code,
    failure_message: type.failure_message,
  };
  if (form.customerName.trim()) request.customer_name = form.customerName.trim();
  if (form.customerEmail.trim()) request.customer_email = form.customerEmail.trim();
  if (form.customerPhone.trim()) request.customer_phone = form.customerPhone.trim();
  if (merchantId) request.merchant_id = merchantId;
  return request;
}

// --- demo workspace -----------------------------------------------------

export interface DemoScenario {
  id: string;
  title: string;
  /** What this input is designed to exercise — a target, not a promise. */
  exercises: string;
  failureTypeId: string;
  amount: string;
  customerName: string;
  /** local part only; a per-run suffix keeps each run's customers fresh */
  emailLocal: string;
  phone: string;
}

/**
 * Nine fixed inputs, run in order. They are chosen to walk the policy
 * ladder: a clean approve, high-value downgrade, and — via three payments
 * from one customer — the repeated-failure escalation. Inputs are
 * deterministic; with AI_PROVIDER=mock so are the outcomes.
 */
export const DEMO_SCENARIOS: DemoScenario[] = [
  { id: "d1", title: "Soft decline, low value", exercises: "Approve a retry", failureTypeId: "insufficient_funds", amount: "999", customerName: "Ananya Rao", emailLocal: "ananya.rao", phone: "+919800000011" },
  { id: "d2", title: "Card declined", exercises: "Send a payment link", failureTypeId: "card_declined", amount: "1499", customerName: "Karthik Iyer", emailLocal: "karthik.iyer", phone: "+919800000012" },
  { id: "d3", title: "Expired card", exercises: "Link, not a blind retry", failureTypeId: "card_expired", amount: "2499", customerName: "Meera Nair", emailLocal: "meera.nair", phone: "+919800000013" },
  { id: "d4", title: "Gateway timeout", exercises: "Transient fault → retry", failureTypeId: "gateway_timeout", amount: "1999", customerName: "Ravi Shah", emailLocal: "ravi.shah", phone: "+919800000014" },
  { id: "d5", title: "High-value payment", exercises: "Policy overrides a retry", failureTypeId: "insufficient_funds", amount: "72000", customerName: "Sneha Kulkarni", emailLocal: "sneha.kulkarni", phone: "+919800000015" },
  { id: "d6", title: "Unclassified failure", exercises: "Soft notification", failureTypeId: "unknown", amount: "799", customerName: "Arjun Mehta", emailLocal: "arjun.mehta", phone: "+919800000016" },
  { id: "d7", title: "Repeat customer · 1 of 3", exercises: "First failure for a customer", failureTypeId: "insufficient_funds", amount: "1299", customerName: "Imran Khan", emailLocal: "imran.khan", phone: "+919800000017" },
  { id: "d8", title: "Repeat customer · 2 of 3", exercises: "Second failure, same customer", failureTypeId: "insufficient_funds", amount: "1299", customerName: "Imran Khan", emailLocal: "imran.khan", phone: "+919800000017" },
  { id: "d9", title: "Repeat customer · 3 of 3", exercises: "Escalate repeated failures", failureTypeId: "insufficient_funds", amount: "1299", customerName: "Imran Khan", emailLocal: "imran.khan", phone: "+919800000017" },
];

/**
 * Builds the request for one demo scenario. `runId` makes the customer's
 * email unique to this run (plus-addressing, @example.com) so repeated
 * "Load demo workspace" clicks don't pile prior failures onto the same
 * customers and change the outcomes — each run is reproducible.
 */
export function buildDemoRequest(
  scenario: DemoScenario,
  merchantId: string | null,
  runId: string,
  recipientEmail: string | null = null,
): SimulateFailedPaymentRequest {
  return buildRequest(
    {
      failureTypeId: scenario.failureTypeId,
      amount: scenario.amount,
      customerName: scenario.customerName,
      customerEmail: demoEmailFor(scenario, runId, recipientEmail),
      customerPhone: scenario.phone,
    },
    merchantId,
  );
}

export function newRunId(now: number = Date.now()): string {
  return now.toString(36).slice(-6);
}

/**
 * The customer email for one demo scenario.
 *
 * Without a recipient: `<name>+<run>@example.com` — safe, and never delivers.
 * With a recipient the demo's customer emails are plus-addressed variants of
 * it (`you+imrankhan-k3f9a2@gmail.com`), so any customer notification the
 * pipeline sends really lands in that one mailbox on providers that support
 * plus-addressing (Gmail, Outlook, Fastmail, iCloud…). The tag is derived from
 * the scenario's customer, so the three repeat-customer payments still share
 * one address and their failures still accumulate; the run id keeps separate
 * runs on fresh customers.
 */
export function demoEmailFor(scenario: DemoScenario, runId: string, recipientEmail: string | null): string {
  const recipient = recipientEmail?.trim();
  if (!recipient) return `${scenario.emailLocal}+${runId}@example.com`;

  const at = recipient.lastIndexOf("@");
  // Strip any plus-tag the user already typed so tags never stack.
  const local = recipient.slice(0, at).split("+")[0];
  const domain = recipient.slice(at + 1);
  const tag = `${scenario.emailLocal.replace(/[^a-z0-9]/gi, "")}-${runId}`;
  return `${local}+${tag}@${domain}`;
}
