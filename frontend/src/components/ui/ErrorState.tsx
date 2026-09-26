import { Button } from "./Button";

/**
 * Shared inline error state — the real backend error message where
 * available, a retry action, never a silent fallback that implies
 * success (design spec §24). Used anywhere a server-driven page's fetch
 * fails outright, not for partial/degraded data.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 px-6 py-8 text-center">
      <p className="text-sm text-danger">{message}</p>
      <Button variant="secondary" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}
