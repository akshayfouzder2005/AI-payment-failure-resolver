import { describe, expect, it } from "vitest";
import { isSyntacticEmail, isUndeliverableDomain, notificationMode, validateRecipientEmail } from "./recipient";

describe("isSyntacticEmail", () => {
  it.each(["a@b.co", "first.last@sub.domain.com", "you+tag@gmail.com", "o'neil@corp.io", "x_y-z@my-host.org"])("accepts %s", (email) => {
    expect(isSyntacticEmail(email)).toBe(true);
  });

  it.each([
    "",
    "plain",
    "no-at.example.com",
    "@nolocal.com",
    "two@@signs.com",
    "a@b",
    "a@b.c", // TLD too short
    "a@b.123",
    "a@-bad.com",
    "a@bad-.com",
    "a@.com",
    "a..b@c.com",
    ".a@c.com",
    "a.@c.com",
    "sp ace@c.com",
    "a@c..com",
  ])("rejects %p", (email) => {
    expect(isSyntacticEmail(email)).toBe(false);
  });

  it("rejects over-long addresses", () => {
    expect(isSyntacticEmail(`${"a".repeat(65)}@b.com`)).toBe(false);
    expect(isSyntacticEmail(`a@${"b".repeat(250)}.com`)).toBe(false);
  });
});

describe("isUndeliverableDomain", () => {
  it.each(["a@example.com", "a@EXAMPLE.org", "a@mail.example.net", "a@x.test", "a@host.invalid", "a@localhost", "a@printer.local"])(
    "flags %s",
    (email) => expect(isUndeliverableDomain(email)).toBe(true),
  );
  it.each(["a@gmail.com", "a@notexample.com", "a@myexample.com", "a@test.io", "a@company.co.in"])("allows %s", (email) =>
    expect(isUndeliverableDomain(email)).toBe(false),
  );
});

describe("validateRecipientEmail", () => {
  it("in mock mode allows blank, and example.com, but still rejects malformed addresses", () => {
    expect(validateRecipientEmail("", { deliverable: false })).toBeNull();
    expect(validateRecipientEmail("a@example.com", { deliverable: false })).toBeNull();
    expect(validateRecipientEmail("nope", { deliverable: false })).toMatch(/valid email/);
  });

  it("in live mode requires an address", () => {
    expect(validateRecipientEmail("   ", { deliverable: true })).toMatch(/Enter the email address/);
  });

  it("in live mode rejects addresses that can never receive mail, naming the domain", () => {
    expect(validateRecipientEmail("ananya@example.com", { deliverable: true })).toMatch(/example\.com can't receive real mail/);
    expect(validateRecipientEmail("a@b.test", { deliverable: true })).toMatch(/b\.test can't receive/);
  });

  it("in live mode accepts a real-looking address, including plus-addressed ones", () => {
    expect(validateRecipientEmail("you@gmail.com", { deliverable: true })).toBeNull();
    expect(validateRecipientEmail("you+demo@gmail.com", { deliverable: true })).toBeNull();
  });

  it("trims before validating", () => {
    expect(validateRecipientEmail("  you@gmail.com  ", { deliverable: true })).toBeNull();
  });
});

describe("notificationMode", () => {
  const health = (notifications: string) => ({
    status: "ok",
    environment: "TEST",
    providers: { ai: "mock", recovery_gateway: "mock", notifications },
  });
  it("is live for any provider other than mock, and carries its name", () => {
    expect(notificationMode(health("brevo"))).toEqual({ live: true, provider: "brevo" });
    expect(notificationMode(health("mock"))).toEqual({ live: false, provider: "mock" });
  });
  it("treats unknown health as not live rather than blocking the user", () => {
    expect(notificationMode(null)).toEqual({ live: false, provider: null });
  });
});
