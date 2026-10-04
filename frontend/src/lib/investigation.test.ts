import { describe, expect, it } from "vitest";
import {
  auditExtras,
  buildRuns,
  deriveChain,
  describeNotification,
  describeRerun,
  elapsedBetween,
  extractPaymentLink,
  extractViolatedRules,
  isFallbackDecision,
  isPipelineInFlight,
  PIPELINE_WINDOW_MS,
  policyOverrodeAI,
} from "./investigation";
import {
  ATTEMPT_ID,
  makeAttempt,
  makeAudit,
  makeDecision,
  makePayment,
} from "../test/fixtures";

describe("buildRuns", () => {
  it("returns no runs when there are neither decisions nor attempts", () => {
    expect(buildRuns([], [])).toEqual([]);
  });

  it("pairs each attempt with the decision it points at, oldest first, 1-based", () => {
    const d1 = makeDecision({ id: "d1", created_at: "2026-10-03T09:00:01Z" });
    const d2 = makeDecision({ id: "d2", created_at: "2026-10-03T10:00:01Z" });
    const a1 = makeAttempt({ id: "a1", ai_decision_id: "d1", created_at: "2026-10-03T09:00:02Z" });
    const a2 = makeAttempt({ id: "a2", ai_decision_id: "d2", created_at: "2026-10-03T10:00:02Z" });

    const runs = buildRuns([d1, d2], [a2, a1]);

    expect(runs.map((r) => [r.index, r.attempt?.id, r.decision?.id])).toEqual([
      [1, "a1", "d1"],
      [2, "a2", "d2"],
    ]);
  });

  it("keeps a diagnosis no attempt references as its own run with no attempt", () => {
    const d1 = makeDecision({ id: "d1", created_at: "2026-10-03T09:00:01Z" });
    const a1 = makeAttempt({ id: "a1", ai_decision_id: "d1", created_at: "2026-10-03T09:00:02Z" });
    const d2 = makeDecision({ id: "d2", created_at: "2026-10-03T11:00:00Z" });

    const runs = buildRuns([d1, d2], [a1]);

    expect(runs).toHaveLength(2);
    expect(runs[1].decision?.id).toBe("d2");
    expect(runs[1].attempt).toBeNull();
  });

  it("does not guess a decision for an attempt whose ai_decision_id is null", () => {
    const runs = buildRuns([makeDecision({ id: "d1" })], [makeAttempt({ ai_decision_id: null })]);
    const withAttempt = runs.find((r) => r.attempt);
    expect(withAttempt?.decision).toBeNull();
  });
});

describe("isFallbackDecision", () => {
  it("detects the deterministic fallback by model name", () => {
    expect(isFallbackDecision(makeDecision({ model_name: "fallback-deterministic" }))).toBe(true);
  });

  it("detects a schema-invalid/low-confidence fallback that keeps the real model name", () => {
    expect(
      isFallbackDecision(makeDecision({ model_name: "openai/gpt-oss-20b", risk_factors: ["fallback_decision_used"] })),
    ).toBe(true);
  });

  it("does not flag a normal decision", () => {
    expect(isFallbackDecision(makeDecision())).toBe(false);
  });
});

