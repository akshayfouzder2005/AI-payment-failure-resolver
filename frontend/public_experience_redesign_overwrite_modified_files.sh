#!/usr/bin/env bash
# public_experience_redesign_overwrite_modified_files.sh
# RecoverAI public experience redesign (/get-started, /login, /register).
# Builds on top of the design-system-v2 foundation pass -- apply that
# first if you haven't already. Overwrites EXISTING files in place.
# Run from the repository's frontend/ directory, after
# public_experience_redesign_create_new_files.sh.
set -euo pipefail

mkdir -p "."
cat > "tailwind.config.js" << 'RECOVERAI_EOF'
/** @type {import('tailwindcss').Config} */

// Every color token resolves through a CSS custom property holding
// space-separated RGB channels (e.g. "11 12 14"), never a literal hex
// string. That's what lets `[data-theme="light"]` in index.css redefine
// the same variable names to different values and have every existing
// `bg-canvas` / `text-text-muted` / etc. utility repaint automatically —
// zero className changes anywhere else in the app. The space-separated
// format (rather than a plain `var(--x)` hex reference) is required for
// Tailwind's opacity modifiers (`bg-danger/10`, `bg-success/15`, …) to
// keep working, since Tailwind needs the raw channels to combine with an
// alpha value at class-generation time — see Tailwind's own "Using CSS
// variables for colors" docs. Full light/dark values live in index.css.
function withOpacity(variableName) {
  return ({ opacityValue }) =>
    opacityValue === undefined ? `rgb(var(${variableName}))` : `rgb(var(${variableName}) / ${opacityValue})`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // --- RecoverAI Financial Instrumentation color tokens (design system v2) ---
      // Token names are unchanged from Quiet Instrumentation on purpose —
      // this is a value-source change (hex -> theme-aware CSS variable),
      // not a renaming, so no existing component needed to change.
      colors: {
        canvas: withOpacity("--color-canvas"),
        surface: withOpacity("--color-surface"),
        "surface-raised": withOpacity("--color-surface-raised"),
        border: {
          DEFAULT: withOpacity("--color-border"),
          strong: withOpacity("--color-border-strong"),
        },
        text: {
          DEFAULT: withOpacity("--color-text"),
          muted: withOpacity("--color-text-muted"),
          faint: withOpacity("--color-text-faint"),
        },
        accent: {
          DEFAULT: withOpacity("--color-accent"),
        },
        // Text/icon color guaranteed to read correctly on top of a
        // bg-accent fill in either theme (see Button's primary variant).
        // Deliberately its own token rather than reusing `canvas` — the
        // old dark-only build got away with `text-canvas` on `bg-accent`
        // because canvas happened to be near-black, but canvas is the
        // *lightest* neutral in light mode, which would have put
        // near-white text on an amber button. That coupling breaks the
        // moment a second theme exists, so it gets a dedicated token.
        "on-accent": withOpacity("--color-on-accent"),
        success: withOpacity("--color-success"),
        warning: withOpacity("--color-warning"),
        danger: withOpacity("--color-danger"),
        info: withOpacity("--color-info"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        hero: ["3rem", { lineHeight: "1.08", letterSpacing: "-0.015em", fontWeight: "600" }],
        display: ["2.75rem", { lineHeight: "1.1", letterSpacing: "-0.01em", fontWeight: "600" }],
        heading: ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
        subhead: ["0.9375rem", { lineHeight: "1.4", letterSpacing: "0.01em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-small": ["0.8125rem", { lineHeight: "1.5", fontWeight: "400" }],
        label: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.08em", fontWeight: "600" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "8px",
      },
      boxShadow: {
        overlay: "0 2px 8px rgba(0, 0, 0, 0.35)",
      },
      spacing: {
        18: "4.5rem",
      },
      transitionDuration: {
        150: "150ms",
        200: "200ms",
        400: "400ms",
      },
    },
  },
  plugins: [],
};
RECOVERAI_EOF

mkdir -p "src/components/ui"
cat > "src/components/ui/Button.tsx" << 'RECOVERAI_EOF'
import type { ButtonHTMLAttributes } from "react";
import { buttonClassName, type ButtonVariant } from "../../lib/buttonClassName";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}
RECOVERAI_EOF

