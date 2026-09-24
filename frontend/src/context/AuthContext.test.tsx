import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";
import { setToken } from "../lib/auth";
import * as api from "../lib/api";
import type { MeResponse } from "../types/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, getMe: vi.fn(), login: vi.fn() };
});

const ME: MeResponse = {
  user_id: "u1",
  name: "Akshay",
  email: "akshay@example.com",
  merchant_id: "m1",
  merchant_name: "fouzder_stores",
};

function Probe() {
  const { status, user, login } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="user">{user?.name ?? "none"}</div>
      <button onClick={() => login("akshay@example.com", "password123").catch(() => {})}>Log in</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.mocked(api.getMe).mockReset();
    vi.mocked(api.login).mockReset();
  });

  it("restores an authenticated session from a valid stored token", async () => {
    setToken("valid-token");
    vi.mocked(api.getMe).mockResolvedValue(ME);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("Akshay");
  });

  it("logs out from anywhere in the app when a recoverai:unauthorized event fires", async () => {
    setToken("valid-token");
    vi.mocked(api.getMe).mockResolvedValue(ME);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    // This is what lib/api.ts fires on any authenticated request's 401 —
    // simulating a token dying mid-session, not just on initial load.
    window.dispatchEvent(new Event("recoverai:unauthorized"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("does not treat a failed login as a session-expiry event", async () => {
    vi.mocked(api.login).mockRejectedValue(new api.ApiError(401, "Incorrect email or password"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));

    await userEvent.click(screen.getByText("Log in"));

    // A wrong password must not flip status away from the normal
    // logged-out state or throw unhandled — it's a rejected promise the
    // caller (LoginPage) is expected to catch.
    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
  });
});
