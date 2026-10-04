import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { isSettled, trackPipeline, type PipelineSnapshot } from "./pipelineTracker";
import { buildRuns } from "./investigation";
import { PAYMENT_ID, makeAttempt, makeAudit, makeDecision, makePayment } from "../test/fixtures";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, getPayment: vi.fn(), listAIDecisions: vi.fn(), listRecoveryAttempts: vi.fn(), getPaymentAuditTimeline: vi.fn() };
});

function stubReads(opts: { decisions?: unknown[]; attempts?: unknown[]; audit?: unknown[] }) {
  vi.mocked(api.getPayment).mockResolvedValue(makePayment());
  vi.mocked(api.listAIDecisions).mockResolvedValue((opts.decisions ?? []) as never);
  vi.mocked(api.listRecoveryAttempts).mockResolvedValue((opts.attempts ?? []) as never);
  vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue((opts.audit ?? []) as never);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("isSettled", () => {
  it("is false with no attempt, true for each terminal attempt status, false while executing", () => {
    expect(isSettled([], [])).toBe(false);
    expect(isSettled(buildRuns([makeDecision()], []), [])).toBe(false);
    for (const status of ["success", "failed", "skipped"] as const) {
      expect(isSettled(buildRuns([makeDecision()], [makeAttempt({ status })]), [])).toBe(true);
    }
    for (const status of ["pending", "in_progress"] as const) {
      expect(isSettled(buildRuns([makeDecision()], [makeAttempt({ status })]), [])).toBe(false);
    }
  });

  it("is true once the backend logged processing_stopped", () => {
    expect(isSettled([], [makeAudit({ action: "processing_stopped" })])).toBe(true);
  });
});

describe("trackPipeline", () => {
  it("polls the real endpoints until an attempt is terminal, emitting every snapshot", async () => {
    // read 1: nothing; read 2: decision only; read 3: executing; read 4: success
    const d = makeDecision();
    vi.mocked(api.getPayment).mockResolvedValue(makePayment());
    vi.mocked(api.listAIDecisions)
      .mockResolvedValueOnce([])
      .mockResolvedValue([d]);
    vi.mocked(api.listRecoveryAttempts)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeAttempt({ status: "in_progress" })])
      .mockResolvedValue([makeAttempt({ status: "success" })]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([]);

    const seen: PipelineSnapshot[] = [];
    const final = await trackPipeline(PAYMENT_ID, { intervalMs: 1, onSnapshot: (s) => seen.push(s) });

    expect(seen.map((s) => s.settled)).toEqual([false, false, false, true]);
    expect(seen.map((s) => s.runs.length)).toEqual([0, 1, 1, 1]);
    expect(final.reads).toBe(4);
    expect(final.settled).toBe(true);
    expect(final.timedOut).toBe(false);
    expect(api.getPayment).toHaveBeenCalledTimes(4);
  });

  it("stops on processing_stopped and reports it, rather than polling forever", async () => {
    stubReads({ audit: [makeAudit({ action: "processing_stopped", details: { message: "boom" } })] });
    const final = await trackPipeline(PAYMENT_ID, { intervalMs: 1, onSnapshot: () => undefined });
    expect(final.stopped).toBe(true);
    expect(final.settled).toBe(true);
    expect(final.reads).toBe(1);
  });

  it("times out honestly when the backend never settles", async () => {
    stubReads({ decisions: [makeDecision()] });
    let clock = 0;
    const final = await trackPipeline(PAYMENT_ID, {
      intervalMs: 1,
      timeoutMs: 50,
      now: () => (clock += 20),
      onSnapshot: () => undefined,
    });
    expect(final.timedOut).toBe(true);
    expect(final.settled).toBe(false);
  });

  it("keeps the last good data and reports the error when one read fails, then recovers", async () => {
    vi.mocked(api.getPayment).mockResolvedValue(makePayment());
    vi.mocked(api.listAIDecisions).mockResolvedValue([makeDecision()]);
    vi.mocked(api.listRecoveryAttempts)
      .mockResolvedValueOnce([makeAttempt({ status: "in_progress" })])
      .mockRejectedValueOnce(new api.ApiError(500, "flaky"))
      .mockResolvedValue([makeAttempt({ status: "success" })]);
    vi.mocked(api.getPaymentAuditTimeline).mockResolvedValue([]);

    const seen: PipelineSnapshot[] = [];
    await trackPipeline(PAYMENT_ID, { intervalMs: 1, onSnapshot: (s) => seen.push(s) });

    expect(seen[1].error).toBe("flaky");
    expect(seen[1].attempts[0].status).toBe("in_progress"); // previous attempts retained
    expect(seen[1].settled).toBe(false); // a failed read can never count as settled
    expect(seen[2].error).toBeNull();
    expect(seen[2].settled).toBe(true);
  });

  it("stops promptly when aborted", async () => {
    stubReads({ decisions: [makeDecision()] });
    const controller = new AbortController();
    let count = 0;
    await trackPipeline(PAYMENT_ID, {
      intervalMs: 5,
      signal: controller.signal,
      onSnapshot: () => {
        if (++count === 2) controller.abort();
      },
    });
    expect(count).toBe(2);
  });
});
