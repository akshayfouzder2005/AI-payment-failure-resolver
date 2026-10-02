import { Link } from "react-router-dom";
import { buttonClassName } from "../lib/buttonClassName";
import { StatusChip } from "../components/ui/StatusChip";
import { GradientField } from "../components/ui/GradientField";
import { BackgroundGrid } from "../components/ui/BackgroundGrid";

// Every value below mirrors a real backend enum/field (see types/api.ts) —
// this is an illustration of one example payment's path through the real
// pipeline, not invented UI copy. StatusChip renders the same real status
// strings the authenticated app uses everywhere else.
const DECISION_STAGES = [
  {
    label: "Payment failed",
    detail: "₹2,400.00 · card declined",
    chip: <StatusChip status="failed" />,
  },
  {
    label: "AI diagnosis",
    detail: "root cause: INSUFFICIENT_FUNDS · 68% recovery probability",
    chip: null,
  },
  {
    label: "Policy gate",
    detail: "recommended: SEND_PAYMENT_LINK",
    chip: <StatusChip status="APPROVE" />,
  },
  {
    label: "Recovery action",
    detail: "payment link sent to customer",
    chip: <StatusChip status="success" />,
  },
  {
    label: "Audited result",
    detail: "5 decision + policy + execution events recorded",
    chip: null,
  },
];

const HOW_IT_WORKS = [
  "An AI model recommends a recovery action.",
  "A deterministic policy engine — not the AI — decides whether that action is actually allowed.",
  "Only an approved action is ever executed. The AI never moves money directly.",
];

const LOCAL_DEMO_PROVIDERS = [
  { label: "Mock AI", detail: "No external LLM calls." },
  { label: "Mock payment gateway", detail: "No real Razorpay credentials needed." },
  { label: "Mock notifications", detail: "No real emails or SMS sent." },
];

export function GetStartedPage() {
  return (
    <div className="bg-canvas text-text">
      <section className="relative overflow-hidden">
        <GradientField className="pointer-events-none absolute inset-0 opacity-10" />
        <BackgroundGrid className="pointer-events-none absolute inset-0" />

        <div className="relative mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 lg:flex-row lg:items-center lg:gap-20 lg:py-28">
          {/* LEFT — identity, statement, actions */}
          <div className="w-full lg:max-w-xl">
            <div className="text-sm font-semibold tracking-tight">
              Recover<span className="text-accent">AI</span>
            </div>

            <h1 className="mt-6 text-3xl font-semibold leading-[1.15] tracking-tight sm:text-hero">
              Recover failed payments through an explainable AI decision pipeline.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-text-muted">
              RecoverAI diagnoses payment failures, applies deterministic recovery policy, executes bounded
              actions, and records the complete decision trail.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link to="/register" className={buttonClassName("primary")}>
                Register
              </Link>
              <a href="#local-demo" className={buttonClassName("secondary")}>
                Try local demo
              </a>
              <Link to="/login" className={buttonClassName("quiet")}>
                Log in
              </Link>
            </div>
          </div>

          {/* RIGHT — the decision chain as a real product artifact */}
          <div className="w-full lg:max-w-md lg:flex-1">
            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                <span className="font-mono text-xs text-text-faint">pay_8f21ac4e</span>
                <span className="text-label uppercase text-text-faint">Example recovery</span>
              </div>

              <ol className="space-y-4">
                {DECISION_STAGES.map((stage, i) => (
                  <li key={stage.label} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
                      {i < DECISION_STAGES.length - 1 && (
                        <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-label uppercase text-text-muted">{stage.label}</span>
                        {stage.chip}
                      </div>
                      <p className="mt-1 text-body-small text-text-faint">{stage.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl space-y-14 px-6 py-16">
        <div>
          <h2 className="mb-3 text-subhead text-text">How it works</h2>
          <ol className="space-y-2 text-sm text-text-muted">
            {HOW_IT_WORKS.map((point, i) => (
              <li key={point} className="flex gap-3">
                <span className="text-text-faint">{i + 1}.</span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
        </div>

        <div id="local-demo" className="scroll-mt-10">
          <h2 className="text-subhead text-text">Run the complete recovery pipeline locally</h2>
          <p className="mt-1 text-sm text-text-muted">No external credentials required.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {LOCAL_DEMO_PROVIDERS.map((p) => (
              <div key={p.label} className="rounded border border-border bg-surface px-4 py-3">
                <div className="text-label uppercase text-text-muted">{p.label}</div>
                <p className="mt-1 text-body-small text-text-faint">{p.detail}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-sm text-text-muted">
            Register, open the Recovery Lab, and generate a simulated failed payment.
          </p>
        </div>

        <div>
          <h2 className="mb-1 text-subhead text-text">Auditability</h2>
          <p className="text-sm text-text-muted">
            Every AI decision, policy verdict, and recovery attempt is permanently recorded and independently
            viewable.
          </p>
        </div>
      </section>
    </div>
  );
}
