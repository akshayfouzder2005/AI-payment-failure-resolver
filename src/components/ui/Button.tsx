import type { ButtonHTMLAttributes } from "react";
import { buttonClassName, type ButtonVariant } from "../../lib/buttonClassName";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}