describe("extractPaymentLink", () => {
  it("returns the real URL from a successful link-creating attempt", () => {
    const link = extractPaymentLink(makeAttempt({ action_type: "SEND_PAYMENT_LINK" }));
    expect(link).toEqual({ url: "https://rzp.io/i/AbC123", host: "rzp.io", simulated: false });
  });

  it("strips trailing sentence punctuation from the URL", () => {
    const link = extractPaymentLink(makeAttempt({ result_message: "Payment link created: https://rzp.io/i/AbC123." }));
    expect(link?.url).toBe("https://rzp.io/i/AbC123");
  });

  it("flags the mock gateway's host as simulated", () => {
    const link = extractPaymentLink(
      makeAttempt({
        action_type: "SEND_PAYMENT_LINK",
        result_message: "Mock gateway created a simulated payment link for 100 INR: https://mock.razorpay.link/mock_plink_ab12",
      }),
    );
    expect(link?.simulated).toBe(true);
  });

  it("returns null when the attempt did not succeed", () => {
    expect(extractPaymentLink(makeAttempt({ status: "failed" }))).toBeNull();
  });

  it("returns null for actions that never create a link", () => {
    expect(
      extractPaymentLink(makeAttempt({ action_type: "SEND_NOTIFICATION", result_message: "see https://example.com" })),
    ).toBeNull();
  });

  it("returns null when the message has no URL (mock retry), rather than inventing one", () => {
    expect(
      extractPaymentLink(makeAttempt({ result_message: "Mock gateway simulated a successful retry of pay_1 for 10 INR." })),
    ).toBeNull();
  });

  it("never returns a non-http(s) URL", () => {
    expect(extractPaymentLink(makeAttempt({ result_message: "created: javascript:alert(1)" }))).toBeNull();
  });
});

describe("describeNotification", () => {
  it("reads Brevo/email from the provider's own message", () => {
    const result = describeNotification(
      makeAttempt({ action_type: "SEND_NOTIFICATION", result_message: "Email sent to a@b.test via Brevo." }),
    );
    expect(result).toEqual({
      vendor: "Brevo",
      channel: "Email",
      referenceLabel: "Brevo message ID",
      audience: "Customer",
    });
  });

  it("reads Twilio/SMS and marks escalations as addressed to the merchant", () => {
    const result = describeNotification(
      makeAttempt({ action_type: "ESCALATE_TO_MERCHANT", result_message: "SMS sent to +91980 via Twilio." }),
    );
    expect(result).toMatchObject({ vendor: "Twilio", channel: "SMS", audience: "Merchant" });
  });

  it("claims no vendor for a mock-provider result", () => {
    const result = describeNotification(
      makeAttempt({ action_type: "SEND_NOTIFICATION", result_message: "Mock email notification sent to customer (a@b.test)." }),
    );
    expect(result).toMatchObject({ vendor: null, channel: null, referenceLabel: "Provider reference" });
  });

  it("returns null for non-notification actions", () => {
    expect(describeNotification(makeAttempt({ action_type: "SEND_PAYMENT_LINK" }))).toBeNull();
  });
});

describe("extractViolatedRules", () => {
  const entry = (rules: unknown) =>
    makeAudit({
      entity_type: "RecoveryAttempt",
      entity_id: ATTEMPT_ID,
      action: "policy_decision_recorded",
      details: { message: "x", violated_rules: rules },
    });

  it("returns the rules the policy entry cites", () => {
    expect(extractViolatedRules([entry(["MAX_RETRY_COUNT_EXCEEDED"])], ATTEMPT_ID)).toEqual(["MAX_RETRY_COUNT_EXCEEDED"]);
  });

  it("returns an empty array when the verdict was recorded with no rule firing", () => {
    expect(extractViolatedRules([entry([])], ATTEMPT_ID)).toEqual([]);
  });

  it("returns null (unknown) when the trail has no policy entry for this attempt", () => {
    expect(extractViolatedRules([makeAudit()], ATTEMPT_ID)).toBeNull();
    expect(extractViolatedRules(null, ATTEMPT_ID)).toBeNull();
  });

  it("ignores another attempt's policy entry", () => {
    expect(extractViolatedRules([entry(["X"])], "some-other-attempt")).toBeNull();
  });
});

describe("policyOverrodeAI", () => {
  it("is true only when the final action differs from the AI's recommendation", () => {
    const decision = makeDecision({ recommended_action: "RETRY_PAYMENT" });
    expect(policyOverrodeAI({ id: "r", index: 1, decision, attempt: makeAttempt({ action_type: "SEND_PAYMENT_LINK" }) })).toBe(true);
    expect(policyOverrodeAI({ id: "r", index: 1, decision, attempt: makeAttempt({ action_type: "RETRY_PAYMENT" }) })).toBe(false);
    expect(policyOverrodeAI({ id: "r", index: 1, decision, attempt: null })).toBe(false);
  });
});

