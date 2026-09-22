import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

const CHAIN_STEPS = ["Payment failed", "AI diagnosis", "Policy gate", "Recovery action", "Audited result"];

const ENGINEERING_LINKS = [
  { label: "Architecture", href: "#" },
  { label: "AI decision pipeline", href: "#" },
  { label: "Provider integrations", href: "#" },
  { label: "Testing", href: "#" },
  { label: "GitHub / README", href: "#" },
];

export function GetStartedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16 text-text">
      <div className="w-full max-w-2xl">
        <div className="mb-1 text-sm font-semibold tracking-tight">
          Recover<span className="text-accent">AI</span>
        </div>

        <h1 className="mt-6 text-heading">Recover failed payments through an explainable AI decision pipeline.</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          RecoverAI diagnoses payment failures, applies deterministic recovery policy, executes bounded actions,
          and records the complete decision trail.
        </p>

        <div className="my-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-text-muted">
          {CHAIN_STEPS.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <span className="rounded border border-border px-2 py-1 font-mono uppercase tracking-wide">
                {step}
              </span>
              {i < CHAIN_STEPS.length - 1 && <span className="text-text-faint">→</span>}
            </span>
          ))}
        </div>

        <div className="flex gap-3">
          <Link to="/register">
            <Button variant="primary">Register</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary">Log in</Button>
          </Link>
        </div>

        <div className="mt-12 space-y-6 border-t border-border pt-8 text-sm text-text-muted">
          <div>
            <h2 className="mb-1 text-subhead text-text">How it works</h2>
            <p>
              An AI model recommends a recovery action. A deterministic policy engine — not the AI — decides
              whether that action is actually allowed. Only an approved action is ever executed; the AI never
              moves money directly.
            </p>
          </div>
          <div>
            <h2 className="mb-1 text-subhead text-text">Run a local demo</h2>
            <p>
              The repository ships in Local Demo Mode — mock AI and mock gateway/notification providers — so
              the entire pipeline runs with zero external credentials. Register, open the Recovery Lab, and
              generate a simulated failed payment.
            </p>
          </div>
          <div>
            <h2 className="mb-1 text-subhead text-text">Auditability</h2>
            <p>
              Every AI decision, policy verdict, and recovery attempt is permanently recorded and independently
              viewable — not summarized after the fact, reconstructed from the same rows the system itself
              acted on.
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <h2 className="mb-2 text-label uppercase text-text-faint">Explore the engineering</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {ENGINEERING_LINKS.map((link) => (
              <a key={link.label} href={link.href} className="focus-ring text-text-muted hover:text-accent">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
