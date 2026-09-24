import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { TopBar } from "./TopBar";
import * as api from "../../lib/api";
import type { HealthResponse } from "../../types/api";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getHealth: vi.fn(), getHealthDb: vi.fn(), getMe: vi.fn() };
});

const HEALTH: HealthResponse = {
  status: "ok",
  environment: "LOCAL",
  providers: { ai: "mock", recovery_gateway: "mock", notifications: "mock" },
};

function renderTopBar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TopBar onOpenNav={() => {}} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("TopBar system status", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getMe).mockRejectedValue(new api.ApiError(401, "no token"));
  });

  afterEach(() => {
    vi.mocked(api.getHealth).mockReset();
    vi.mocked(api.getHealthDb).mockReset();
    vi.mocked(api.getMe).mockReset();
  });

  it("shows a single merged Operational state when both checks pass", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });

    renderTopBar();

    await waitFor(() => expect(screen.getByText("Operational")).toBeInTheDocument());
    expect(screen.queryByText("API")).not.toBeInTheDocument();
    expect(screen.queryByText("DB")).not.toBeInTheDocument();
  });

  it("shows two divergent dots — not a false Operational — when only the DB check fails", async () => {
    vi.mocked(api.getHealth).mockResolvedValue(HEALTH);
    vi.mocked(api.getHealthDb).mockRejectedValue(new api.ApiError(503, "db down"));

    renderTopBar();

    await waitFor(() => expect(screen.getByText("API")).toBeInTheDocument());
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
  });

  it("shows two divergent dots when only the API check fails", async () => {
    vi.mocked(api.getHealth).mockRejectedValue(new api.ApiError(0, "unreachable"));
    vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });

    renderTopBar();

    await waitFor(() => expect(screen.getByText("API")).toBeInTheDocument());
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.queryByText("Operational")).not.toBeInTheDocument();
  });
});
