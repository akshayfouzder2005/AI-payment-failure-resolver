import { describe, expect, it } from "vitest";
import { barGeometry, deriveTrace, summarizeOutcome } from "./trace";
import { buildRuns } from "./investigation";
import type { PipelineSnapshot } from "./pipelineTracker";
import { makeAttempt, makeAudit, makeDecision, makeIngest, makePayment } from "../test/fixtures";

function snapshot(partial: Partial<PipelineSnapshot> & Pick<PipelineSnapshot, "decisions" | "attempts">): PipelineSnapshot {
  const audit = partial.audit ?? [];
  const runs = buildRuns(partial.decisions, partial.attempts);
  return {
    payment: makePayment({ status: "failed" }),
    audit,
    runs,
    settled: false,
    stopped: false,
    timedOut: false,
    error: null,
    reads: 1,
    ...partial,
  };
}

const stage = (trace: ReturnType<typeof deriveTrace>, key: string) => trace.stages.find((s) => s.key === key)!;

describe("deriveTrace", () => {
  it("has the seven stages in order", () => {
    expect(deriveTrace(null, null).stages.map((s) => s.key)).toEqual(["event", "payment", "ai", "policy", "recovery", "result", "audit"]);
  });

  it("before anything is sent, nothing is complete and there is no time window", () => {
    const trace = deriveTrace(null, null);
    expect(trace.stages.filter((s) => s.phase === "done")).toHaveLength(0);
    expect(trace.window).toBeNull();
  });

  it("marks the event ingested and the rest waiting right after a processed ingest, before any read", () => {
    const trace = deriveTrace(makeIngest(), null);
    expect(stage(trace, "event").phase).toBe("done");
    expect(stage(trace, "payment").phase).toBe("running");
    expect(stage(trace, "ai").phase).toBe("idle");
  });

  it("fills stages in as the real records appear, with AI running first", () => {
    const early = deriveTrace(makeIngest(), snapshot({ decisions: [], attempts: [] }));
    expect(stage(early, "payment").phase).toBe("done");
    expect(stage(early, "ai").phase).toBe("running");
    expect(stage(early, "policy").phase).toBe("waiting");
    expect(stage(early, "result").phase).toBe("waiting");

    const mid = deriveTrace(makeIngest(), snapshot({ decisions: [makeDecision()], attempts: [makeAttempt({ status: "in_progress" })] }));
    expect(stage(mid, "ai").phase).toBe("done");
    expect(stage(mid, "policy").phase).toBe("done");
    expect(stage(mid, "recovery").phase).toBe("running");
    expect(stage(mid, "result").phase).toBe("waiting");
    expect(stage(mid, "audit").stateLabel).toBe("Empty");
  });

  it("only shows a result once the run has actually settled", () => {
    const settled = deriveTrace(
      makeIngest(),
      snapshot({ decisions: [makeDecision()], attempts: [makeAttempt()], settled: true, payment: makePayment({ status: "retry_scheduled" }), audit: [makeAudit(), makeAudit({ id: "2", created_at: "2026-10-03T09:00:03Z" })] }),
    );
    expect(stage(settled, "result").phase).toBe("done");
    expect(stage(settled, "result").stateLabel).toBe("Retry scheduled");
    expect(stage(settled, "audit").stateLabel).toBe("Recorded");
    expect(stage(settled, "audit").headline).toBe("2 events recorded");
  });

  it("reports an unprocessed event as such and runs nothing after it", () => {
    const trace = deriveTrace(makeIngest({ status: "duplicate", payment_id: null, detail: "Already seen" }), null);
    expect(stage(trace, "event").stateLabel).toBe("Duplicate");
    expect(stage(trace, "event").tone).toBe("warning");
    expect(stage(trace, "payment").phase).toBe("idle");
    expect(stage(trace, "ai").phase).toBe("idle");
  });

  it("shows a stopped pipeline as stopped, with the result carrying the backend's stop", () => {
    const trace = deriveTrace(
      makeIngest(),
      snapshot({ decisions: [], attempts: [], stopped: true, settled: true, audit: [makeAudit({ action: "processing_stopped" })] }),
    );
    expect(stage(trace, "ai").phase).toBe("stopped");
    expect(stage(trace, "result").detail).toMatch(/stopped/);
  });

  it("gives a stage a bar only where the backend recorded timestamps for it", () => {
    const trace = deriveTrace(
      makeIngest(),
      snapshot({
        decisions: [makeDecision({ created_at: "2026-10-03T09:00:01.000Z" })],
        attempts: [makeAttempt({ created_at: "2026-10-03T09:00:01.500Z", started_at: "2026-10-03T09:00:02.000Z", completed_at: "2026-10-03T09:00:02.800Z" })],
        settled: true,
        audit: [makeAudit({ action: "ai_analysis_started", created_at: "2026-10-03T09:00:00.300Z" })],
      }),
    );
    expect(stage(trace, "ai").bar).not.toBeNull();
    expect(stage(trace, "recovery").bar).toEqual({ startMs: new Date("2026-10-03T09:00:02.000Z").getTime(), endMs: new Date("2026-10-03T09:00:02.800Z").getTime() });
    expect(trace.window).not.toBeNull();
    expect(trace.window!.endMs).toBeGreaterThan(trace.window!.startMs);

    const none = deriveTrace(null, null);
    expect(none.stages.every((s) => s.bar === null)).toBe(true);
  });

  it("marks only the AI stage advisory", () => {
    const trace = deriveTrace(makeIngest(), snapshot({ decisions: [makeDecision()], attempts: [makeAttempt()], settled: true }));
    expect(trace.stages.filter((s) => s.kind === "advisory").map((s) => s.key)).toEqual(["ai"]);
  });
});

describe("barGeometry", () => {
  const window = { startMs: 1000, endMs: 3000 };
  it("positions a bar proportionally inside the window", () => {
    expect(barGeometry({ startMs: 1000, endMs: 2000 }, window)).toEqual({ left: 0, width: 50 });
    expect(barGeometry({ startMs: 2000, endMs: 3000 }, window)).toEqual({ left: 50, width: 50 });
  });
  it("keeps a zero-length bar visible and inside the track", () => {
    const g = barGeometry({ startMs: 3000, endMs: 3000 }, window);
    expect(g.width).toBeGreaterThan(0);
    expect(g.left + g.width).toBeLessThanOrEqual(100);
  });
  it("survives a zero-width window", () => {
    expect(() => barGeometry({ startMs: 5, endMs: 5 }, { startMs: 5, endMs: 5 })).not.toThrow();
  });
});

describe("summarizeOutcome", () => {
  it("reads verdict, action and payment status from the settled snapshot", () => {
    const s = snapshot({
      decisions: [makeDecision()],
      attempts: [makeAttempt({ action_type: "SEND_PAYMENT_LINK", policy_decision: "MODIFY" })],
      settled: true,
      payment: makePayment({ status: "retry_scheduled" }),
    });
    expect(summarizeOutcome(s)).toEqual({ verdict: "Modified", action: "send payment link", status: "Retry scheduled", stopped: false });
  });
});
