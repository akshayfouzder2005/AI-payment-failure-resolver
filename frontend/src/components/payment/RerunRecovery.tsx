import { useState } from "react";
import * as api from "../../lib/api";
import { Button } from "../ui/Button";

type State =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "running" }
  | { status: "done"; message: string; replay: boolean }
  | { status: "error"; message: string };

/**
 * Manual re-run of recovery for one AI decision (POST /recovery/execute).
 * It does not bypass anything: the backend re-checks the decision against
 * the policy gate and runs only what policy approves. Because that can send
 * a real email, it asks first and names the address. The backend is
 * idempotent per decision — an already-successful attempt is returned, not
 * repeated — and the result says so when that happens.
 */
export function RerunRecovery({
  recipient,
  onRun,
}: {
  /** the customer contact on file, or null if there is none */
  recipient: string | null;
  /** performs the call and refreshes the page; resolves with the display message */
  onRun: () => Promise<{ message: string; replay: boolean }>;
}) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function confirm() {
    setState({ status: "running" });
    try {
      const result = await onRun();
      setState({ status: "done", ...result });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof api.ApiError ? err.message : "Could not reach the backend.",
      });
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      {state.status === "confirming" ? (
        <div role="alertdialog" aria-label="Confirm re-run recovery" className="rounded-lg border border-border-strong bg-surface p-4">
          <p className="text-sm font-medium text-text">Re-run recovery for this AI decision?</p>
          <p className="mt-1.5 text-body-small text-text-muted">
            The backend re-checks the decision against the policy gate and runs whatever action is approved. If that
            action is “send notification”,{" "}
            {recipient ? (
              <>
                the email goes to <span className="break-all font-medium text-text">{recipient}</span>
              </>
            ) : (
              "there is no customer email or phone on file, so it will fail"
            )}
            . If this decision already has a successful attempt, the backend returns it without repeating it.
          </p>
          <div className="mt-3 flex gap-3">
            <Button variant="primary" onClick={() => void confirm()}>
              Re-run recovery
            </Button>
            <Button variant="quiet" onClick={() => setState({ status: "idle" })}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="secondary" onClick={() => setState({ status: "confirming" })} disabled={state.status === "running"}>
            {state.status === "running" ? "Running…" : "Re-run recovery"}
          </Button>
          <span className="text-body-small text-text-muted">Re-checks policy and runs the approved action.</span>
        </div>
      )}

      {state.status === "done" && (
        <p role="status" className={`mt-3 text-sm ${state.replay ? "text-text-muted" : "text-text"}`}>
          {state.message}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-text">
          {state.message}
        </p>
      )}
    </div>
  );
}
