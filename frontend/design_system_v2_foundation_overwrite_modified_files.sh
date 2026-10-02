#!/usr/bin/env bash
# design_system_v2_foundation_overwrite_modified_files.sh
# RecoverAI Financial Instrumentation design system v2 -- visual foundation pass.
# Overwrites EXISTING files in place. Run from the repository's frontend/ directory,
# after design_system_v2_foundation_create_new_files.sh.
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

mkdir -p "."
cat > "index.html" << 'RECOVERAI_EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>frontend</title>
    <script>
      // Sets data-theme before first paint so there's no flash of the
      // wrong theme while React hydrates. Duplicates lib/theme.ts's key
      // and default on purpose — this runs before any module loads, so
      // it can't import that file. Keep the two in sync by hand.
      (function () {
        var stored = localStorage.getItem("recoverai_theme");
        var theme = stored === "light" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", theme);
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
RECOVERAI_EOF

mkdir -p "src"
cat > "src/index.css" << 'RECOVERAI_EOF'
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/jetbrains-mono/400.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* --- Theme tokens (RecoverAI Financial Instrumentation design system v2) ---
     Every value here is three space-separated RGB channels, not a hex
     string — see tailwind.config.js's withOpacity() for why. Dark is the
     default (:root) because that's the app's existing, already-shipped
     look; [data-theme="light"] only ever *overrides* these same variable
     names, so no component anywhere needs a dark:/light: variant. The
     current theme is applied by ThemeContext setting data-theme on
     <html> (see index.html's inline bootstrap script for the
     no-flash-on-load version of the same logic). */
  :root {
    --color-canvas: 11 12 14; /* #0B0C0E */
    --color-surface: 19 20 23; /* #131417 */
    --color-surface-raised: 25 27 31; /* #191B1F */
    --color-border: 38 40 45; /* #26282D */
    --color-border-strong: 58 61 68; /* #3A3D44 */
    --color-text: 242 239 233; /* #F2EFE9 */
    --color-text-muted: 154 150 140; /* #9A968C */
    --color-text-faint: 101 98 91; /* #65625B */
    --color-accent: 201 151 63; /* #C9973F */
    --color-on-accent: 20 17 11; /* #14110B */
    --color-success: 95 165 121; /* #5FA579 */
    --color-warning: 201 151 63; /* #C9973F — same hue as accent, by design */
    --color-danger: 196 84 75; /* #C4544B */
    --color-info: 110 140 160; /* #6E8CA0 */

    /* Amber Drift — the one proprietary gradient in the system (design
       system v2 §6). Public-surface decoration only: GradientField is the
       only consumer, and it is not yet wired into any page this phase —
       that composition work belongs to the next visual phase. Never used
       as a token inside the authenticated product. */
    --gradient-amber-drift-1: #d98c3f;
    --gradient-amber-drift-2: #c2573d;
    --gradient-amber-drift-3: #6b4a9e;

    color-scheme: dark;
  }

  [data-theme="light"] {
    --color-canvas: 242 239 234; /* #F2EFEA */
    --color-surface: 250 248 245; /* #FAF8F5 */
    --color-surface-raised: 255 255 255; /* #FFFFFF */
    --color-border: 228 224 217; /* #E4E0D9 */
    --color-border-strong: 199 192 180; /* #C7C0B4 */
    --color-text: 30 27 23; /* #1E1B17 */
    --color-text-muted: 107 102 93; /* #6B665D */
    --color-text-faint: 143 137 125; /* #8F897D */
    --color-accent: 138 82 24; /* #8A5218 — darker than dark mode's accent: this
      value does double duty as both a filled dot/border color and as
      running text color (nav links, "Register"/"Log in" links), so it has
      to clear 4.5:1 on a light surface, not just look right as a swatch */
    --color-on-accent: 255 255 255; /* #FFFFFF */
    --color-success: 30 122 76; /* #1E7A4C */
    --color-warning: 138 82 24; /* #8A5218 */
    --color-danger: 166 56 44; /* #A6382C */
    --color-info: 58 90 160; /* #3A5AA0 */

    color-scheme: light;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-canvas text-text font-sans antialiased;
  }

  /* Tabular numerals everywhere a figure appears — money and counts must
     not jitter in aligned columns. */
  .tabular-nums,
  table {
    font-variant-numeric: tabular-nums;
  }

  /* Purposeful motion only (design spec, Motion System): collapse every
     transition to an instant state change when the user asks for it. */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

@layer components {
  /* Visible keyboard focus ring, per Accessibility Behavior in the spec */
  .focus-ring {
    @apply outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas;
  }

  /* Mobile nav drawer entrance — the one motion instance that narrates a
     real state transition (closed → open), per the Motion System. */
  @keyframes drawer-in {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }
  .animate-drawer-in {
    animation: drawer-in 200ms ease-out;
  }

  /* Grid/background system (design system v2 §7). A near-subliminal
     vertical rule grid for public marketing surfaces only — never used
     inside the authenticated app, which relies on real borders for
     structure instead. Not wired into any page yet; ready for the next
     visual phase. Deliberately faint: `border` at low opacity, a fixed
     column width, no color of its own. */
  .bg-grid-faint {
    background-image: repeating-linear-gradient(
      to right,
      rgb(var(--color-border) / 0.4) 0,
      rgb(var(--color-border) / 0.4) 1px,
      transparent 1px,
      transparent 160px
    );
  }

  /* Gradient system (design system v2 §6) — "Amber Drift", the one
     proprietary gradient in the product. Public-surface decoration only
     (Get Started / auth backgrounds); never a button, card, or text
     fill, and never used inside the authenticated app. Not wired into
     any page yet; ready for the next visual phase. */
  .bg-gradient-amber-drift {
    background-image: linear-gradient(
      135deg,
      var(--gradient-amber-drift-1) 0%,
      var(--gradient-amber-drift-2) 50%,
      var(--gradient-amber-drift-3) 100%
    );
  }
}
RECOVERAI_EOF

mkdir -p "src"
cat > "src/App.tsx" << 'RECOVERAI_EOF'
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AppShell } from "./components/shell/AppShell";
import { ProtectedRoute } from "./components/shell/ProtectedRoute";
import { GetStartedPage } from "./pages/GetStartedPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { PaymentDetailPage } from "./pages/PaymentDetailPage";
import { RecoveryLabPage } from "./pages/RecoveryLabPage";
import { AuditPage } from "./pages/AuditPage";
import { AccountPage } from "./pages/AccountPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/get-started" replace />} />
          <Route path="/get-started" element={<GetStartedPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="payments/:paymentId" element={<PaymentDetailPage />} />
            <Route path="recovery-lab" element={<RecoveryLabPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/get-started" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
RECOVERAI_EOF

mkdir -p "src/components/ui"
cat > "src/components/ui/Button.tsx" << 'RECOVERAI_EOF'
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  // text-on-accent, not text-canvas: canvas is the darkest neutral in
  // dark mode but the lightest in light mode, so it can't double as
  // "whatever contrasts against the accent fill" once a second theme
  // exists — see tailwind.config.js's on-accent token comment.
  primary: "bg-accent text-on-accent hover:bg-accent/90",
  secondary: "border border-border text-text hover:border-border-strong",
  quiet: "text-text-muted hover:text-text",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
RECOVERAI_EOF

mkdir -p "src/components/shell"
cat > "src/components/shell/TopBar.tsx" << 'RECOVERAI_EOF'
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { ThemeToggle } from "../ui/ThemeToggle";
import type { HealthResponse } from "../../types/api";

type CheckState = "checking" | "ok" | "down";

/**
 * Real health/environment signal only — see design spec correction pass,
 * §1/§8. Never a hardcoded "All systems operational". The API and DB checks
 * are independent: one failing must never hide or override the other's
 * result, and the spec explicitly asks for two dots when they diverge.
 */
export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [apiState, setApiState] = useState<CheckState>("checking");
  const [dbState, setDbState] = useState<CheckState>("checking");
  const [providersOpen, setProvidersOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    function check() {
      api
        .getHealth()
        .then((result) => {
          if (cancelled) return;
          setHealth(result);
          setApiState("ok");
        })
        .catch(() => {
          if (!cancelled) setApiState("down");
        });

      api
        .getHealthDb()
        .then(() => {
          if (!cancelled) setDbState("ok");
        })
        .catch(() => {
          if (!cancelled) setDbState("down");
        });
    }

    check();
    const interval = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setProvidersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  const bothResolved = apiState !== "checking" && dbState !== "checking";
  const bothOk = apiState === "ok" && dbState === "ok";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-canvas px-5 md:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="focus-ring -ml-1 rounded p-1 text-text-muted hover:text-text md:hidden"
        >
          <span className="block h-2.5 w-4 border-y border-current" aria-hidden="true" />
        </button>

        <span className="text-sm font-semibold tracking-tight md:hidden">
          Recover<span className="text-accent">AI</span>
        </span>

        {health && (
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setProvidersOpen((open) => !open)}
              className="focus-ring rounded px-2 py-1 text-label uppercase text-text-muted transition-colors duration-150 hover:text-text"
            >
              {health.environment}
            </button>
            {providersOpen && (
              <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-lg border border-border bg-surface-raised p-3 shadow-overlay">
                <div className="mb-2 text-label uppercase text-text-faint">Providers</div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Razorpay</dt>
                    <dd className="font-mono text-xs">{health.providers.recovery_gateway}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">AI</dt>
                    <dd className="font-mono text-xs">{health.providers.ai}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-muted">Notifications</dt>
                    <dd className="font-mono text-xs">{health.providers.notifications}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {!bothResolved || bothOk ? (
          <div className="flex items-center gap-1.5 text-body-small text-text-muted">
            <StatusDot state={!bothResolved ? "checking" : "ok"} />
            {!bothResolved ? "Checking…" : "Operational"}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-body-small text-text-muted">
            <span className="flex items-center gap-1.5">
              <StatusDot state={apiState} />
              API
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot state={dbState} />
              DB
            </span>
          </div>
        )}

        {user && (
          <>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="hidden text-sm text-text-muted sm:inline">{user.merchant_name}</span>
          </>
        )}

        <ThemeToggle />

        <Link
          to="/app/account"
          className="focus-ring flex h-7 w-7 items-center justify-center rounded bg-surface-raised text-xs font-medium text-text-muted transition-colors duration-150 hover:text-text"
          aria-label="Account"
        >
          {initials}
        </Link>
        <button
          onClick={logout}
          className="focus-ring text-xs text-text-muted transition-colors duration-150 hover:text-text"
        >
          Log out
        </button>
      </div>
    </header>
  );
}

function StatusDot({ state }: { state: CheckState }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        state === "ok" ? "bg-success" : state === "down" ? "bg-danger" : "bg-text-faint"
      }`}
      aria-hidden="true"
    />
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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-text">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-8 text-sm font-semibold tracking-tight">
          Recover<span className="text-accent">AI</span>
        </div>
        <h1 className="mb-6 text-heading">Log in</h1>

        {error && (
          <div className="mb-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

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

        <Button type="submit" variant="primary" disabled={submitting} className="w-full">
          {submitting ? "Logging in…" : "Log in"}
        </Button>

        <p className="mt-4 text-center text-sm text-text-muted">
          No account?{" "}
          <Link to="/register" className="focus-ring text-accent">
            Register
          </Link>
        </p>
      </form>
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
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12 text-text">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-8 text-sm font-semibold tracking-tight">
          Recover<span className="text-accent">AI</span>
        </div>
        <h1 className="mb-6 text-heading">Register</h1>

        {error && (
          <div className="mb-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

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

        <Button type="submit" variant="primary" disabled={submitting} className="w-full">
          {submitting ? "Creating account…" : "Register"}
        </Button>

        <p className="mt-4 text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link to="/login" className="focus-ring text-accent">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
RECOVERAI_EOF

mkdir -p "src/test"
cat > "src/test/test-utils.tsx" << 'RECOVERAI_EOF'
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";

/** Renders with routing + real auth + theme context — for anything that calls useAuth() or useTheme(). */
export function renderWithProviders(ui: ReactElement, initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}
RECOVERAI_EOF

mkdir -p "src/components/shell"
cat > "src/components/shell/TopBar.test.tsx" << 'RECOVERAI_EOF'
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { ThemeProvider } from "../../context/ThemeContext";
import { TopBar } from "./TopBar";
import * as api from "../../lib/api";
import type { HealthResponse } from "../../types/api";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getHealth: vi.fn(), getHealthDb: vi.fn(), getMe: vi.fn() };
});

const HEALTH: HealthResponse = {
  status: "ok",
  environment: "LOCAL",
  providers: { ai: "mock", recovery_gateway: "mock", notifications: "mock" },
};

function renderTopBar() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <TopBar onOpenNav={() => {}} />
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("TopBar system status", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(401, "no token"));
  });

  afterEach(() => {
    vi.mocked(api.getHealth).mockReset();
    vi.mocked(api.getHealthDb).mockReset();
    vi.mocked(api.getMe).mockReset();
  });

  it("shows a single merged Operational state when both checks pass", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });

    renderTopBar();

    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.queryByText("API")).not.toBeInTheDocument();
    expect(screen.queryByText("DB")).not.toBeInTheDocument();
  });

  it("shows two divergent dots — not a false Operational — when only the DB check fails", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.getHealthDb).mockRejectedValue(new api.ApiError(503, "db down"));

    renderTopBar();

    await waitFor(() => expect(screen.getByText("API")).toBeInTheDocument());
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
  });

  it("shows two divergent dots when only the API check fails", async () => {
    vi.mocked(api.getHealth).mockRejectedValue(new api.ApiError(0, "unreachable"));
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });

    renderTopBar();

    await waitFor(() => expect(screen.getByText("API")).toBeInTheDocument());
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
  });
});

describe("TopBar theme toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(401, "no token"));
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      environment: "LOCAL",
      providers: { ai: "mock", recovery_gateway: "mock", notifications: "mock" },
    });
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });
  });

  afterEach(() => {
    vi.mocked(api.getHealth).mockReset();
    vi.mocked(api.getHealthDb).mockReset();
    vi.mocked(api.getMe).mockReset();
    document.documentElement.removeAttribute("data-theme");
  });

  it("labels itself by the theme it switches to, and flips the document theme on click", async () => {
    const user = userEvent.setup();
    renderTopBar();

    const toggle = screen.getByRole("button", { name: "Switch to light theme" });
    await user.click(toggle);

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });
});
RECOVERAI_EOF

mkdir -p "src/components/shell"
cat > "src/components/shell/AppShell.test.tsx" << 'RECOVERAI_EOF'
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { ThemeProvider } from "../../context/ThemeContext";
import { AppShell } from "./AppShell";
import * as api from "../../lib/api";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getHealth: vi.fn(), getHealthDb: vi.fn(), getMe: vi.fn() };
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<div>Overview Page</div>} />
              <Route path="payments" element={<div>Payments Page</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("AppShell mobile navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(401, "no token"));
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      environment: "LOCAL",
      providers: { ai: "mock", recovery_gateway: "mock", notifications: "mock" },
    });
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });
  });

  afterEach(() => {
    vi.mocked(api.getMe).mockReset();
    vi.mocked(api.getHealth).mockReset();
    vi.mocked(api.getHealthDb).mockReset();
  });

  it("has no mobile nav open by default", () => {
    renderShell();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the drawer from the mobile menu trigger", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
  });

  it("closes the drawer automatically once a nav link changes the route", async () => {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // The drawer's own link list, not the desktop sidebar's
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    await userEvent.click(within(drawer).getByRole("link", { name: "Payments" }));

    await waitFor(() => expect(screen.getByText("Payments Page")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
RECOVERAI_EOF

echo "Overwrote 11 modified files."
