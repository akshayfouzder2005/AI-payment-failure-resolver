import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";

/**
 * Design spec §12-F: "a single quiet panel linking to Recovery Lab ...
 * always present, not just in the empty state." Recovery Lab itself
 * isn't built until Phase 7 — this links to the real route already
 * wired in App.tsx, which currently renders its own placeholder.
 */
export function QuickDemoEntry() {
  const navigate = useNavigate();

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4">
      <div>
        <h2 className="text-sm font-medium text-text">Test the full pipeline with a simulated failure</h2>
        <p className="mt-1 text-body-small text-text-muted">
          Recovery Lab runs a real failed payment through AI diagnosis, policy, and recovery.
        </p>
      </div>
      <Button variant="secondary" onClick={() => navigate("/app/recovery-lab")}>
        Open Recovery Lab
      </Button>
    </section>
  );
}
