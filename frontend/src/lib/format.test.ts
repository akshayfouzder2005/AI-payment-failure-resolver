import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCount, formatCurrency, formatPercent, formatRelativeTime } from "./format";

describe("formatCurrency", () => {
  it("formats a decimal string as Indian Rupees with Indian digit grouping", () => {
    // Design spec §4: "₹1,24,500", not "₹124,500".
    expect(formatCurrency("124500")).toBe("₹1,24,500");
    expect(formatCurrency("375000.00")).toBe("₹3,75,000");
  });

  it("accepts a plain number as well as a decimal string", () => {
    expect(formatCurrency(12000)).toBe("₹12,000");
  });

  it("drops decimal places (backend Decimal amounts are whole rupees in practice)", () => {
    expect(formatCurrency("1234.89")).toBe("₹1,235");
  });

  it("falls back to an em dash for a value that can't be parsed", () => {
    expect(formatCurrency("not-a-number")).toBe("—");
  });
});

describe("formatPercent", () => {
  it("formats a 0-1 rate as a whole-number percentage", () => {
    expect(formatPercent(0.6)).toBe("60%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("falls back to an em dash for a non-finite rate", () => {
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("formatCount", () => {
  it("formats an integer count with Indian digit grouping", () => {
    expect(formatCount(124500)).toBe("1,24,500");
    expect(formatCount(4)).toBe("4");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders sub-minute timestamps as 'just now' or seconds-ago", () => {
    expect(formatRelativeTime("2026-09-26T12:00:00.000Z")).toBe("just now");
    expect(formatRelativeTime("2026-09-26T11:59:45.000Z")).toBe("15s ago");
  });

  it("renders minutes, hours, and days ago for progressively older timestamps", () => {
    expect(formatRelativeTime("2026-09-26T11:55:00.000Z")).toBe("5m ago");
    expect(formatRelativeTime("2026-09-26T09:00:00.000Z")).toBe("3h ago");
    expect(formatRelativeTime("2026-09-24T12:00:00.000Z")).toBe("2d ago");
  });

  it("falls back to a plain date once it's more than a week old", () => {
    expect(formatRelativeTime("2026-09-01T12:00:00.000Z")).toBe("1 Sept");
  });

  it("falls back to an em dash for an unparseable timestamp", () => {
    expect(formatRelativeTime("not-a-timestamp")).toBe("—");
  });
});
