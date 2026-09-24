import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { AppShell } from "./AppShell";
import * as api from "../../lib/api";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getHealth: vi.fn(), getHealthDb: vi.fn(), getMe: vi.fn() };
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <AuthProvider>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<div>Overview Page</div>} />
            <Route path="payments" element={<div>Payments Page</div>} />
          </Route>
        </Routes>
      </AuthProvider>
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
