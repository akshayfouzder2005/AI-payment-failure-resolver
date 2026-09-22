import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-canvas hover:bg-accent/90",
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
