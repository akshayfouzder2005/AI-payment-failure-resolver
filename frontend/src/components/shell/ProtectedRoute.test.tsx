import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { ProtectedRoute } from "./ProtectedRoute";
import { setToken } from "../../lib/auth";
import * as api from "../../lib/api";
import type { MeResponse } from "../../types/api";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getMe: vi.fn() };
});

const ME: MeResponse = {
  user_id: "u1",
  name: "Akshay",
  email: "akshay@example.com",
  merchant_id: "m1",
  merchant_name: "fouzder_stores",
};

function renderProtected(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.mocked(api.getMe).mockReset();
  });

  it("redirects to /login when there is no stored token", async () => {
    renderProtected("/app");
    await waitFor(() => expect(screen.getByText("Login Page")).toBeInTheDocument());
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("shows a loading state while a stored token is being validated", async () => {
    setToken("valid-token");
    let resolveGetMe!: (value: MeResponse) => void;
    vi.mocked(api.getMe).mockReturnValue(new Promise((resolve) => (resolveGetMe = resolve)));

    renderProtected("/app");
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveGetMe(ME);
    await waitFor(() => expect(screen.getByText("Protected Content")).toBeInTheDocument());
  });

  it("renders the protected children once the token validates", async () => {
    setToken("valid-token");
    vi.mocked(api.getMe).mockResolvedValue(ME);

    renderProtected("/app");
    await waitFor(() => expect(screen.getByText("Protected Content")).toBeInTheDocument());
  });

  it("clears a dead token and redirects to /login when validation fails", async () => {
    setToken("dead-token");
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(401, "Invalid token"));

    renderProtected("/app");
    await waitFor(() => expect(screen.getByText("Login Page")).toBeInTheDocument());
    expect(localStorage.getItem("recoverai_token")).toBeNull();
  });
});
