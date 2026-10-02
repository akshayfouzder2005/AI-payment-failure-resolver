#!/usr/bin/env bash
# public_experience_redesign_create_new_files.sh
# RecoverAI public experience redesign (/get-started, /login, /register).
# Builds on top of the design-system-v2 foundation pass -- apply that
# first if you haven't already. Creates NEW files only. Run from the
# repository's frontend/ directory.
set -euo pipefail

mkdir -p "src/lib"
cat > "src/lib/buttonClassName.ts" << 'RECOVERAI_EOF'
export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // text-on-accent, not text-canvas: canvas is the darkest neutral in
  // dark mode but the lightest in light mode, so it can't double as
  // "whatever contrasts against the accent fill" once a second theme
  // exists — see tailwind.config.js's on-accent token comment.
  primary: "bg-accent text-on-accent hover:bg-accent/90",
  secondary: "border border-border text-text hover:border-border-strong",
  quiet: "text-text-muted hover:text-text",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const BASE_CLASSES =
  "focus-ring inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Shared with anything that needs to *look* like a Button without being
 * one — e.g. a react-router `Link` styled as a primary action. Nesting a
 * real `<button>` inside an `<a>` (as GetStartedPage used to) is invalid,
 * nested-interactive markup; this lets a `Link` carry the exact same
 * classes directly instead.
 */
export function buttonClassName(variant: ButtonVariant = "secondary", className = ""): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`;
}
RECOVERAI_EOF

mkdir -p "src/pages"
cat > "src/pages/RegisterPage.test.tsx" << 'RECOVERAI_EOF'
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { RegisterPage } from "./RegisterPage";
import * as api from "../lib/api";
import type { MeResponse, TokenResponse } from "../types/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, register: vi.fn(), getMe: vi.fn() };
});

const TOKEN: TokenResponse = {
  access_token: "abc123",
  token_type: "bearer",
  user: { id: "u1", name: "Akshay", email: "akshay@example.com", merchant_id: "m1", is_active: true, created_at: "" },
};

const ME: MeResponse = {
  user_id: "u1",
  name: "Akshay",
  email: "akshay@example.com",
  merchant_id: "m1",
  merchant_name: "fouzder_stores",
};

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/app" element={<div>App Shell</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RegisterPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.mocked(api.register).mockReset();
    vi.mocked(api.getMe).mockReset();
  });

  it("registers and navigates to /app on success", async () => {
    vi.mocked(api.register).mockResolvedValue(TOKEN);
    vi.mocked(api.getMe).mockResolvedValue(ME);
    renderRegisterPage();

    await userEvent.type(screen.getByLabelText("Name"), "Akshay");
    await userEvent.type(screen.getByLabelText("Email"), "akshay@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(screen.getByLabelText("Merchant name"), "fouzder_stores");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(screen.getByText("App Shell")).toBeInTheDocument());
    expect(api.register).toHaveBeenCalledWith({
      name: "Akshay",
      email: "akshay@example.com",
      password: "password123",
      merchant_name: "fouzder_stores",
    });
  });

  it("shows the real backend error message and stays on the page when registration fails", async () => {
    vi.mocked(api.register).mockRejectedValue(new api.ApiError(409, "Email already registered"));
    renderRegisterPage();

    await userEvent.type(screen.getByLabelText("Name"), "Akshay");
    await userEvent.type(screen.getByLabelText("Email"), "taken@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(screen.getByLabelText("Merchant name"), "fouzder_stores");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email already registered");
    expect(screen.queryByText("App Shell")).not.toBeInTheDocument();
  });
});
RECOVERAI_EOF

echo "Created 2 new files."