describe("auditExtras", () => {
  it("lists every details key except message, stringified", () => {
    const extras = auditExtras(
      makeAudit({ details: { message: "m", violated_rules: ["A", "B"], provider_reference: "", n: 3 } }),
    );
    expect(extras).toEqual([
      ["violated_rules", "A, B"],
      ["provider_reference", "—"],
      ["n", "3"],
    ]);
  });
});

describe("isPipelineInFlight", () => {
  const now = new Date("2026-10-03T09:00:30Z").getTime();

  it("is true for a fresh payment with nothing recorded yet", () => {
    expect(isPipelineInFlight(makePayment(), [], [], now)).toBe(true);
  });

  it("is false once the latest attempt is terminal", () => {
    const runs = buildRuns([makeDecision()], [makeAttempt({ status: "success" })]);
    expect(isPipelineInFlight(makePayment(), runs, [], now)).toBe(false);
  });

  it("is true while the latest attempt is still executing", () => {
    const runs = buildRuns([makeDecision()], [makeAttempt({ status: "in_progress" })]);
    expect(isPipelineInFlight(makePayment(), runs, [], now)).toBe(true);
  });

  it("is false once the pipeline logged processing_stopped", () => {
    const stopped = makeAudit({ action: "processing_stopped" });
    expect(isPipelineInFlight(makePayment(), [], [stopped], now)).toBe(false);
  });

  it("is false for an old payment even with nothing recorded — it never ran", () => {
    const later = new Date("2026-10-03T09:00:00Z").getTime() + PIPELINE_WINDOW_MS + 1000;
    expect(isPipelineInFlight(makePayment({ created_at: "2026-10-03T09:00:00Z" }), [], [], later)).toBe(false);
  });
});

describe("deriveChain", () => {
  const complete = () => {
    const runs = buildRuns([makeDecision()], [makeAttempt()]);
    return deriveChain({ payment: makePayment(), run: runs[0], audit: [], inFlight: false });
  };

  it("produces the five nodes in order", () => {
    expect(complete().map((n) => n.key)).toEqual(["failure", "ai", "policy", "execution", "outcome"]);
  });

  it("marks AI advisory and policy authoritative — distinct kinds", () => {
    const nodes = complete();
    expect(nodes[1].kind).toBe("advisory");
    expect(nodes[2].kind).toBe("authoritative");
  });

  it("reflects a fully recorded run as done at every step", () => {
    const nodes = complete();
    expect(nodes.map((n) => n.phase)).toEqual(["done", "done", "done", "done", "done"]);
    expect(nodes[1].headline).toBe("Recommends retry payment");
    expect(nodes[1].detail).toBe("88% confidence · 72.5% recoverable");
    expect(nodes[2].stateLabel).toBe("Approved");
    expect(nodes[3].stateLabel).toBe("Success");
    expect(nodes[4].stateLabel).toBe("Recovered");
  });

  it("shows an override when policy changed the action", () => {
    const runs = buildRuns(
      [makeDecision({ recommended_action: "RETRY_PAYMENT" })],
      [makeAttempt({ action_type: "SEND_PAYMENT_LINK", policy_decision: "MODIFY" })],
    );
    const policy = deriveChain({ payment: makePayment(), run: runs[0], audit: [], inFlight: false })[2];
    expect(policy.stateLabel).toBe("Modified");
    expect(policy.headline).toBe("Final action: send payment link");
    expect(policy.detail).toBe("Overrides AI: retry payment");
    expect(policy.tone).toBe("warning");
  });

  it("marks a fallback diagnosis as a warning, not a normal diagnosis", () => {
    const runs = buildRuns(
      [makeDecision({ model_name: "fallback-deterministic", reason: "LLM provider error: timeout", risk_factors: ["fallback_decision_used"] })],
      [],
    );
    const ai = deriveChain({ payment: makePayment(), run: runs[0], audit: [], inFlight: false })[1];
    expect(ai.stateLabel).toBe("Fallback");
    expect(ai.tone).toBe("warning");
    expect(ai.detail).toBe("LLM provider error: timeout");
  });

  it("draws unrecorded steps as running → waiting while the pipeline is in flight", () => {
    const nodes = deriveChain({ payment: makePayment({ status: "failed" }), run: null, audit: [], inFlight: true });
    expect(nodes.slice(1, 4).map((n) => n.phase)).toEqual(["running", "waiting", "waiting"]);
  });

  it("draws unrecorded steps as 'not run', never as success, when nothing is in flight", () => {
    const nodes = deriveChain({ payment: makePayment({ status: "failed" }), run: null, audit: [], inFlight: false });
    expect(nodes.slice(1, 4).map((n) => [n.phase, n.stateLabel])).toEqual([
      ["idle", "Not run"],
      ["idle", "Not run"],
      ["idle", "Not run"],
    ]);
  });

  it("marks the first gap 'stopped' when the pipeline logged processing_stopped", () => {
    const audit = [makeAudit({ action: "processing_stopped" })];
    const nodes = deriveChain({ payment: makePayment({ status: "failed" }), run: null, audit, inFlight: false });
    expect(nodes[1].phase).toBe("stopped");
    expect(nodes[2].phase).toBe("idle");
  });

  it("shows a failed execution with its error, and a pending policy gate when there is only a diagnosis", () => {
    const failedRun = buildRuns([makeDecision()], [makeAttempt({ status: "failed", error_message: "Razorpay returned 400", result_message: null })]);
    const failed = deriveChain({ payment: makePayment({ status: "failed" }), run: failedRun[0], audit: [], inFlight: false })[3];
    expect(failed.tone).toBe("danger");
    expect(failed.detail).toBe("Razorpay returned 400");

    const diagOnly = buildRuns([makeDecision()], []);
    const policy = deriveChain({ payment: makePayment({ status: "failed" }), run: diagOnly[0], audit: [], inFlight: true })[2];
    expect(policy.phase).toBe("running");
  });

  it("reports the payment's CURRENT status as the outcome, titled as such", () => {
    const outcome = complete()[4];
    expect(outcome.title).toBe("Current status");
  });
});

