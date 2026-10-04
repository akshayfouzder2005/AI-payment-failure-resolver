import { describe, expect, it } from "vitest";
import {
  classifyPhase,
  dayKey,
  exportJson,
  filterEntries,
  formatOffset,
  formatTimeMs,
  laneDotClass,
  laneOrder,
  offsetFromStart,
  summarize,
} from "./audit";
import { makeAudit } from "../test/fixtures";

const entries = [
  makeAudit({ id: "1", action: "webhook_received", actor: "system", created_at: "2026-10-03T09:00:00.000Z" }),
  makeAudit({ id: "2", action: "ai_decision_created", actor: "ai_engine", created_at: "2026-10-03T09:00:01.250Z", details: { message: "AI decision created", model_name: "openai/gpt-oss-20b" } }),
  makeAudit({ id: "3", action: "action_approved", actor: "policy_engine", created_at: "2026-10-03T09:00:01.600Z" }),
  makeAudit({ id: "4", action: "action_executed", actor: "executor", created_at: "2026-10-03T09:00:02.900Z", details: { message: "ok", provider_reference: "plink_X" } }),
  makeAudit({ id: "5", action: "something_new", actor: "robot", created_at: "2026-10-03T09:00:03.000Z" }),
];

describe("classifyPhase", () => {
  it("maps known actions to pipeline phases and never guesses for unknown ones", () => {
    expect(classifyPhase("webhook_received")).toBe("Ingest");
    expect(classifyPhase("ai_decision_fallback_used")).toBe("AI");
    expect(classifyPhase("policy_decision_recorded")).toBe("Policy");
    expect(classifyPhase("action_failed")).toBe("Recovery");
    expect(classifyPhase("payment_recovered")).toBe("Result");
    expect(classifyPhase("something_new")).toBe("Other");
  });
});

describe("laneOrder", () => {
  it("orders known actors by pipeline and appends unknown ones", () => {
    expect(laneOrder(entries)).toEqual(["system", "ai_engine", "policy_engine", "executor", "robot"]);
  });
  it("only includes actors actually present", () => {
    expect(laneOrder([entries[1], entries[3]])).toEqual(["ai_engine", "executor"]);
  });
});

describe("filterEntries", () => {
  it("returns everything with no filters", () => {
    expect(filterEntries(entries, { actors: new Set(), query: "" })).toHaveLength(5);
  });
  it("filters by one or more actors", () => {
    expect(filterEntries(entries, { actors: new Set(["ai_engine", "executor"]), query: "" }).map((e) => e.id)).toEqual(["2", "4"]);
  });
  it("searches action, actor and metadata text, case-insensitively", () => {
    expect(filterEntries(entries, { actors: new Set(), query: "GPT-OSS" }).map((e) => e.id)).toEqual(["2"]);
    expect(filterEntries(entries, { actors: new Set(), query: "plink_x" }).map((e) => e.id)).toEqual(["4"]);
    expect(filterEntries(entries, { actors: new Set(), query: "policy_engine" }).map((e) => e.id)).toEqual(["3"]);
  });
  it("combines actor and query filters", () => {
    expect(filterEntries(entries, { actors: new Set(["executor"]), query: "gpt" })).toHaveLength(0);
  });
});

describe("summarize", () => {
  it("measures the real span and counts events per actor", () => {
    const s = summarize(entries);
    expect(s.count).toBe(5);
    expect(s.spanMs).toBe(3000);
    expect(s.actorCounts.find((a) => a.actor === "executor")?.count).toBe(1);
    expect(s.startedAt).toBe("2026-10-03T09:00:00.000Z");
  });
  it("handles an empty trace", () => {
    expect(summarize([])).toEqual({ count: 0, startedAt: null, endedAt: null, spanMs: null, actorCounts: [] });
  });
});

describe("offsets and time formatting", () => {
  it("computes offset from the first event", () => {
    expect(offsetFromStart(entries[1], entries[0].created_at)).toBe(1250);
    expect(offsetFromStart(entries[1], null)).toBeNull();
  });
  it("formats trace offsets", () => {
    expect(formatOffset(0)).toBe("T+0ms");
    expect(formatOffset(412)).toBe("T+412ms");
    expect(formatOffset(1204)).toBe("T+1.204s");
    expect(formatOffset(125_000)).toBe("T+2m 5s");
  });
  it("formats wall-clock time with milliseconds", () => {
    const iso = new Date(2026, 9, 3, 14, 32, 9, 412).toISOString();
    expect(formatTimeMs(iso)).toBe("14:32:09.412");
    expect(formatTimeMs("nope")).toBe("—");
  });
  it("gives distinct day keys across midnight", () => {
    expect(dayKey(new Date(2026, 9, 3, 23, 59).toISOString())).not.toBe(dayKey(new Date(2026, 9, 4, 0, 1).toISOString()));
  });
});

describe("laneDotClass / exportJson", () => {
  it("gives each known actor a distinct colour", () => {
    const classes = ["system", "ai_engine", "policy_engine", "executor", "robot"].map(laneDotClass);
    expect(new Set(classes).size).toBe(5);
  });
  it("exports the events verbatim with the payment id and count", () => {
    const parsed = JSON.parse(exportJson("pay-1", entries));
    expect(parsed.payment_id).toBe("pay-1");
    expect(parsed.event_count).toBe(5);
    expect(parsed.events[1].details.model_name).toBe("openai/gpt-oss-20b");
  });
});
