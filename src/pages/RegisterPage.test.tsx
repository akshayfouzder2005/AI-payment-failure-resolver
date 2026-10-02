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
