import { Link } from "react-router-dom";
import { DEMO_SCENARIOS, type DemoScenario } from "../../lib/simulation";
import type { OutcomeSummary } from "../../lib/trace";
import { Button } from "../ui/Button";
import { ToneChip } from "../ui/ToneChip";

export type DemoItemStatus = "queued" | "simulating" | "tracking" | "done" | "failed" | "stopped";

export interface DemoItem {
  scenario: DemoScenario;
  status: DemoItemStatus;
  paymentId: string | null;
  outcome: OutcomeSummary | null;
  error: string | null;
}

const STATUS_CHIP: Record<DemoItemStatus, { label: string; tone: "muted" | "info" | "success" | "danger" | "warning" }> = {
  queued: { label: "Queued", tone: "muted" },
  simulating: { label: "Sending", tone: "info" },
  tracking: { label: "Tracking", tone: "info" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  stopped: { label: "Stopped", tone: "warning" },
};

/**
 * Runs the nine fixed scenarios one after another against the real
 * simulation endpoint, waiting for each payment's pipeline to settle before
 * sending the next (the repeat-customer scenarios depend on that order). Row
 * states and outcomes come from the real responses; the progress count is
 * the number of scenarios whose pipeline has actually settled.
 */
export function DemoWorkspace({
  items,
  running,
  disabled,
  recipient,
  recipientError,
  notificationsLive,
  onRecipientChange,
  onRun,
  onStop,
}: {
  items: DemoItem[] | null;
  running: boolean;
  disabled: boolean;
  recipient: string;
  recipientError: string | null;
  notificationsLive: boolean;
  onRecipientChange: (value: string) => void;
  onRun: () => void;
  onStop: () => void;
}) {
  const list: DemoItem[] =
    items ??
    DEMO_SCENARIOS.map((scenario) => ({ scenario, status: "queued", paymentId: null, outcome: null, error: null }));
  const settled = list.filter((item) => item.status === "done").length;

  return (
    <section aria-labelledby="demo-title" className="rounded-lg border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="demo-title" className="text-subhead text-text">
            Demo workspace
          </h2>
          <p className="mt-1 max-w-sm text-body-small text-text-muted">
            Runs {DEMO_SCENARIOS.length} fixed failure scenarios through the live pipeline, in order, and waits for each
            to finish.
          </p>
        </div>
        {running ? (
          <Button variant="secondary" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" onClick={onRun} disabled={disabled || !!recipientError}>
            {items && settled > 0 ? "Run again" : "Load demo workspace"}
          </Button>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="demo-recipient" className="mb-1.5 block text-label uppercase text-text-muted">
          Send demo emails to {notificationsLive ? "" : "(optional)"}
        </label>
        <input
          id="demo-recipient"
          type="email"
          value={recipient}
          disabled={running}
          onChange={(event) => onRecipientChange(event.target.value)}
          placeholder="you@yourdomain.com"
          aria-invalid={!!recipientError}
          aria-describedby="demo-recipient-hint"
          className={`focus-ring w-full rounded border bg-surface-raised px-3 py-2 text-sm text-text transition-colors duration-150 placeholder:text-text-faint disabled:opacity-60 ${
            recipientError ? "border-danger" : "border-border hover:border-border-strong"
          }`}
        />
        <p id="demo-recipient-hint" className={`mt-1.5 text-body-small ${recipientError ? "text-danger" : "text-text-muted"}`} role={recipientError ? "alert" : undefined}>
          {recipientError ??
            (notificationsLive
              ? "Scenarios whose pipeline sends a customer email use plus-addressed variants of this address (you+tag@…), so they land in your mailbox on Gmail, Outlook and most providers."
              : "Notifications are mocked here, so nothing is delivered. Leave blank to use safe @example.com addresses.")}
        </p>
      </div>

      {items && (
        <p className="mt-3 text-body-small tabular-nums text-text-muted" role="status">
          {settled} of {list.length} settled
        </p>
      )}

      <ol className="mt-4 divide-y divide-border border-y border-border">
        {list.map((item) => {
          const chip = STATUS_CHIP[item.status];
          return (
            <li key={item.scenario.id} data-scenario={item.scenario.id} data-status={item.status} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-text">{item.scenario.title}</div>
                <div className="truncate text-body-small text-text-muted">
                  {item.outcome
                    ? [item.outcome.verdict, item.outcome.action, item.outcome.status].filter(Boolean).join(" · ")
                    : item.error ?? item.scenario.exercises}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {item.paymentId && (
                  <Link
                    to={`/app/payments/${item.paymentId}`}
                    className="focus-ring rounded text-body-small text-text-muted underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:text-text"
                  >
                    Open
                  </Link>
                )}
                <ToneChip tone={chip.tone} label={chip.label} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