describe("elapsedBetween", () => {
  it("returns milliseconds, or null for missing/reversed inputs", () => {
    expect(elapsedBetween("2026-10-03T09:00:00.000Z", "2026-10-03T09:00:01.250Z")).toBe(1250);
    expect(elapsedBetween(null, "2026-10-03T09:00:01Z")).toBeNull();
    expect(elapsedBetween("2026-10-03T09:00:05Z", "2026-10-03T09:00:01Z")).toBeNull();
  });
});

describe("describeRerun", () => {
  const result = (over: Record<string, unknown> = {}, attempt: Partial<ReturnType<typeof makeAttempt>> = {}) => ({
    payment_id: "p",
    ai_decision_id: "d",
    policy_decision: "APPROVE",
    policy_reason: "ok",
    violated_rules: [],
    recovery_attempt: makeAttempt(attempt),
    idempotent_replay: false,
    ...over,
  });

  it("says nothing was sent again for an idempotent replay", () => {
    const r = describeRerun(result({ idempotent_replay: true }, { attempt_number: 2 }) as never);
    expect(r.replay).toBe(true);
    expect(r.message).toMatch(/Nothing was sent again/);
    expect(r.message).toMatch(/#2/);
  });

  it("summarises a fresh execution with policy verdict, action, status and the provider's own text", () => {
    const r = describeRerun(
      result({}, { action_type: "SEND_NOTIFICATION", result_message: "Email sent to a@b.co via Brevo." }) as never,
    );
    expect(r.replay).toBe(false);
    expect(r.message).toBe("Policy approved → send notification · success. Email sent to a@b.co via Brevo.");
  });

  it("prefers the error text for a failed attempt", () => {
    const r = describeRerun(
      result({ policy_decision: "MODIFY" }, { status: "failed", error_message: "Brevo returned 400", result_message: null }) as never,
    );
    expect(r.message).toBe("Policy modified → retry payment · failed. Brevo returned 400");
  });
});
