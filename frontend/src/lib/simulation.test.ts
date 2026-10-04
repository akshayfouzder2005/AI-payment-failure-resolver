import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM,
  DEMO_SCENARIOS,
  FAILURE_TYPES,
  buildDemoRequest,
  buildRequest,
  newRunId,
  validateForm,
} from "./simulation";

describe("validateForm", () => {
  it("accepts the default form", () => {
    expect(validateForm(DEFAULT_FORM)).toEqual({});
  });

  it.each(["", "abc", "0", "-5", "12.345", "1e5"])("rejects the amount %p", (amount) => {
    expect(validateForm({ ...DEFAULT_FORM, amount }).amount).toBeTruthy();
  });

  it("rejects an absurdly large amount", () => {
    expect(validateForm({ ...DEFAULT_FORM, amount: "99999999" }).amount).toMatch(/limit/);
  });

  it("allows a blank email and phone (the backend supplies defaults) but not malformed ones", () => {
    expect(validateForm({ ...DEFAULT_FORM, customerEmail: "", customerPhone: "" })).toEqual({});
    expect(validateForm({ ...DEFAULT_FORM, customerEmail: "not-an-email" }).customerEmail).toBeTruthy();
    expect(validateForm({ ...DEFAULT_FORM, customerPhone: "call me" }).customerPhone).toBeTruthy();
  });
});

describe("buildRequest", () => {
  it("sends the failure type's real gateway code and message, a 2-decimal amount, and the merchant", () => {
    const request = buildRequest({ ...DEFAULT_FORM, failureTypeId: "card_expired", amount: "2499" }, "m1");
    expect(request).toEqual({
      amount: "2499.00",
      failure_code: "BAD_REQUEST_ERROR",
      failure_message: "The card has expired",
      customer_name: "Ananya Rao",
      customer_email: "ananya.rao@example.com",
      customer_phone: "+919800000001",
      merchant_id: "m1",
    });
  });

  it("omits blank optional fields instead of sending empty strings", () => {
    const request = buildRequest({ ...DEFAULT_FORM, customerName: " ", customerEmail: "", customerPhone: "" }, null);
    expect(request).not.toHaveProperty("customer_name");
    expect(request).not.toHaveProperty("customer_email");
    expect(request).not.toHaveProperty("customer_phone");
    expect(request).not.toHaveProperty("merchant_id");
  });

  it("falls back to the first failure type for an unknown id", () => {
    expect(buildRequest({ ...DEFAULT_FORM, failureTypeId: "nope" }, null).failure_message).toBe(FAILURE_TYPES[0].failure_message);
  });
});

describe("demo scenarios", () => {
  it("has nine fixed scenarios with unique ids", () => {
    expect(DEMO_SCENARIOS).toHaveLength(9);
    expect(new Set(DEMO_SCENARIOS.map((s) => s.id)).size).toBe(9);
  });

  it("uses only known failure types and valid amounts", () => {
    for (const scenario of DEMO_SCENARIOS) {
      expect(FAILURE_TYPES.some((t) => t.id === scenario.failureTypeId)).toBe(true);
      expect(Number(scenario.amount)).toBeGreaterThan(0);
    }
  });

  it("includes a payment above the default ₹50,000 high-risk threshold", () => {
    expect(DEMO_SCENARIOS.some((s) => Number(s.amount) > 50_000)).toBe(true);
  });

  it("gives the three repeat-customer scenarios one identical customer so failures accumulate", () => {
    const repeat = DEMO_SCENARIOS.filter((s) => s.title.startsWith("Repeat customer"));
    expect(repeat).toHaveLength(3);
    expect(new Set(repeat.map((s) => `${s.emailLocal}|${s.customerName}`)).size).toBe(1);
  });

  it("makes a per-run email so repeated runs start from fresh customers, identical within a run", () => {
    const repeat = DEMO_SCENARIOS.filter((s) => s.title.startsWith("Repeat customer"));
    const a = repeat.map((s) => buildDemoRequest(s, "m1", "run1").customer_email);
    const b = buildDemoRequest(repeat[0], "m1", "run2").customer_email;
    expect(new Set(a).size).toBe(1);
    expect(a[0]).toBe("imran.khan+run1@example.com");
    expect(b).not.toBe(a[0]);
  });

  it("only ever targets example.com addresses", () => {
    for (const scenario of DEMO_SCENARIOS) {
      expect(buildDemoRequest(scenario, "m1", "x").customer_email).toMatch(/@example\.com$/);
    }
  });
});

describe("newRunId", () => {
  it("is a short, stable function of the clock", () => {
    expect(newRunId(1_700_000_000_000)).toBe(newRunId(1_700_000_000_000));
    expect(newRunId(1)).not.toBe(newRunId(999_999_999));
    expect(newRunId().length).toBeLessThanOrEqual(6);
  });
});
