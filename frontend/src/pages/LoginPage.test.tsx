import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { LoginPage } from "./LoginPage";
import * as api from "../lib/api";
import type { MeResponse, TokenResponse } from "../types/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, login: vi.fn(), getMe: vi.fn() };
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

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<div>App Shell</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.mocked(api.login).mockReset();
    vi.mocked(api.getMe).mockReset();
  });

  it("navigates to /app after a successful login", async () => {
    vi.mocked(api.login).mockResolvedValue(TOKEN);
    vi.mocked(api.getMe).mockResolvedValue(ME);
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "akshay@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(screen.getByText("App Shell")).toBeInTheDocument());
    expect(localStorage.getItem("recoverai_token")).toBe("abc123");
  });

  it("shows the real backend error message and stays on the page when login fails", async () => {
    vi.mocked(api.login).mockRejectedValue(new api.ApiError(401, "Incorrect email or password"));
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "akshay@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
    expect(screen.queryByText("App Shell")).not.toBeInTheDocument();
  });
});
