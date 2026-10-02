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