mkdir -p "src/components/ui"
cat > "src/components/ui/Input.tsx" << 'RECOVERAI_EOF'
import { useId, type InputHTMLAttributes } from "react";

/**
 * Input system — the label/input/hint structure Login and Register each
 * hand-duplicated identically. Same classes, same markup shape as
 * before; this is an extraction, not a redesign, so existing pages don't
 * change visually by adopting it. `wrapperClassName` exists solely so a
 * form's last field can keep the extra `mb-6` breathing room before its
 * submit button that both pages already had — `className` itself stays
 * scoped to the `<input>` element, matching InputHTMLAttributes.
 *
 * Label and input are explicitly associated via htmlFor/id rather than
 * implicit wrapping, and the hint is wired up via aria-describedby
 * instead of living inside the label: nesting the hint inside an
 * implicit `<label>...</label>` wrapper makes its text part of the
 * control's computed accessible name (e.g. "Password At least 8
 * characters." instead of "Password"), which silently breaks
 * getByLabelText("Password") — caught by RegisterPage's password hint.
 */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  wrapperClassName?: string;
}

export function Input({ label, hint, wrapperClassName = "mb-3", className = "", id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className={wrapperClassName}>
      <label htmlFor={inputId} className="mb-1 block text-sm text-text-muted">
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={hintId}
        className={`focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none ${className}`}
        {...props}
      />
      {hint && (
        <span id={hintId} className="mt-1 block text-xs text-text-faint">
          {hint}
        </span>
      )}
    </div>
  );
}
RECOVERAI_EOF

mkdir -p "src/pages"
cat > "src/pages/GetStartedPage.tsx" << 'RECOVERAI_EOF'
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
RECOVERAI_EOF

mkdir -p "src/pages"
cat > "src/pages/LoginPage.tsx" << 'RECOVERAI_EOF'
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { GradientField } from "../components/ui/GradientField";
import { BackgroundGrid } from "../components/ui/BackgroundGrid";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-text">
      <GradientField className="pointer-events-none absolute inset-0 opacity-5" />
      <BackgroundGrid className="pointer-events-none absolute inset-0" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-sm font-semibold tracking-tight">
            Recover<span className="text-accent">AI</span>
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface-raised p-8">
            <h1 className="text-display">Log in</h1>
            <p className="mt-2 text-sm text-text-muted">Sign in to your RecoverAI merchant account.</p>

            {error && (
              <div role="alert" className="mt-6 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="mt-6">
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                wrapperClassName="mb-6"
              />
            </div>

            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              {submitting ? "Logging in…" : "Log in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            No account?{" "}
            <Link to="/register" className="focus-ring text-accent">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
RECOVERAI_EOF

mkdir -p "src/pages"
cat > "src/pages/RegisterPage.tsx" << 'RECOVERAI_EOF'
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { GradientField } from "../components/ui/GradientField";
import { BackgroundGrid } from "../components/ui/BackgroundGrid";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({ name, email, password, merchant_name: merchantName });
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-text">
      <GradientField className="pointer-events-none absolute inset-0 opacity-5" />
      <BackgroundGrid className="pointer-events-none absolute inset-0" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-sm font-semibold tracking-tight">
            Recover<span className="text-accent">AI</span>
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface-raised p-8">
            <h1 className="text-display">Register</h1>
            <p className="mt-2 text-sm text-text-muted">Create a merchant account to run the recovery pipeline.</p>

            {error && (
              <div role="alert" className="mt-6 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="mt-6">
              <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />

              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="At least 8 characters."
              />

              <Input
                label="Merchant name"
                required
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                wrapperClassName="mb-6"
              />
            </div>

            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              {submitting ? "Creating account…" : "Register"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            Already have an account?{" "}
            <Link to="/login" className="focus-ring text-accent">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
RECOVERAI_EOF

echo "Overwrote 6 modified files."
