import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";

/**
 * Always-present entry to Recovery Lab (not just in the empty state), set
 * as a quiet raised panel in the dashboard rail. It links to the real
 * /app/recovery-lab route.
 */
export function QuickDemoEntry() {
  const navigate = useNavigate();

  return (
    <section className="rounded-lg border border-border bg-surface-raised p-5">
      <h2 className="text-sm font-medium text-text">Test the full pipeline with a simulated failure</h2>
      <p className="mt-1.5 text-body-small text-text-muted">
        Recovery Lab runs a real failed payment through AI diagnosis, policy, and recovery.
      </p>
      <Button variant="secondary" onClick={() => navigate("/app/recovery-lab")} className="mt-4">
        Open Recovery Lab
      </Button>
    </section>
  );
}
