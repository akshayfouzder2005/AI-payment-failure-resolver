/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // --- Quiet Instrumentation color tokens (see design spec) ---
      colors: {
        canvas: "#0B0C0E",
        surface: "#131417",
        "surface-raised": "#191B1F",
        border: {
          DEFAULT: "#26282D",
          strong: "#3A3D44",
        },
        text: {
          DEFAULT: "#F2EFE9",
          muted: "#9A968C",
          faint: "#65625B",
        },
        accent: {
          DEFAULT: "#C9973F",
          muted: "rgba(201, 151, 63, 0.12)",
        },
        success: "#5FA579",
        warning: "#C9973F",
        danger: "#C4544B",
        info: "#6E8CA0",
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
